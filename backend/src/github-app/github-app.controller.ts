import { BadRequestException, Controller, Delete, ForbiddenException, Get, Query, Redirect, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GithubAppService } from './github-app.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';

@Controller('github-app')
export class GithubAppController {
  constructor(private readonly githubAppService: GithubAppService, private readonly config: ConfigService) {}

  @Get('connect')
  @UseGuards(JwtAuthGuard)
  connect(@Req() request: AuthenticatedRequest, @Query('pullRequestUrl') pullRequestUrl?: string) { return this.githubAppService.createConnectUrl(request.user.id, pullRequestUrl); }

  @Get('setup')
  @Redirect()
  async setup(@Query('code') code?: string, @Query('state') state?: string, @Query('installation_id') installationId?: string) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL')?.trim() || 'http://localhost:5173';
    if (this.config.get<string>('NODE_ENV') === 'production') {
      let target: URL;
      try { target = new URL(this.config.get<string>('FRONTEND_URL')?.trim() || ''); }
      catch { throw new ServiceUnavailableException('Frontend redirect is not configured.'); }
      if (target.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
        throw new ServiceUnavailableException('Frontend redirect is not configured for production.');
      }
    }
    try {
      const result = await this.githubAppService.completeAuthorization(code, state, installationId);
      if (!result.connected && result.url) return { url: result.url, statusCode: 302 };
      return { url: `${frontendUrl.replace(/\/$/, '')}/?github=connected#analyze`, statusCode: 302 };
    } catch (error: unknown) {
      // Never include OAuth codes, state, tokens, or raw upstream errors in redirects.
      const reason = error instanceof ForbiddenException ? 'repository_access' : error instanceof BadRequestException ? 'authorization' : 'unavailable';
      return { url: `${frontendUrl.replace(/\/$/, '')}/?github=error&reason=${reason}#analyze`, statusCode: 302 };
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Req() request: AuthenticatedRequest) { return this.githubAppService.status(request.user.id); }

  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  disconnect(@Req() request: AuthenticatedRequest) { return this.githubAppService.disconnect(request.user.id); }
}
