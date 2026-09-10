import { of } from 'rxjs';
import { GithubAppService } from './github-app.service';

describe('GitHub installation reuse', () => {
  const userId = '507f1f77bcf86cd799439011';
  const installation = { id: 42, app_id: 123, account: { login: 'owner', type: 'User' } };
  let pending: { userId: string; repositoryFullName?: string; selectionAttempted?: boolean } | null;
  let createState: jest.Mock;
  let consume: jest.Mock;
  let save: jest.Mock;
  let get: jest.Mock;
  let service: GithubAppService;
  let exchange: jest.SpyInstance;
  let installations: jest.SpyInstance;
  beforeEach(() => {
    pending = { userId, repositoryFullName: 'owner/private-repo' };
    createState = jest.fn().mockResolvedValue({});
    consume = jest.fn(() => ({ exec: async () => { const result = pending; pending = null; return result; } }));
    save = jest.fn(() => ({ exec: async () => ({}) }));
    get = jest.fn().mockReturnValue(of({ data: { repositories: [{ full_name: 'owner/private-repo' }], total_count: 1 } }));
    service = new GithubAppService({ findOneAndUpdate: save } as never, { create: createState, findOneAndDelete: consume } as never, { get } as never,
      { get: (name: string) => ({ GITHUB_APP_ID: '123', GITHUB_APP_SLUG: 'test-app', GITHUB_APP_CLIENT_ID: 'test-client', GITHUB_APP_CLIENT_SECRET: 'test-secret' })[name] } as never);
    const internal = service as unknown as {
      exchangeUserCode(code: string): Promise<string>;
      findUserInstallations(token: string): Promise<typeof installation[]>;
      getInstallationAsApp(id: number): Promise<typeof installation>;
    };
    exchange = jest.spyOn(internal, 'exchangeUserCode').mockResolvedValue('test-oauth-token');
    installations = jest.spyOn(internal, 'findUserInstallations').mockResolvedValue([installation]);
    jest.spyOn(internal, 'getInstallationAsApp').mockResolvedValue(installation);
  });

  it('carries repository context in hashed state without including the PR in the GitHub URL', async () => {
    const result = await service.createConnectUrl(userId, 'https://github.com/owner/private-repo/pull/1');
    expect(result.url).toContain('/login/oauth/authorize?');
    expect(result.url).not.toContain('private-repo');
    expect(createState).toHaveBeenCalledWith(expect.objectContaining({ repositoryFullName: 'owner/private-repo', stateHash: expect.stringMatching(/^[a-f0-9]{64}$/), selectionAttempted: false }));
    expect(String(createState.mock.calls[0][0].userId)).toBe(userId);
  });

  it('reuses an existing selected installation only after OAuth and app verification', async () => {
    await expect(service.completeAuthorization('code', 'state')).resolves.toEqual({ connected: true });
    expect(exchange).toHaveBeenCalledWith('code');
    expect(get).toHaveBeenCalledWith('https://api.github.com/user/installations/42/repositories', expect.objectContaining({ params: { per_page: 100, page: 1 } }));
    expect(save).toHaveBeenCalledWith({ userId, installationId: 42 }, expect.anything(), expect.anything());
    expect(createState).not.toHaveBeenCalled();
    await expect(service.completeAuthorization('code', 'state')).rejects.toThrow('state is invalid or expired');
  });

  it('requests repository selection only when the requested repository is missing', async () => {
    get.mockReturnValue(of({ data: { repositories: [], total_count: 0 } }));
    const result = await service.completeAuthorization('code', 'state');
    expect(result).toMatchObject({ connected: false, url: expect.stringContaining('/apps/test-app/installations/new?state=') });
    expect(createState).toHaveBeenCalledWith(expect.objectContaining({ repositoryFullName: 'owner/private-repo', selectionAttempted: true }));
    expect(save).not.toHaveBeenCalled();
  });

  it('starts installation if none exists, retaining the original user and repository', async () => {
    installations.mockResolvedValue([]);
    const result = await service.completeAuthorization('code', 'state');
    expect(result.connected).toBe(false);
    expect(String(createState.mock.calls[0][0].userId)).toBe(userId);
    expect(createState.mock.calls[0][0].repositoryFullName).toBe('owner/private-repo');
  });

  it('does not loop through repository selection if access is still missing on return', async () => {
    pending!.selectionAttempted = true;
    get.mockReturnValue(of({ data: { repositories: [], total_count: 0 } }));
    await expect(service.completeAuthorization('code', 'state')).rejects.toMatchObject({ status: 403 });
    expect(createState).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('does not treat an upstream failure as a reason to select repositories again', async () => {
    get.mockImplementation(() => { throw new Error('upstream failure'); });
    await expect(service.completeAuthorization('code', 'state')).rejects.toThrow('upstream failure');
    expect(createState).not.toHaveBeenCalled();
  });

  it('checks later repository pages before asking for selection', async () => {
    get.mockReturnValueOnce(of({ data: { repositories: Array.from({ length: 100 }, (_, index) => ({ full_name: `owner/repo-${index}` })), total_count: 101 } }));
    await expect(service.completeAuthorization('code', 'state')).resolves.toEqual({ connected: true });
    expect(get).toHaveBeenCalledTimes(2);
    expect(createState).not.toHaveBeenCalled();
  });

  it('does not associate an installation unavailable to the authorizing GitHub user', async () => {
    await expect(service.completeAuthorization('code', 'state', '99')).rejects.toMatchObject({ status: 403 });
    expect(save).not.toHaveBeenCalled();
  });
});
