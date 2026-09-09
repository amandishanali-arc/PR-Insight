import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, GoogleGenAI } from '@google/genai';
import {
  createReviewChunks,
  formatChunk,
  prepareReviewFiles,
  PullRequestFile,
  ReviewChunk,
} from './review-preparation';

export interface AiTestResponse {
  message: string;
}

export interface AiFinding {
  file: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  suggestion: string;
}

export interface AnalysisMetadata {
  totalFiles: number;
  reviewedFiles: number;
  skippedFiles: number;
  chunksProcessed: number;
  chunksFailed: number;
  partialAnalysis: boolean;
}

export interface AIChunkResult {
  summary: string;
  findings: AiFinding[];
}

export interface AiReviewResult extends AIChunkResult {
  analysisMetadata: AnalysisMetadata;
  warnings: string[];
}

@Injectable()
export class AiService {
  private static readonly MODELS = [
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-pro-preview',
  ] as const;

  private static readonly RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

  private readonly logger = new Logger(AiService.name);
  private readonly ai: GoogleGenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim();

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Verifies the Gemini connection. Each model is attempted in priority order.
   * Rate-limit and availability failures receive three exponential-backoff
   * retries before the next model is used.
   */
  async testConnection(): Promise<AiTestResponse> {
    const message = await this.generateContent(
      'Reply with exactly: PR Insight AI connection successful',
    );

    return { message };
  }

  /** Generates text using each configured model in priority order. */
  private async generateContent(prompt: string): Promise<string> {
    let lastError: unknown;

    for (const model of AiService.MODELS) {
      try {
        return await this.generateWithModel(model, prompt);
      } catch (error: unknown) {
        lastError = error;
        this.logger.warn(
          `Gemini model ${model} failed with status ${this.getHttpStatus(error) ?? 'unknown'}; trying fallback`,
        );
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError);

    this.logger.error(`All Gemini models failed: ${message}`);

    throw new BadGatewayException(
      'The AI service is temporarily unavailable. Please try again later.',
    );
  }

  /** Executes one model request with retries for temporary provider failures. */
  private async generateWithModel(
    model: string,
    prompt: string,
  ): Promise<string> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await this.ai.models.generateContent({
          model,
          contents: prompt,
        });

        const text = response.text?.trim();

        if (!text) {
          throw new Error(`Gemini model ${model} returned an empty response`);
        }

        return text;
      } catch (error: unknown) {
        const retryDelay = AiService.RETRY_DELAYS_MS[attempt];

        if (!this.isRetryable(error) || retryDelay === undefined) {
          throw error;
        }

        await this.delay(retryDelay);
      }
    }
  }

  /** Only throttling and temporary service failures should be retried. */
  private isRetryable(error: unknown): boolean {
    const status = this.getHttpStatus(error);
    return status === 429 || status === 503;
  }

  /** Supports SDK ApiError objects and wrapped HTTP-client errors. */
  private getHttpStatus(error: unknown): number | undefined {
    if (error instanceof ApiError) {
      return error.status;
    }

    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    const candidate = error as {
      status?: unknown;
      response?: { status?: unknown };
    };
    const status = candidate.status ?? candidate.response?.status;

    return typeof status === 'number' ? status : undefined;
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async reviewFiles(files: PullRequestFile[]): Promise<AiReviewResult> {
    const maxPatchChars = this.getPositiveConfig('MAX_PATCH_CHARS', 30_000);
    const maxChunkChars = this.getPositiveConfig(
      'AI_REVIEW_CHUNK_MAX_CHARS',
      60_000,
    );
    const preparedFiles = prepareReviewFiles(files, maxPatchChars);
    const reviewedFilenames = new Set(preparedFiles.map((file) => file.filename));
    const chunks = createReviewChunks(preparedFiles, maxChunkChars);

    if (chunks.length === 0) {
      return {
        summary:
          'No reviewable code patches were found; generated, binary, unsupported, or patchless files were skipped.',
        findings: [],
        warnings: [],
        analysisMetadata: this.metadata(files.length, 0, 0, 0),
      };
    }

    const findings: AiFinding[] = [];
    const warnings: string[] = [];
    let chunksFailed = 0;

    for (let index = 0; index < chunks.length; index += 1) {
      try {
        const result = await this.reviewChunk(chunks[index]);
        findings.push(...result.findings);
      } catch (error: unknown) {
        chunksFailed += 1;
        const warning = `Analysis batch ${index + 1} of ${chunks.length} failed after retries.`;
        warnings.push(warning);
        this.logger.error(
          `${warning} ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (chunksFailed === chunks.length) {
      throw new BadGatewayException(
        'The AI service could not analyze any code batches. Please try again later.',
      );
    }

    const mergedFindings = this.deduplicateFindings(findings);
    const metadata = this.metadata(
      files.length,
      reviewedFilenames.size,
      chunks.length,
      chunksFailed,
    );

    return {
      summary: this.createSummary(metadata, mergedFindings),
      findings: mergedFindings,
      warnings,
      analysisMetadata: metadata,
    };
  }

  private async reviewChunk(chunk: ReviewChunk): Promise<AIChunkResult> {
    const prompt = `
You are a software engineering code reviewer.

Analyze ONLY the supplied GitHub pull request patches.

Look for:
- Bugs
- Security problems
- Performance problems
- Code quality issues
- Maintainability issues
- Bad practices

Do not invent problems that cannot be determined from the diff.

Return ONLY valid JSON.

Use exactly this structure:

{
  "summary": "Short overall review summary",
  "findings": [
    {
      "file": "path/to/file.ts",
      "category": "bug",
      "severity": "high",
      "title": "Short issue title",
      "description": "Explain the issue",
      "suggestion": "Explain how it could be improved"
    }
  ]
}

Allowed categories:
bug
security
performance
code_quality
maintainability
best_practice

Allowed severity:
critical
high
medium
low
info

If there are no meaningful issues, return an empty findings array.

PULL REQUEST CHANGES:

${formatChunk(chunk)}
`;

    const response = await this.generateContent(prompt);
    const cleaned = response
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed: unknown = JSON.parse(cleaned);

    if (!this.isChunkResult(parsed)) {
      throw new Error('Gemini returned malformed review JSON');
    }
    return parsed;
  }

  private deduplicateFindings(findings: readonly AiFinding[]): AiFinding[] {
    const unique = new Map<string, AiFinding>();
    for (const finding of findings) {
      const fingerprint = [finding.file, finding.category, finding.title]
        .map((value) => value.trim().toLowerCase().replace(/\s+/g, ' '))
        .join('|');
      if (!unique.has(fingerprint)) unique.set(fingerprint, finding);
    }
    return [...unique.values()];
  }

  private createSummary(
    metadata: AnalysisMetadata,
    findings: readonly AiFinding[],
  ): string {
    const counts = new Map<string, number>();
    for (const finding of findings) {
      const severity = finding.severity.toLowerCase();
      counts.set(severity, (counts.get(severity) ?? 0) + 1);
    }
    const severityText = ['critical', 'high', 'medium', 'low', 'info']
      .filter((severity) => counts.has(severity))
      .map((severity) => `${counts.get(severity)} ${severity}`)
      .join(', ');
    const result = `Analyzed ${metadata.reviewedFiles} of ${metadata.totalFiles} changed files and identified ${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}${severityText ? `: ${severityText}` : ''}.`;
    return metadata.partialAnalysis
      ? `${result} Some analysis batches could not be completed.`
      : result;
  }

  private metadata(
    totalFiles: number,
    reviewedFiles: number,
    chunksProcessed: number,
    chunksFailed: number,
  ): AnalysisMetadata {
    return {
      totalFiles,
      reviewedFiles,
      skippedFiles: Math.max(0, totalFiles - reviewedFiles),
      chunksProcessed,
      chunksFailed,
      partialAnalysis: chunksFailed > 0,
    };
  }

  private getPositiveConfig(key: string, fallback: number): number {
    const value = Number(this.configService.get<string | number>(key));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  private isChunkResult(value: unknown): value is AIChunkResult {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as { summary?: unknown; findings?: unknown };
    return (
      typeof candidate.summary === 'string' &&
      Array.isArray(candidate.findings) &&
      candidate.findings.every((finding) => this.isFinding(finding))
    );
  }

  private isFinding(value: unknown): value is AiFinding {
    if (typeof value !== 'object' || value === null) return false;
    const finding = value as Record<string, unknown>;
    return ['file', 'category', 'severity', 'title', 'description', 'suggestion']
      .every((key) => typeof finding[key] === 'string');
  }
}
