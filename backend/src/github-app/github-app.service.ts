import { BadGatewayException, BadRequestException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, createPrivateKey, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Model, Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { GithubConnection, GithubConnectionDocument } from './schemas/github-connection.schema';
import { GithubConnectState, GithubConnectStateDocument } from './schemas/github-connect-state.schema';

interface InstallationInfo {
  id: number;
  app_id: number;
  account: { login: string; type: string };
}

interface UserInstallationsResponse {
  total_count: number;
  installations: InstallationInfo[];
}

interface GithubTokenResponse { access_token?: string; error?: string }
interface AppAuthResult { token: string }
type AppAuth = (options: { type: 'app' } | { type: 'installation'; installationId: number; repositoryNames?: string[] }) => Promise<AppAuthResult>;

@Injectable()
export class GithubAppService {
  private readonly logger = new Logger(GithubAppService.name);
  constructor(
    @InjectModel(GithubConnection.name) private readonly connectionModel: Model<GithubConnectionDocument>,
    @InjectModel(GithubConnectState.name) private readonly stateModel: Model<GithubConnectStateDocument>,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async createConnectUrl(userId: string, pullRequestUrl?: string): Promise<{ url: string }> {
    let repositoryFullName: string | undefined;
    if (pullRequestUrl) {
      const match = typeof pullRequestUrl === 'string' && pullRequestUrl.trim().match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/\d+\/?$/);
      if (!match) throw new BadRequestException('Enter a valid GitHub pull request URL before connecting.');
      repositoryFullName = `${match[1]}/${match[2]}`;
    }
    const state = await this.createState(userId, repositoryFullName);
    const params = new URLSearchParams({
      client_id: this.requiredConfig('GITHUB_APP_CLIENT_ID'),
      state,
    });
    this.requiredConfig('GITHUB_APP_CLIENT_SECRET');
    return { url: `https://github.com/login/oauth/authorize?${params.toString()}` };
  }

  async completeAuthorization(
    code: string | undefined,
    state: string | undefined,
    installationIdValue?: string,
  ): Promise<{ connected: boolean; url?: string }> {
    if (!code || !state) throw new BadRequestException('Invalid GitHub authorization callback');
    if (installationIdValue && !/^\d+$/.test(installationIdValue)) {
      throw new BadRequestException('Invalid GitHub installation identifier');
    }

    const pendingState = await this.stateModel.findOneAndDelete({
      stateHash: this.hashState(state),
      expiresAt: { $gt: new Date() },
    }).exec();
    if (!pendingState) throw new BadRequestException('GitHub connection state is invalid or expired');

    const userToken = await this.exchangeUserCode(code);
    const requestedInstallationId = installationIdValue ? Number(installationIdValue) : undefined;
    const appId = Number(this.requiredConfig('GITHUB_APP_ID'));
    const userInstallations = (await this.findUserInstallations(userToken))
      .filter((installation) => installation.app_id === appId)
      .filter((installation) => requestedInstallationId === undefined || installation.id === requestedInstallationId);

    if (requestedInstallationId !== undefined && userInstallations.length === 0) {
      throw new ForbiddenException('The GitHub installation does not belong to the authorizing user');
    }

    const repositoryAccessible = !pendingState.repositoryFullName || await this.hasUserRepository(userToken, userInstallations, pendingState.repositoryFullName);
    if (userInstallations.length === 0 || !repositoryAccessible) {
      if (pendingState.selectionAttempted) {
        throw new ForbiddenException('The requested repository is not available to the authorized GitHub installation.');
      }
      const installState = await this.createState(pendingState.userId.toString(), pendingState.repositoryFullName, true);
      const slug = this.requiredConfig('GITHUB_APP_SLUG');
      return {
        connected: false,
        url: `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(installState)}`,
      };
    }

    for (const userInstallation of userInstallations) {
      const verifiedInstallation = await this.getInstallationAsApp(userInstallation.id);
      if (verifiedInstallation.id !== userInstallation.id || verifiedInstallation.app_id !== appId) {
        throw new ForbiddenException('GitHub installation verification failed');
      }

      await this.connectionModel.findOneAndUpdate(
        { userId: pendingState.userId, installationId: verifiedInstallation.id },
        {
          $set: {
            accountLogin: verifiedInstallation.account.login,
            accountType: verifiedInstallation.account.type,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).exec();
    }

    return { connected: true };
  }

  async status(userId: string) {
    const connections = await this.connectionModel.find({ userId: new Types.ObjectId(userId) }).select({ installationId: 1, accountLogin: 1, accountType: 1 }).lean().exec();
    return {
      connected: connections.length > 0,
      installations: connections.map((connection) => ({
        installationId: connection.installationId,
        accountLogin: connection.accountLogin,
        accountType: connection.accountType,
      })),
    };
  }

  async disconnect(userId: string): Promise<{ disconnected: boolean }> {
    const result = await this.connectionModel.deleteMany({ userId: new Types.ObjectId(userId) }).exec();
    return { disconnected: result.deletedCount > 0 };
  }

  async getRepositoryToken(userId: string, owner: string, repository: string): Promise<string | null> {
    const connections = await this.connectionModel.find({ userId: new Types.ObjectId(userId) }).lean().exec();
    this.logger.log(JSON.stringify({ event: 'github_private_access', owner, repository, connectionExists: connections.length > 0 }));
    if (!connections.length) throw new ForbiddenException('No GitHub connection found. Connect GitHub to access private repositories.');
    const candidates = connections.filter((connection) => !connection.accountLogin || connection.accountLogin.toLowerCase() === owner.toLowerCase());
    if (!candidates.length) throw new ForbiddenException('No connected GitHub App installation matches this repository owner. Install or connect the app for this account.');
    const auth = await this.createAppAuthenticator();
    let failure: HttpException | undefined;
    for (const connection of candidates) {
      let stage = 'installation_token';
      try {
        if (!Number.isSafeInteger(connection.installationId) || connection.installationId <= 0) {
          this.logger.warn(JSON.stringify({ event: 'github_private_access_failed', code: 'installation_id_missing_or_invalid', owner, repository }));
          failure ??= new ForbiddenException('The saved GitHub installation is invalid. Reconnect GitHub.');
          continue;
        }
        const result = await auth({ type: 'installation', installationId: connection.installationId, repositoryNames: [repository] });
        stage = 'repository_access';
        await firstValueFrom(this.httpService.get(`https://api.github.com/repos/${owner}/${repository}`, { headers: this.githubHeaders(result.token), timeout: 15_000 }));
        this.logger.log(JSON.stringify({ event: 'github_private_access_granted', owner, repository, installationId: connection.installationId }));
        return result.token;
      } catch (error: unknown) {
        // Never log raw errors: Octokit/Axios errors can contain authorization headers.
        const upstream = error as { status?: unknown; response?: { status?: unknown } } | null;
        const value = upstream?.response?.status ?? upstream?.status;
        const status = typeof value === 'number' ? value : undefined;
        this.logger.warn(JSON.stringify({ event: 'github_private_access_failed', stage, owner, repository, installationId: connection.installationId, githubStatus: status ?? null }));
        let current: HttpException;
        if (status === 401) current = new BadGatewayException('GitHub rejected the app credentials. The server GitHub App configuration must be checked.');
        else if (status === 403) current = new ForbiddenException('GitHub denied app access. Check installation permissions, suspension, and API rate limits.');
        else if (status === 404 && stage === 'installation_token') current = new ForbiddenException('The GitHub installation is unavailable or no longer valid for this app. Reconnect GitHub.');
        else if (status === 404) current = new NotFoundException('The repository was not found or is not accessible to this GitHub installation. Check the repository URL and selected repositories.');
        else if (status === 422) current = new ForbiddenException('GitHub could not grant access to the requested repository. Check that it is selected for this installation and still exists.');
        else if (status === 429) current = new HttpException('GitHub API rate limit reached. Try again later.', 429);
        else if (status && status >= 500) current = new ServiceUnavailableException('GitHub is temporarily unavailable. Please try again.');
        else current = new BadGatewayException(stage === 'installation_token' ? 'GitHub installation token generation failed. The server GitHub App configuration must be checked.' : 'GitHub repository access failed. Please try again.');
        // Try every matching installation; retain infrastructure failures over access failures.
        if (!failure || current.getStatus() >= 500) failure = current;
      }
    }
    throw failure ?? new ForbiddenException('No accessible GitHub installation was found for this repository.');
  }

  private async exchangeUserCode(code: string): Promise<string> {
    const response = await firstValueFrom(this.httpService.post<GithubTokenResponse>(
      'https://github.com/login/oauth/access_token',
      {
        client_id: this.requiredConfig('GITHUB_APP_CLIENT_ID'),
        client_secret: this.requiredConfig('GITHUB_APP_CLIENT_SECRET'),
        code,
      },
      { headers: { Accept: 'application/json' }, timeout: 15_000 },
    ));
    if (!response.data.access_token) throw new BadGatewayException('GitHub user authorization could not be completed');
    return response.data.access_token;
  }

  private async findUserInstallations(userToken: string): Promise<InstallationInfo[]> {
    const installations: InstallationInfo[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const response = await firstValueFrom(this.httpService.get<UserInstallationsResponse>(
        'https://api.github.com/user/installations',
        { headers: this.githubHeaders(userToken), params: { per_page: 100, page }, timeout: 15_000 },
      ));
      installations.push(...response.data.installations);
      if (response.data.installations.length < 100) break;
    }
    return installations;
  }

  private async getInstallationAsApp(installationId: number): Promise<InstallationInfo> {
    const auth = await this.createAppAuthenticator();
    const appAuthentication = await auth({ type: 'app' });
    const response = await firstValueFrom(this.httpService.get<InstallationInfo>(
      `https://api.github.com/app/installations/${installationId}`,
      { headers: this.githubHeaders(appAuthentication.token), timeout: 15_000 },
    ));
    return response.data;
  }

  private async hasUserRepository(userToken: string, installations: InstallationInfo[], fullName: string): Promise<boolean> {
    const owner = fullName.split('/')[0].toLowerCase();
    for (const installation of installations.filter((item) => item.account.login.toLowerCase() === owner)) {
      for (let page = 1; page <= 100; page += 1) {
        const response = await firstValueFrom(this.httpService.get<{ repositories: { full_name: string }[]; total_count: number }>(
          `https://api.github.com/user/installations/${installation.id}/repositories`,
          { headers: this.githubHeaders(userToken), params: { per_page: 100, page }, timeout: 15_000 },
        ));
        if (response.data.repositories.some((repo) => repo.full_name.toLowerCase() === fullName.toLowerCase())) return true;
        if (response.data.repositories.length < 100 || page * 100 >= response.data.total_count) break;
        if (page === 100) throw new ServiceUnavailableException('Repository verification could not be completed. Please try again.');
      }
    }
    return false;
  }

  private async createAppAuthenticator(): Promise<AppAuth> {
    const appId = this.config.get<string>('GITHUB_APP_ID')?.trim();
    if (!appId || !/^\d+$/.test(appId)) {
      this.logger.warn('github_app_configuration_missing_or_invalid: GITHUB_APP_ID');
      throw new ServiceUnavailableException('GitHub App configuration is missing or invalid. Contact the administrator.');
    }
    const privateKey = this.loadPrivateKey();
    const { createAppAuth } = await import('@octokit/auth-app');
    return createAppAuth({ appId, privateKey }) as AppAuth;
  }

  private loadPrivateKey(): string {
    const environmentKey = this.config.get<string>('GITHUB_APP_PRIVATE_KEY')?.trim();
    const path = this.config.get<string>('GITHUB_APP_PRIVATE_KEY_PATH')?.trim();
    const source = environmentKey ? 'environment' : path ? 'file' : 'none';
    this.logger.log(JSON.stringify({ event: 'github_app_key_configuration', configured: source !== 'none', source }));
    if (source === 'none') {
      this.logger.warn('github_app_private_key_missing');
      throw new ServiceUnavailableException('GitHub App private key is not configured. Contact the administrator.');
    }
    let privateKey: string;
    try {
      privateKey = (environmentKey || readFileSync(path!, 'utf8')).replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
    } catch {
      this.logger.warn('github_app_private_key_file_unreadable');
      throw new ServiceUnavailableException('GitHub App private key could not be loaded. Contact the administrator.');
    }
    try {
      if (createPrivateKey(privateKey).asymmetricKeyType !== 'rsa') throw new Error();
    } catch {
      this.logger.warn('github_app_private_key_invalid');
      throw new ServiceUnavailableException('GitHub App private key is invalid. Contact the administrator.');
    }
    return privateKey;
  }

  private githubHeaders(token: string) {
    return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  }

  private hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }

  private async createState(userId: string, repositoryFullName?: string, selectionAttempted = false): Promise<string> {
    const state = randomBytes(32).toString('base64url');
    await this.stateModel.create({
      userId: new Types.ObjectId(userId),
      stateHash: this.hashState(state),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      ...(repositoryFullName ? { repositoryFullName } : {}),
      selectionAttempted,
    });
    return state;
  }

  private requiredConfig(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value) throw new Error(`${name} is not configured`);
    return value;
  }
}
