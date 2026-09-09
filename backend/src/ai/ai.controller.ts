import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { GithubService } from '../github/github.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly githubService: GithubService,
  ) {}

  @Post('review')
  async reviewPullRequest(
    @Body() body: { pullRequestUrl: string },
  ) {
    const githubData =
      await this.githubService.getPullRequestDetails(
        body.pullRequestUrl,
      );

    const aiReview =
      await this.aiService.reviewFiles(githubData.files);

    return {
      pullRequest: {
        repositoryOwner: githubData.repositoryOwner,
        repositoryName: githubData.repositoryName,
        pullRequestNumber: githubData.pullRequestNumber,
        title: githubData.title,
        author: githubData.author,
      },
      review: aiReview,
    };
  }
}