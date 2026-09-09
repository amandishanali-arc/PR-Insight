import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { GithubService } from './github.service';

interface PullRequestBody {
  url?: string;
  pullRequestUrl?: string;
}

@Controller('github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Post('pr')
  getPullRequest(@Body() body?: PullRequestBody) {
    const url = body?.url ?? body?.pullRequestUrl;

    if (!url) {
      throw new BadRequestException(
        'url or pullRequestUrl is required',
      );
    }

    return this.githubService.getPullRequestDetails(url);
  }
}