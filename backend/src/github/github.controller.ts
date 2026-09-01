import { Body, Controller, Post } from '@nestjs/common';
import { GithubService } from './github.service';

@Controller('github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Post('pr')
  getPullRequest(@Body() body: { url: string }) {
    return this.githubService.parsePullRequestUrl(body.url);
  }
}