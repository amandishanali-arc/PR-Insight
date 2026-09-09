import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from '@jest/globals';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'unit-test-secret' });
  const guard = new JwtAuthGuard(jwt);

  it('rejects a missing token', async () => {
    await expect(guard.canActivate(context({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows a valid token and attaches the authenticated user', async () => {
    const request: { headers: { authorization?: string }; user?: unknown } = { headers: {} };
    request.headers.authorization = `Bearer ${await jwt.signAsync({ sub: '507f1f77bcf86cd799439011', email: 'user@example.com' })}`;
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: '507f1f77bcf86cd799439011', email: 'user@example.com' });
  });

  it('rejects an invalid token', async () => {
    await expect(guard.canActivate(context({ headers: { authorization: 'Bearer invalid-token' } }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function context(request: object): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

