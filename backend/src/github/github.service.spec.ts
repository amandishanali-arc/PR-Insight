import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { GithubService } from './github.service';
import { AxiosError, AxiosHeaders } from 'axios';
import { BadGatewayException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { throwError } from 'rxjs';

describe('GithubService', () => {
  it.each([
    ['https://github.com/react/create-react-app/pull/13712', 13712],
    ['https://github.com/react/create-react-app/pull/13712/', 13712],
  ])('parses a valid pull request URL', (url, number) => {
    expect(new GithubService({} as HttpService).parsePullRequestUrl(url)).toEqual({ owner: 'react', repository: 'create-react-app', pullRequestNumber: number });
  });

  it.each([
    'https://github.com/react/create-react-app',
    'https://github.com/react/create-react-app/pull/not-a-number',
    'https://example.com/react/create-react-app/pull/12',
  ])('rejects invalid pull request URL %s', (url) => {
    expect(() => new GithubService({} as HttpService).parsePullRequestUrl(url)).toThrow('Invalid GitHub pull request URL');
  });

  it('paginates pull request files until a short page is returned', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => rawFile(`src/${index}.ts`));
    const get = jest.fn()
      .mockReturnValueOnce(of({ data: firstPage }))
      .mockReturnValueOnce(of({ data: [rawFile('src/final.ts')] }));
    const service = new GithubService({ get } as unknown as HttpService);
    const files = await service.getPullRequestFiles('owner', 'repo', 42);
    expect(files).toHaveLength(101);
    expect(get).toHaveBeenNthCalledWith(1, expect.any(String), expect.objectContaining({ params: { per_page: 100, page: 1 } }));
    expect(get).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({ params: { per_page: 100, page: 2 } }));
  });

  it('returns all 130 files across two pages', async () => {
    const get = jest.fn()
      .mockReturnValueOnce(of({ data: Array.from({ length: 100 }, (_, index) => rawFile(`${index}.ts`)) }))
      .mockReturnValueOnce(of({ data: Array.from({ length: 30 }, (_, index) => rawFile(`last-${index}.ts`)) }));
    await expect(new GithubService({ get } as unknown as HttpService).getPullRequestFiles('owner', 'repo', 1)).resolves.toHaveLength(130);
  });

  it.each([
    [404, NotFoundException],
    [403, ForbiddenException],
  ])('maps GitHub status %s to a clean exception', async (status, ExceptionType) => {
    const get = jest.fn().mockReturnValue(throwError(() => axiosError(status)));
    await expect(new GithubService({ get } as unknown as HttpService).getPullRequestFiles('owner', 'repo', 1)).rejects.toBeInstanceOf(ExceptionType);
  });

  it('rejects a malformed files response cleanly', async () => {
    const get = jest.fn().mockReturnValue(of({ data: { unexpected: true } }));
    await expect(new GithubService({ get } as unknown as HttpService).getPullRequestFiles('owner', 'repo', 1)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('returns HTTP 429 for a GitHub rate-limit response', async () => {
    const get = jest.fn().mockReturnValue(throwError(() => axiosError(429)));
    await expect(new GithubService({ get } as unknown as HttpService).getPullRequestFiles('owner', 'repo', 1)).rejects.toMatchObject({ status: 429 });
  });

  it('keeps the public pull request flow unauthenticated', async () => {
    const get = jest.fn()
      .mockReturnValueOnce(of({ data: rawPullRequest() }))
      .mockReturnValueOnce(of({ data: [rawFile('src/public.ts')] }));
    const githubApp = { getRepositoryToken: jest.fn() };

    const result = await new GithubService({ get } as unknown as HttpService, githubApp as never)
      .getPullRequestDetails('https://github.com/owner/repo/pull/7', 'user-id');

    expect(result.files).toHaveLength(1);
    expect(githubApp.getRepositoryToken).not.toHaveBeenCalled();
    expect(get).toHaveBeenNthCalledWith(1, expect.any(String), expect.objectContaining({
      headers: { Accept: 'application/vnd.github+json' },
    }));
  });

  it('retries a private pull request with the current user installation token', async () => {
    const get = jest.fn()
      .mockReturnValueOnce(throwError(() => axiosError(404)))
      .mockReturnValueOnce(of({ data: rawPullRequest() }))
      .mockReturnValueOnce(of({ data: [rawFile('src/private.ts')] }));
    const githubApp = { getRepositoryToken: jest.fn().mockResolvedValue('installation-token') };

    const result = await new GithubService({ get } as unknown as HttpService, githubApp as never)
      .getPullRequestDetails('https://github.com/owner/repo/pull/7', 'user-id');

    expect(githubApp.getRepositoryToken).toHaveBeenCalledWith('user-id', 'owner', 'repo');
    expect(result.files[0].filename).toBe('src/private.ts');
    expect(get).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer installation-token' }),
    }));
    expect(get).toHaveBeenNthCalledWith(3, expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer installation-token' }),
    }));
  });

  it('returns a useful private repository error when this user has no authorized installation', async () => {
    const get = jest.fn().mockReturnValue(throwError(() => axiosError(404)));
    const githubApp = { getRepositoryToken: jest.fn().mockResolvedValue(null) };

    await expect(new GithubService({ get } as unknown as HttpService, githubApp as never)
      .getPullRequestDetails('https://github.com/owner/repo/pull/7', 'user-id'))
      .rejects.toThrow('Connect GitHub');
  });
});

function rawFile(filename: string) {
  return { filename, status: 'modified', additions: 1, deletions: 1, changes: 2, patch: '@@ patch' };
}

function rawPullRequest() {
  return {
    head: { sha: 'abc123' }, title: 'Test PR', user: { login: 'octocat' }, state: 'open',
    changed_files: 1, additions: 1, deletions: 1,
  };
}

function axiosError(status: number): AxiosError {
  return new AxiosError('GitHub error', undefined, undefined, undefined, {
    status, statusText: 'Error', headers: {}, config: { headers: new AxiosHeaders() }, data: {},
  });
}
