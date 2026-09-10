import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GithubAppController } from './github-app.controller';

describe('GithubAppController security', () => {
  it.each([
    [new Error('do-not-expose-token'), 'unavailable'],
    [new BadRequestException('invalid state'), 'authorization'],
    [new ForbiddenException('repository unavailable'), 'repository_access'],
  ])('returns safe errors to the configured production frontend (%s)', async (error, reason) => {
    const controller = new GithubAppController({ completeAuthorization: jest.fn().mockRejectedValue(error) } as never,
      new ConfigService({ FRONTEND_URL: 'https://frontend.example.com/', NODE_ENV: 'production' }));
    await expect(controller.setup('secret-code', 'secret-state')).resolves.toEqual({
      url: `https://frontend.example.com/?github=error&reason=${reason}#analyze`, statusCode: 302,
    });
  });

  it('refuses a localhost fallback when production FRONTEND_URL is missing', async () => {
    const controller = new GithubAppController({} as never,
      { get: (name: string) => name === 'NODE_ENV' ? 'production' : undefined } as never);
    await expect(controller.setup('code', 'state')).rejects.toMatchObject({ status: 503 });
  });

  it('rejects an explicitly configured localhost frontend in production', async () => {
    const controller = new GithubAppController({} as never,
      new ConfigService({ FRONTEND_URL: 'http://localhost:5173', NODE_ENV: 'production' }));
    await expect(controller.setup('code', 'state')).rejects.toMatchObject({ status: 503 });
  });
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

  it.each([
    ['https://frontend.example.com', 'https://frontend.example.com'],
    [' https://frontend.example.com/ ', 'https://frontend.example.com'],
    [undefined, 'http://localhost:5173'],
    ['', 'http://localhost:5173'],
    ['   ', 'http://localhost:5173'],
  ])('uses FRONTEND_URL=%s from the environment with a local fallback', async (value, expectedOrigin) => {
    const previous = process.env.FRONTEND_URL;
    try {
      if (value === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = value;
      const githubAppService = {
        completeAuthorization: jest.fn().mockResolvedValue({ connected: true }),
      };
      const controller = new GithubAppController(githubAppService as never, new ConfigService());
      await expect(controller.setup('code', 'state')).resolves.toEqual({
        url: `${expectedOrigin}/?github=connected#analyze`,
        statusCode: 302,
      });
      expect(githubAppService.completeAuthorization).toHaveBeenCalledWith('code', 'state', undefined);
    } finally {
      if (previous === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previous;
    }
  });
});
