import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PublicUser } from './auth.types';
import { UserDocument } from '../users/schemas/user.schema';

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService, private readonly jwtService: JwtService) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (await this.usersService.findByEmail(dto.email)) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await hash(dto.password, 12);
    let user: UserDocument;
    try {
      user = await this.usersService.create(dto.name, dto.email.trim().toLowerCase(), passwordHash);
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) throw new ConflictException('An account with this email already exists');
      throw error;
    }
    return this.createAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.createAuthResponse(user);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User account no longer exists');
    return this.toPublicUser(user);
  }

  private async createAuthResponse(user: UserDocument): Promise<AuthResponse> {
    return {
      user: this.toPublicUser(user),
      accessToken: await this.jwtService.signAsync({ sub: String(user._id), email: user.email }),
    };
  }

  private toPublicUser(user: UserDocument): PublicUser {
    return { id: String(user._id), name: user.name, email: user.email };
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
