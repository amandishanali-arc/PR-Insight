import { Controller, Delete, Get, Query, Redirect, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GithubAppService } from './github-app.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';

@Controller('github-app')
export class GithubAppController {
  constructor(private readonly githubAppService: GithubAppService, private readonly config: ConfigService) {}

  @Get('connect')
  @UseGuards(JwtAuthGuard)
  connect(@Req() request: AuthenticatedRequest) { return this.githubAppService.createConnectUrl(request.user.id); }

  @Get('setup')
  @Redirect()
  async setup(@Query('code') code?: string, @Query('state') state?: string, @Query('installation_id') installationId?: string) {
    const result = await this.githubAppService.completeAuthorization(code, state, installationId);
    if (!result.connected && result.url) return { url: result.url, statusCode: 302 };
    const frontendUrl = this.config.get<string>('FRONTEND_URL')?.trim() || 'http://localhost:5173';
    return { url: `${frontendUrl.replace(/\/$/, '')}/?github=connected#analyze`, statusCode: 302 };
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Req() request: AuthenticatedRequest) { return this.githubAppService.status(request.user.id); }

  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  disconnect(@Req() request: AuthenticatedRequest) { return this.githubAppService.disconnect(request.user.id); }
}
