import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { createReviewChunks, isReviewableFile, prepareReviewFiles, PullRequestFile } from './review-preparation';

describe('review preparation', () => {
  it.each(['src/app.ts', 'src/components/Button.tsx', 'backend/service.py'])('includes source file %s', (path) => expect(isReviewableFile(path)).toBe(true));
  it.each(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'image.png', 'font.woff', 'dist/app.js', 'coverage/report.json'])('skips non-reviewable file %s', (path) => expect(isReviewableFile(path)).toBe(false));
  it('skips a missing patch', () => expect(prepareReviewFiles([file('src/app.ts', null)], 100)).toEqual([]));
  it('splits oversized patches without losing content', () => {
    const patch = 'one\ntwo\nthree\nfour';
    const prepared = prepareReviewFiles([file('src/app.ts', patch)], 6);
    expect(prepared.length).toBeGreaterThan(1);
    expect(prepared.map((part) => part.patch).join('')).toBe(patch);
  });
  it('creates character-size-aware chunks', () => {
    const prepared = prepareReviewFiles([file('a.ts', 'a'.repeat(20)), file('b.ts', 'b'.repeat(20))], 100);
    expect(createReviewChunks(prepared, 90)).toHaveLength(2);
  });
  it('keeps small files in one chunk and handles an empty list', () => {
    expect(createReviewChunks([], 500)).toEqual([]);
    expect(createReviewChunks(prepareReviewFiles([file('a.ts', 'small')], 100), 500)).toHaveLength(1);
  });
  it('ensures oversized input is split into bounded chunks with file metadata', () => {
    const chunks = createReviewChunks(prepareReviewFiles([file('src/large.ts', 'x'.repeat(500))], 1_000), 120);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.characterCount <= 120)).toBe(true);
    expect(chunks.every((chunk) => chunk.files[0].filename === 'src/large.ts')).toBe(true);
  });
});

describe('AiService chunk aggregation', () => {
  let service: AiService;
  let generateContent: jest.Mock;

  beforeEach(() => {
    const config = { get: jest.fn((key: string) => {
      if (key === 'GEMINI_API_KEY') return 'test-key';
      if (key === 'MAX_PATCH_CHARS') return 100;
      if (key === 'AI_REVIEW_CHUNK_MAX_CHARS') return 90;
      return undefined;
    }) } as unknown as ConfigService;
    service = new AiService(config);
    generateContent = jest.fn();
    (service as unknown as { generateContent: jest.Mock }).generateContent = generateContent;
  });

  it('merges findings from multiple chunks and removes duplicates', async () => {
    const duplicate = finding('Potential Null Error');
    generateContent
      .mockResolvedValueOnce(JSON.stringify({ summary: 'one', findings: [duplicate] }))
      .mockResolvedValueOnce(JSON.stringify({ summary: 'two', findings: [finding(' potential   null error '), finding('Other')] }));
    const result = await service.reviewFiles([file('a.ts', 'a'.repeat(20)), file('b.ts', 'b'.repeat(20))]);
    expect(result.findings).toHaveLength(2);
    expect(result.analysisMetadata).toEqual({ totalFiles: 2, reviewedFiles: 2, skippedFiles: 0, chunksProcessed: 2, chunksFailed: 0, partialAnalysis: false });
  });

  it('does not deduplicate equivalent titles from different files', async () => {
    generateContent.mockResolvedValue(JSON.stringify({ summary: 'ok', findings: [finding('Same'), { ...finding(' same '), file: 'other.ts' }] }));
    const result = await service.reviewFiles([file('a.ts', 'patch')]);
    expect(result.findings).toHaveLength(2);
  });

  it('accepts valid structured JSON with empty findings', async () => {
    generateContent.mockResolvedValue('```json\n{"summary":"Clean","findings":[]}\n```');
    await expect(service.reviewFiles([file('a.ts', 'patch')])).resolves.toEqual(expect.objectContaining({ findings: [] }));
  });

  it('treats malformed JSON as a failed chunk', async () => {
    generateContent.mockResolvedValue('{not json');
    await expect(service.reviewFiles([file('a.ts', 'patch')])).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('retries a temporary Gemini failure before succeeding', async () => {
    const generate = jest.fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ text: 'recovered' });
    (service as unknown as { ai: { models: { generateContent: jest.Mock } } }).ai = { models: { generateContent: generate } };
    (service as unknown as { delay: jest.Mock }).delay = jest.fn();
    await expect((service as unknown as { generateWithModel: (model: string, prompt: string) => Promise<string> }).generateWithModel('model', 'prompt')).resolves.toBe('recovered');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('returns partial analysis when one chunk fails', async () => {
    generateContent.mockRejectedValueOnce(new Error('provider failed'))
      .mockResolvedValueOnce(JSON.stringify({ summary: 'ok', findings: [] }));
    const result = await service.reviewFiles([file('a.ts', 'a'.repeat(20)), file('b.ts', 'b'.repeat(20))]);
    expect(result.analysisMetadata.partialAnalysis).toBe(true);
    expect(result.analysisMetadata.chunksFailed).toBe(1);
    expect(result.warnings).toHaveLength(1);
  });

  it('throws a clean error when every chunk fails', async () => {
    generateContent.mockRejectedValue(new Error('provider failed'));
    await expect(service.reviewFiles([file('a.ts', 'patch')])).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('completes when no files are reviewable', async () => {
    const result = await service.reviewFiles([file('package-lock.json', 'patch')]);
    expect(result.findings).toEqual([]);
    expect(result.analysisMetadata.skippedFiles).toBe(1);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

function file(filename: string, patch: string | null): PullRequestFile {
  return { filename, patch, status: 'modified', additions: 1, deletions: 1, changes: 2 };
}

function finding(title: string) {
  return { file: 'src/app.ts', category: 'bug', severity: 'medium', title, description: 'Description', suggestion: 'Suggestion' };
}
