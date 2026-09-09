import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let users: { findByEmail: jest.Mock; findByEmailWithPassword: jest.Mock; findById: jest.Mock; create: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    users = { findByEmail: jest.fn(), findByEmailWithPassword: jest.fn(), findById: jest.fn(), create: jest.fn() };
    const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };
    service = new AuthService(users as unknown as UsersService, jwt as unknown as JwtService);
  });

  it('registers successfully, hashes the password, and does not return the hash', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockImplementation(async (name: string, email: string, passwordHash: string) => user({ name, email, passwordHash }));
    const result = await service.register({ name: 'Amandi', email: 'USER@example.com', password: 'securePass1' });
    const storedHash = users.create.mock.calls[0][2] as string;
    expect(storedHash).not.toBe('securePass1');
    expect(storedHash.startsWith('$2')).toBe(true);
    expect(result).toEqual({ user: expect.objectContaining({ name: 'Amandi', email: 'user@example.com' }), accessToken: 'signed-token' });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate email', async () => {
    users.findByEmail.mockResolvedValue(user());
    await expect(service.register({ name: 'A', email: 'user@example.com', password: 'securePass1' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs in with correct credentials without returning the hash', async () => {
    users.findByEmailWithPassword.mockResolvedValue(user({ passwordHash: await hash('securePass1', 4) }));
    const result = await service.login({ email: 'user@example.com', password: 'securePass1' });
    expect(result.accessToken).toBe('signed-token');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it.each([
    ['unknown email', null, 'securePass1'],
    ['incorrect password', user({ passwordHash: '$2a$04$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid' }), 'wrongPass1'],
  ])('rejects %s with the same generic message', async (_case, foundUser, password) => {
    users.findByEmailWithPassword.mockResolvedValue(foundUser);
    await expect(service.login({ email: 'user@example.com', password })).rejects.toEqual(new UnauthorizedException('Invalid email or password'));
  });
});

function user(overrides: Record<string, unknown> = {}): UserDocument {
  return { _id: new Types.ObjectId(), name: 'Amandi', email: 'user@example.com', passwordHash: 'hash', ...overrides } as unknown as UserDocument;
}
