import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GithubAppController } from './github-app.controller';

describe('GithubAppController security', () => {
  it.each(['connect', 'status', 'disconnect'] as const)('protects %s with JWT authentication', (method) => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, GithubAppController.prototype[method]) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('keeps setup public because it is verified with one-time state and GitHub OAuth', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, GithubAppController.prototype.setup) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('redirects a successful callback to the frontend analyze route', async () => {
    const githubAppService = {
      completeAuthorization: jest.fn().mockResolvedValue({ connected: true }),
    };
    const config = { get: jest.fn().mockReturnValue('http://localhost:5173') };
    const controller = new GithubAppController(githubAppService as never, config as never);

    await expect(controller.setup('code', 'state')).resolves.toEqual({
      url: 'http://localhost:5173/?github=connected#analyze',
      statusCode: 302,
    });
  });

  it('continues to installation when the authorized user has no installation yet', async () => {
    const githubAppService = {
      completeAuthorization: jest.fn().mockResolvedValue({
        connected: false,
        url: 'https://github.com/apps/pr-insight/installations/new?state=new-state',
      }),
    };
    const controller = new GithubAppController(githubAppService as never, { get: jest.fn() } as never);

    await expect(controller.setup('code', 'state')).resolves.toEqual({
      url: 'https://github.com/apps/pr-insight/installations/new?state=new-state',
      statusCode: 302,
    });
  });
});
