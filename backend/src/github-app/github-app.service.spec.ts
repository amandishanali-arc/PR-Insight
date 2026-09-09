import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GithubAppService } from './github-app.service';
import { of } from 'rxjs';

const userId = '507f1f77bcf86cd799439011';

describe('GithubAppService', () => {
  const connectionExec = jest.fn();
  const stateExec = jest.fn();
  const connectionModel = {
    findOneAndUpdate: jest.fn(() => ({ exec: connectionExec })),
    find: jest.fn(),
    deleteMany: jest.fn(),
  };
  const stateModel = {
    create: jest.fn(),
    findOneAndDelete: jest.fn(() => ({ exec: stateExec })),
  };
  const httpService = { get: jest.fn(), post: jest.fn() };
  const config = {
    get: jest.fn((name: string) => ({
      GITHUB_APP_SLUG: 'pr-insight-test',
      GITHUB_APP_CLIENT_ID: 'client-id',
      GITHUB_APP_CLIENT_SECRET: 'client-secret',
      GITHUB_APP_ID: '123',
    })[name]),
  };

  let service: GithubAppService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GithubAppService(connectionModel as never, stateModel as never, httpService as never, config as never);
  });

  it('creates a short-lived, hashed state and never stores the raw state', async () => {
    const result = await service.createConnectUrl(userId);
    const state = new URL(result.url).searchParams.get('state');

    expect(state).toBeTruthy();
    expect(stateModel.create).toHaveBeenCalledWith(expect.objectContaining({
      stateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresAt: expect.any(Date),
    }));
    expect(stateModel.create.mock.calls[0][0].stateHash).not.toBe(state);
  });

  it('starts OAuth directly so an already-installed app can be connected', async () => {
    const result = await service.createConnectUrl(userId);

    expect(result.url).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    expect(new URL(result.url).searchParams.get('client_id')).toBe('client-id');
  });

  it('rejects a callback without all OAuth verification parameters', async () => {
    await expect(service.completeAuthorization(undefined, 'state')).rejects.toBeInstanceOf(BadRequestException);
    expect(connectionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an installation not available to the authorizing GitHub user', async () => {
    stateExec.mockResolvedValue({ userId });
    const internals = service as unknown as {
      exchangeUserCode(code: string): Promise<string>;
      findUserInstallations(token: string): Promise<never[]>;
    };
    jest.spyOn(internals, 'exchangeUserCode').mockResolvedValue('temporary-user-token');
    jest.spyOn(internals, 'findUserInstallations').mockResolvedValue([]);

    await expect(service.completeAuthorization('code', 'state', '42')).rejects.toBeInstanceOf(ForbiddenException);
    expect(connectionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('stores only verified installation metadata, never OAuth or installation tokens', async () => {
    stateExec.mockResolvedValue({ userId });
    connectionExec.mockResolvedValue({});
    const installation = { id: 42, app_id: 123, account: { login: 'octocat', type: 'User' } };
    const internals = service as unknown as {
      exchangeUserCode(code: string): Promise<string>;
      findUserInstallations(token: string): Promise<typeof installation[]>;
      getInstallationAsApp(installationId: number): Promise<typeof installation>;
    };
    jest.spyOn(internals, 'exchangeUserCode').mockResolvedValue('temporary-user-token');
    jest.spyOn(internals, 'findUserInstallations').mockResolvedValue([installation]);
    jest.spyOn(internals, 'getInstallationAsApp').mockResolvedValue(installation);

    await expect(service.completeAuthorization('code', 'state')).resolves.toEqual({ connected: true });

    const update = connectionModel.findOneAndUpdate.mock.calls[0][1];
    expect(update).toEqual({ $set: { accountLogin: 'octocat', accountType: 'User' } });
    expect(JSON.stringify(update)).not.toContain('token');
    expect(connectionModel.findOneAndUpdate.mock.calls[0][2]).toEqual(
      expect.objectContaining({ upsert: true }),
    );
  });

  it('looks up installations only for the current PR Insight user and does not persist the generated token', async () => {
    const findExec = jest.fn().mockResolvedValue([{ installationId: 42 }]);
    connectionModel.find.mockReturnValue({ lean: () => ({ exec: findExec }) });
    httpService.get.mockReturnValue(of({ data: { id: 1 } }));
    const auth = jest.fn().mockResolvedValue({ token: 'short-lived-token' });
    const internals = service as unknown as { createAppAuthenticator(): Promise<typeof auth> };
    jest.spyOn(internals, 'createAppAuthenticator').mockResolvedValue(auth);

    await expect(service.getRepositoryToken(userId, 'octocat', 'private-repo'))
      .resolves.toBe('short-lived-token');

    expect(connectionModel.find).toHaveBeenCalledWith({ userId: expect.objectContaining({}) });
    expect(auth).toHaveBeenCalledWith({ type: 'installation', installationId: 42, repositoryNames: ['private-repo'] });
    expect(connectionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
