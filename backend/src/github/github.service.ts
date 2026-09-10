import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { PullRequestFile } from '../ai/review-preparation';
import { GithubAppService } from '../github-app/github-app.service';

interface GithubPullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface GithubPullRequest {
  head?: { sha?: string };
  title: string;
  user?: { login?: string };
  state: string;
  changed_files: number;
  additions: number;
  deletions: number;
}

@Injectable()
export class GithubService {
  private static readonly RETRY_DELAYS_MS = [500, 1_000] as const;
  private static readonly RETRYABLE_NETWORK_CODES = new Set([
    'EAI_AGAIN',
    'ECONNRESET',
    'ENETUNREACH',
    'ENOTFOUND',
    'ETIMEDOUT',
  ]);

  private readonly logger = new Logger(GithubService.name);

  constructor(
    private readonly httpService: HttpService,
    @Optional() private readonly githubAppService?: GithubAppService,
  ) {}

  parsePullRequestUrl(url: unknown) {
    if (typeof url !== 'string' || !url.trim()) {
      throw new BadRequestException('A GitHub pull request URL is required');
    }

    const pattern = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/;

    const match = url.trim().match(pattern);

    if (!match) {
      throw new BadRequestException('Invalid GitHub pull request URL');
    }

    return {
      owner: match[1],
      repository: match[2],
      pullRequestNumber: Number(match[3]),
    };
  }

  async getPullRequestDetails(url: string, userId?: string) {
    const { owner, repository, pullRequestNumber } =
      this.parsePullRequestUrl(url);

    const apiUrl = `https://api.github.com/repos/${owner}/${repository}/pulls/${pullRequestNumber}`;

    let token: string | undefined;
    let response: AxiosResponse<GithubPullRequest>;
    try {
      response = await this.getFromGithub<GithubPullRequest>(apiUrl);
    } catch (error: unknown) {
      if (!(error instanceof NotFoundException) || !userId || !this.githubAppService) throw error;
      this.logger.log(JSON.stringify({ event: 'github_private_pr_fallback', owner, repository, pullRequestNumber }));
      token = (await this.githubAppService.getRepositoryToken(userId, owner, repository)) ?? undefined;
      if (!token) {
        throw new ForbiddenException(
          'This repository is private or unavailable. Connect GitHub and grant PR Insight access to this repository.',
        );
      }
      response = await this.getFromGithub<GithubPullRequest>(apiUrl, undefined, token);
    }

    const pr = response.data;

    const files = await this.getPullRequestFiles(
      owner,
      repository,
      pullRequestNumber,
      token,
    );

    return {
      repositoryOwner: owner,
      repositoryName: repository,
      pullRequestNumber,
      headSha: pr.head?.sha,
      title: pr.title,
      author: pr.user?.login,
      state: pr.state,
      filesChanged: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
      files,
    };
  }

  async getPullRequestFiles(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    token?: string,
  ): Promise<PullRequestFile[]> {
    const apiUrl = `https://api.github.com/repos/${owner}/${repository}/pulls/${pullRequestNumber}/files`;
    const files: PullRequestFile[] = [];

    // GitHub currently caps this endpoint at 3,000 files (30 pages of 100).
    for (let page = 1; page <= 30; page += 1) {
      const response = await this.getFromGithub<GithubPullRequestFile[]>(
        apiUrl,
        { per_page: 100, page },
        token,
      );
      if (!Array.isArray(response.data)) {
        throw new BadGatewayException('GitHub returned an invalid pull request files response.');
      }
      files.push(
        ...response.data.map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch: file.patch ?? null,
        })),
      );
      if (response.data.length < 100) break;
    }

    return files;
  }

  private async getFromGithub<T = unknown>(
    url: string,
    params?: Record<string, number>,
    token?: string,
  ): Promise<AxiosResponse<T>> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await firstValueFrom(
          this.httpService.get<T>(url, {
            headers: {
              Accept: 'application/vnd.github+json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            timeout: 15_000,
            params,
          }),
        );
      } catch (error: unknown) {
        this.logger.warn(JSON.stringify({ event: 'github_pr_request_failed', authenticated: Boolean(token), githubStatus: error instanceof AxiosError ? error.response?.status ?? null : null }));
        const retryDelay = GithubService.RETRY_DELAYS_MS[attempt];

        if (this.isRetryableNetworkError(error) && retryDelay !== undefined) {
          this.logger.warn(
            `GitHub request failed with ${error.code}; retrying in ${retryDelay}ms`,
          );
          await this.delay(retryDelay);
          continue;
        }

        if (this.isRetryableNetworkError(error)) {
          throw new ServiceUnavailableException(
            'GitHub is temporarily unreachable. Check the network or DNS connection and try again.',
          );
        }

        throw this.toGithubException(error);
      }
    }
  }

  private toGithubException(error: unknown): unknown {
    if (!(error instanceof AxiosError)) return new BadGatewayException('GitHub request failed. Please try again.');
    const status = error.response?.status;
    if (status === 401) return new BadGatewayException('GitHub rejected the app access token. Check the GitHub App configuration and reconnect GitHub.');
    if (status === 404) return new NotFoundException('GitHub pull request not found.');
    if (status === 403) {
      return new ForbiddenException(
        'GitHub denied the request or its API rate limit was reached. Try again later.',
      );
    }
    if (status === 429) {
      return new HttpException(
        'GitHub API rate limit reached. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (status && status >= 500) {
      return new ServiceUnavailableException(
        'GitHub is temporarily unavailable. Please try again.',
      );
    }
    return new BadGatewayException('GitHub request failed. Please try again.');
  }

  private isRetryableNetworkError(error: unknown): error is AxiosError {
    return (
      error instanceof AxiosError &&
      typeof error.code === 'string' &&
      GithubService.RETRYABLE_NETWORK_CODES.has(error.code)
    );
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
