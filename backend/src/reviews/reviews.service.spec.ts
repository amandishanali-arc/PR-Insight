import { NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { GithubService } from '../github/github.service';
import { ReviewScoreService } from './review-score.service';
import { ReviewDocument } from './schemas/reviews.schemas';
import { ReviewsService } from './reviews.service';
import { ReviewComparisonService } from './review-comparison.service';

describe('ReviewsService', () => {
  const userId = '507f1f77bcf86cd799439012';
  const githubData = {
    repositoryOwner: 'owner',
    repositoryName: 'repo',
    pullRequestNumber: 12,
    headSha: 'abc123',
    title: 'Improve feature',
    author: 'developer',
    state: 'open',
    filesChanged: 1,
    additions: 4,
    deletions: 2,
    files: [
      {
        filename: 'file.ts',
        status: 'modified',
        additions: 4,
        deletions: 2,
        changes: 6,
        patch: '@@ patch',
      },
    ],
  };
  const aiReview = {
    summary: 'Looks good', findings: [], warnings: [],
    analysisMetadata: { totalFiles: 1, reviewedFiles: 1, skippedFiles: 0, chunksProcessed: 1, chunksFailed: 0, partialAnalysis: false },
  };

  let service: ReviewsService;
  let modelConstructor: jest.Mock;
  let findOne: jest.Mock;
  let find: jest.Mock;
  let save: jest.Mock;
  let githubService: { getPullRequestDetails: jest.Mock };
  let aiService: { reviewFiles: jest.Mock };

  beforeEach(() => {
    findOne = jest.fn();
    find = jest.fn();
    save = jest.fn(async function (this: Record<string, unknown>) {
      return this;
    });
    modelConstructor = jest
      .fn()
      .mockImplementation((data) => ({ ...data, save }));
    modelConstructor.findOne = findOne;
    modelConstructor.find = find;
    githubService = {
      getPullRequestDetails: jest.fn().mockResolvedValue(githubData),
    };
    aiService = { reviewFiles: jest.fn().mockResolvedValue(aiReview) };

    service = new ReviewsService(
      modelConstructor as unknown as Model<ReviewDocument>,
      githubService as unknown as GithubService,
      aiService as unknown as AiService,
      new ReviewScoreService(),
      new ReviewComparisonService(),
    );
  });

  it('creates the first review as version 1', async () => {
    arrangeCreate(null, undefined);
    const result = await service.createReview(
      'https://github.com/owner/repo/pull/12',
      userId,
    );
    expect(result.version).toBe(1);
    expect(result.headSha).toBe('abc123');
    expect(result.analysisMetadata).toEqual(aiReview.analysisMetadata);
  });

  it('returns the existing completed review for the same SHA', async () => {
    const existing = { _id: 'existing', version: 1, headSha: 'abc123' };
    findOne.mockReturnValue(queryResult(existing));
    await expect(service.createReview('url', userId)).resolves.toBe(existing);
    expect(modelConstructor).not.toHaveBeenCalled();
  });

  it('does not call Gemini when the same SHA is cached', async () => {
    findOne.mockReturnValue(queryResult({ _id: 'existing', version: 1 }));
    await service.createReview('url', userId);
    expect(aiService.reviewFiles).not.toHaveBeenCalled();
  });

  it('creates version 2 when the same PR has a different SHA', async () => {
    githubService.getPullRequestDetails.mockResolvedValue({
      ...githubData,
      headSha: 'def456',
    });
    arrangeCreate(null, 1);
    const result = await service.createReview('url', userId);
    expect(result.version).toBe(2);
  });

  it('creates version 3 after two existing versions', async () => {
    githubService.getPullRequestDetails.mockResolvedValue({
      ...githubData,
      headSha: 'ghi789',
    });
    arrangeCreate(null, 2);
    const result = await service.createReview('url', userId);
    expect(result.version).toBe(3);
  });

  it('scopes version lookup by repository and PR number', async () => {
    arrangeCreate(null, undefined);
    await service.createReview('url', userId);
    expect(findOne).toHaveBeenNthCalledWith(2, {
      repositoryOwner: 'owner',
      repositoryName: 'repo',
      pullRequestNumber: 12,
      userId: expect.anything(),
    });
  });

  it('handles a legacy review without a version', async () => {
    arrangeCreate(null, undefined, true);
    const result = await service.createReview('url', userId);
    expect(result.version).toBe(1);
  });

  it('does not create multiple records for a duplicate SHA', async () => {
    arrangeCreate(null, undefined);
    const created = await service.createReview('url', userId);
    findOne.mockReset();
    findOne.mockReturnValue(queryResult(created));
    await service.createReview('url', userId);
    expect(modelConstructor).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('returns history using newest-first sorting', async () => {
    const reviews = [{ _id: 'new' }, { _id: 'old' }];
    const exec = jest.fn().mockResolvedValue(reviews);
    const sort = jest.fn().mockReturnValue({ exec });
    find.mockReturnValue({ sort });
    await expect(service.findAll(userId)).resolves.toBe(reviews);
    expect(find).toHaveBeenCalledWith({ userId: expect.anything() });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('returns a saved review detail without invoking GitHub or Gemini', async () => {
    const review = { _id: '507f1f77bcf86cd799439011' };
    findOne.mockReturnValue(queryResult(review));
    await expect(service.findOne(review._id, userId)).resolves.toBe(review);
    expect(githubService.getPullRequestDetails).not.toHaveBeenCalled();
    expect(aiService.reviewFiles).not.toHaveBeenCalled();
  });

  it('returns a clean not-found error for an invalid detail ID', async () => {
    await expect(service.findOne('invalid', userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not expose another user\'s review or crash on legacy records', async () => {
    findOne.mockReturnValue(queryResult(null));
    await expect(service.findOne('507f1f77bcf86cd799439011', userId)).rejects.toBeInstanceOf(NotFoundException);
    expect(String(findOne.mock.calls[0][0].userId)).toBe(userId);
  });

  it('passes the current user to GitHub access and scopes history to that same user', async () => {
    const userB = '507f1f77bcf86cd799439099';
    arrangeCreate(null, undefined);
    await service.createReview('url', userB);
    expect(githubService.getPullRequestDetails).toHaveBeenCalledWith('url', userB);
    find.mockReturnValue({ sort: () => ({ exec: async () => [] }) });
    await service.findAll(userB);
    expect(String(find.mock.calls[0][0].userId)).toBe(userB);
    expect(String(findOne.mock.calls[0][0].userId)).toBe(userB);
  });

  it('scopes duplicate detection to the authenticated user', async () => {
    arrangeCreate(null, undefined);
    await service.createReview('url', userId);
    expect(findOne).toHaveBeenNthCalledWith(1, expect.objectContaining({ userId: expect.anything(), headSha: 'abc123' }));
  });

  it('allows a different user to save the same PR and head SHA', async () => {
    const userB = '507f1f77bcf86cd799439099';
    arrangeCreate(null, undefined);
    const result = await service.createReview('url', userB);
    expect(String(result.userId)).toBe(userB);
    expect(aiService.reviewFiles).toHaveBeenCalledTimes(1);
  });

  it('persists the complete review pipeline without raw patches', async () => {
    const finding = {
      file: 'file.ts', category: 'bug', severity: 'high', title: 'Bug',
      description: 'Description', suggestion: 'Suggestion',
    };
    aiService.reviewFiles.mockResolvedValue({ ...aiReview, findings: [finding] });
    arrangeCreate(null, undefined);
    const result = await service.createReview('url', userId);
    expect(result).toEqual(expect.objectContaining({
      repositoryOwner: 'owner', repositoryName: 'repo', pullRequestNumber: 12,
      headSha: 'abc123', version: 1, summary: 'Looks good', findings: [finding],
      score: 85,
      severityCounts: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      analysisMetadata: aiReview.analysisMetadata,
      userId: expect.anything(), status: 'completed',
    }));
    expect(result).not.toHaveProperty('files');
    expect(JSON.stringify(result)).not.toContain('@@ patch');
  });

  it('compares two saved versions without calling GitHub or Gemini', async () => {
    const base = {
      _id: '507f1f77bcf86cd799439011',
      repositoryOwner: 'owner',
      repositoryName: 'repo',
      pullRequestNumber: 12,
      findings: [],
      score: 80,
    };
    const target = { ...base, _id: '507f191e810c19729de860ea', score: 90 };
    findOne
      .mockReturnValueOnce(queryResult(base))
      .mockReturnValueOnce(queryResult(target));
    const result = await service.compare(base._id, target._id, userId);
    expect(result.scoreChange).toBe(10);
    expect(githubService.getPullRequestDetails).not.toHaveBeenCalled();
    expect(aiService.reviewFiles).not.toHaveBeenCalled();
  });

  it('rejects comparisons between different pull requests', async () => {
    const base = {
      _id: '507f1f77bcf86cd799439011',
      repositoryOwner: 'owner',
      repositoryName: 'repo',
      pullRequestNumber: 12,
    };
    const target = {
      ...base,
      _id: '507f191e810c19729de860ea',
      pullRequestNumber: 13,
    };
    findOne
      .mockReturnValueOnce(queryResult(base))
      .mockReturnValueOnce(queryResult(target));
    await expect(service.compare(base._id, target._id, userId)).rejects.toThrow(
      'Reviews must belong to the same pull request.',
    );
  });

  it('returns not found when either comparison review is missing', async () => {
    findOne.mockReturnValue(queryResult(null));
    await expect(
      service.compare('507f1f77bcf86cd799439011', '507f191e810c19729de860ea', userId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cannot compare against another user\'s review', async () => {
    findOne
      .mockReturnValueOnce(queryResult({
        _id: '507f1f77bcf86cd799439011',
        repositoryOwner: 'owner',
        repositoryName: 'repo',
        pullRequestNumber: 12,
      }))
      .mockReturnValueOnce(queryResult(null));
    await expect(
      service.compare('507f1f77bcf86cd799439011', '507f191e810c19729de860ea', userId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  function arrangeCreate(
    cached: unknown,
    version?: number,
    legacyDocument = false,
  ): void {
    findOne
      .mockReturnValueOnce(queryResult(cached))
      .mockReturnValueOnce(versionQuery(version, legacyDocument));
  }

  function queryResult(value: unknown) {
    return { exec: jest.fn().mockResolvedValue(value) };
  }

  function versionQuery(version?: number, legacyDocument = false) {
    const value = legacyDocument
      ? {}
      : version === undefined
        ? null
        : { version };
    return {
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue(queryResult(value)),
        }),
      }),
    };
  }
});
