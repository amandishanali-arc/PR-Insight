import { BadRequestException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GithubService {
  constructor(private readonly httpService: HttpService) {}

  parsePullRequestUrl(url: string) {
    const pattern =
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/;

    const match = url.match(pattern);

    if (!match) {
      throw new BadRequestException(
        'Invalid GitHub pull request URL',
      );
    }

    return {
      owner: match[1],
      repository: match[2],
      pullRequestNumber: Number(match[3]),
    };
  }

  async getPullRequestDetails(url: string) {
    const { owner, repository, pullRequestNumber } =
      this.parsePullRequestUrl(url);

    const apiUrl =
      `https://api.github.com/repos/${owner}/${repository}/pulls/${pullRequestNumber}`;

    const response = await firstValueFrom(
      this.httpService.get(apiUrl, {
        headers: {
          Accept: 'application/vnd.github+json',
        },
      }),
    );

    const pr = response.data;

    return {
      repositoryOwner: owner,
      repositoryName: repository,
      pullRequestNumber,
      title: pr.title,
      author: pr.user?.login,
      state: pr.state,
      filesChanged: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
    };
  }
}