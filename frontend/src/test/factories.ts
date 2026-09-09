import type { Finding, Review } from '../types/review'

export function createMockFinding(overrides: Partial<Finding> = {}): Finding {
  return { file: 'src/app.ts', category: 'bug', severity: 'medium', title: 'Potential issue', description: 'Issue description', suggestion: 'Suggested fix', ...overrides }
}

export function createMockReview(overrides: Partial<Review> = {}): Review {
  return {
    _id: 'review-1', pullRequestUrl: 'https://github.com/owner/repo/pull/12',
    repositoryOwner: 'owner', repositoryName: 'repo', pullRequestNumber: 12,
    headSha: 'abc123', version: 1, title: 'Improve feature', author: 'developer',
    state: 'open', filesChanged: 2, additions: 10, deletions: 3,
    summary: 'Review summary', findings: [], score: 92,
    severityCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    analysisMetadata: { totalFiles: 4, reviewedFiles: 4, skippedFiles: 0, chunksProcessed: 1, chunksFailed: 0, partialAnalysis: false },
    status: 'completed', createdAt: '2026-09-07T10:00:00.000Z', updatedAt: '2026-09-07T10:00:00.000Z',
    ...overrides,
  }
}
