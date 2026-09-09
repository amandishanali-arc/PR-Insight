import { BadGatewayException, BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
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
  constructor(
    @InjectModel(GithubConnection.name) private readonly connectionModel: Model<GithubConnectionDocument>,
    @InjectModel(GithubConnectState.name) private readonly stateModel: Model<GithubConnectStateDocument>,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async createConnectUrl(userId: string): Promise<{ url: string }> {
    const state = await this.createState(userId);
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

    if (userInstallations.length === 0) {
      const installState = await this.createState(pendingState.userId.toString());
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
    for (const connection of connections) {
      try {
        const auth = await this.createAppAuthenticator();
        const result = await auth({ type: 'installation', installationId: connection.installationId, repositoryNames: [repository] });
        await firstValueFrom(this.httpService.get(`https://api.github.com/repos/${owner}/${repository}`, { headers: this.githubHeaders(result.token), timeout: 15_000 }));
        return result.token;
      } catch {
        // This installation may belong to another account or lack this selected repository.
      }
    }
    return null;
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

  private async createAppAuthenticator(): Promise<AppAuth> {
    const { createAppAuth } = await import('@octokit/auth-app');
    const privateKeyPath = this.requiredConfig('GITHUB_APP_PRIVATE_KEY_PATH');
    const privateKey = readFileSync(privateKeyPath, 'utf8');
    return createAppAuth({ appId: this.requiredConfig('GITHUB_APP_ID'), privateKey }) as AppAuth;
  }

  private githubHeaders(token: string) {
    return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  }

  private hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }

  private async createState(userId: string): Promise<string> {
    const state = randomBytes(32).toString('base64url');
    await this.stateModel.create({
      userId: new Types.ObjectId(userId),
      stateHash: this.hashState(state),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    return state;
  }

  private requiredConfig(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value) throw new Error(`${name} is not configured`);
    return value;
  }
}
