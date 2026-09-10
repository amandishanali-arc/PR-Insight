import { Logger } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { of, throwError } from 'rxjs';
import { GithubAppService } from './github-app.service';

jest.mock('node:fs', () => ({ ...jest.requireActual('node:fs'), readFileSync: jest.fn() }));

describe('GitHub App private access diagnostics', () => {
  const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const userId = '507f1f77bcf86cd799439011';
  let values: Record<string, string>;
  let connections: Array<{ installationId: number; accountLogin: string }>;
  let service: GithubAppService;
  let get: jest.Mock;
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  type Internals = { loadPrivateKey(): string; createAppAuthenticator(): Promise<jest.Mock> };
  const internals = () => service as unknown as Internals;

  beforeEach(() => {
    values = { GITHUB_APP_ID: '123' };
    connections = [{ installationId: 42, accountLogin: 'owner' }];
    get = jest.fn().mockReturnValue(of({ data: {} }));
    service = new GithubAppService(
      { find: () => ({ lean: () => ({ exec: async () => connections }) }) } as never,
      {} as never, { get } as never, { get: (name: string) => values[name] } as never,
    );
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.mocked(readFileSync).mockReset();
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([pem, pem.replace(/\n/g, '\\n'), pem.replace(/\n/g, '\\r\\n')])('accepts PEM environment formats without reading the file', (key) => {
    values.GITHUB_APP_PRIVATE_KEY = key;
    values.GITHUB_APP_PRIVATE_KEY_PATH = 'local-only.pem';
    expect(internals().loadPrivateKey().trim()).toBe(pem.trim());
    expect(readFileSync).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain('BEGIN PRIVATE KEY');
  });

  it('preserves the local file fallback', () => {
    values.GITHUB_APP_PRIVATE_KEY_PATH = 'local-only.pem';
    jest.mocked(readFileSync).mockReturnValue(pem);
    expect(internals().loadPrivateKey()).toBe(pem);
    expect(readFileSync).toHaveBeenCalledWith('local-only.pem', 'utf8');
  });

  it('distinguishes missing, unreadable, and invalid keys without leaking error contents', () => {
    expect(() => internals().loadPrivateKey()).toThrow('not configured');
    values.GITHUB_APP_PRIVATE_KEY_PATH = 'secret-path';
    jest.mocked(readFileSync).mockImplementation(() => { throw new Error('sensitive-file-details'); });
    expect(() => internals().loadPrivateKey()).toThrow('could not be loaded');
    values.GITHUB_APP_PRIVATE_KEY = 'invalid-secret-key';
    expect(() => internals().loadPrivateKey()).toThrow('is invalid');
    expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls])).not.toMatch(/secret-path|sensitive-file-details|invalid-secret-key/);
  });

  it('reports missing app configuration as 503', async () => {
    delete values.GITHUB_APP_ID;
    await expect(service.getRepositoryToken(userId, 'owner', 'repo')).rejects.toMatchObject({ status: 503 });
  });

  it('distinguishes no connection from no matching account', async () => {
    connections = [];
    await expect(service.getRepositoryToken(userId, 'owner', 'repo')).rejects.toThrow('No GitHub connection');
    connections = [{ installationId: 42, accountLogin: 'other' }];
    await expect(service.getRepositoryToken(userId, 'owner', 'repo')).rejects.toThrow('No connected GitHub App installation matches');
  });

  it.each([[401, 502], [403, 403], [404, 403], [422, 403], [429, 429], [500, 503], [undefined, 502]])('differentiates token failure %s and omits raw error data', async (status, expected) => {
    const auth = jest.fn().mockRejectedValue({ status, message: 'secret-token', request: { headers: { authorization: 'secret-token' } } });
    jest.spyOn(internals(), 'createAppAuthenticator').mockResolvedValue(auth);
    await expect(service.getRepositoryToken(userId, 'owner', 'repo')).rejects.toMatchObject({ status: expected });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-token');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('installation_token'));
  });

  it('distinguishes a repository 404 after token generation', async () => {
    jest.spyOn(internals(), 'createAppAuthenticator').mockResolvedValue(jest.fn().mockResolvedValue({ token: 'secret-token' }));
    get.mockReturnValue(throwError(() => ({ response: { status: 404 } })));
    await expect(service.getRepositoryToken(userId, 'owner', 'repo')).rejects.toMatchObject({ status: 404 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('repository_access'));
  });

  it('continues to another matching installation after a failed token request', async () => {
    connections.push({ installationId: 43, accountLogin: 'owner' });
    const auth = jest.fn().mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce({ token: 'secret-token' });
    jest.spyOn(internals(), 'createAppAuthenticator').mockResolvedValue(auth);
    await expect(service.getRepositoryToken(userId, 'owner', 'repo')).resolves.toBe('secret-token');
    expect(auth).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls])).not.toContain('secret-token');
  });
});
