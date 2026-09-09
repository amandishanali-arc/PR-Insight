import { Injectable } from '@nestjs/common';

export const REVIEW_SEVERITIES = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const;

export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];
export type SeverityCounts = Record<ReviewSeverity, number>;

export interface ScorableFinding {
  severity: unknown;
}

export interface ReviewScoreResult {
  score: number;
  severityCounts: SeverityCounts;
}

const SEVERITY_PENALTIES: Record<ReviewSeverity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 1,
};

@Injectable()
export class ReviewScoreService {
  calculateReviewScore(
    findings: readonly ScorableFinding[],
  ): ReviewScoreResult {
    const severityCounts: SeverityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    let totalPenalty = 0;

    for (const finding of findings) {
      if (!this.isKnownSeverity(finding.severity)) {
        continue;
      }

      severityCounts[finding.severity] += 1;
      totalPenalty += SEVERITY_PENALTIES[finding.severity];
    }

    return {
      score: Math.min(100, Math.max(0, 100 - totalPenalty)),
      severityCounts,
    };
  }

  private isKnownSeverity(value: unknown): value is ReviewSeverity {
    return (
      typeof value === 'string' &&
      REVIEW_SEVERITIES.includes(value as ReviewSeverity)
    );
  }
}
