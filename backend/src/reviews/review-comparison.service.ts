import { Injectable } from '@nestjs/common';
import { ReviewDocument, ReviewFinding } from './schemas/reviews.schemas';
import {
  REVIEW_SEVERITIES,
  ReviewSeverity,
  SeverityCounts,
} from './review-score.service';

export interface ComparisonReviewSummary {
  _id: string;
  version: number | null;
  headSha: string | null;
  score: number | null;
  createdAt: Date | null;
}

export interface ReviewComparison {
  baseReview: ComparisonReviewSummary;
  targetReview: ComparisonReviewSummary;
  scoreChange: number | null;
  issueCountChange: number;
  severityChange: SeverityCounts;
  resolvedFindings: ReviewFinding[];
  newFindings: ReviewFinding[];
  unchangedFindings: ReviewFinding[];
}

@Injectable()
export class ReviewComparisonService {
  compare(
    baseReview: ReviewDocument,
    targetReview: ReviewDocument,
  ): ReviewComparison {
    const baseBuckets = new Map<string, ReviewFinding[]>();

    for (const finding of baseReview.findings ?? []) {
      const fingerprint = this.fingerprint(finding);
      baseBuckets.set(fingerprint, [
        ...(baseBuckets.get(fingerprint) ?? []),
        finding,
      ]);
    }

    const newFindings: ReviewFinding[] = [];
    const unchangedFindings: ReviewFinding[] = [];

    for (const finding of targetReview.findings ?? []) {
      const matches = baseBuckets.get(this.fingerprint(finding));

      if (matches?.length) {
        matches.pop();
        unchangedFindings.push(finding);
      } else {
        newFindings.push(finding);
      }
    }

    const resolvedFindings = [...baseBuckets.values()].flat();
    const baseCounts = this.getSeverityCounts(baseReview);
    const targetCounts = this.getSeverityCounts(targetReview);

    return {
      baseReview: this.toSummary(baseReview),
      targetReview: this.toSummary(targetReview),
      scoreChange:
        baseReview.score === undefined || targetReview.score === undefined
          ? null
          : targetReview.score - baseReview.score,
      issueCountChange:
        (targetReview.findings?.length ?? 0) -
        (baseReview.findings?.length ?? 0),
      severityChange: Object.fromEntries(
        REVIEW_SEVERITIES.map((severity) => [
          severity,
          targetCounts[severity] - baseCounts[severity],
        ]),
      ) as SeverityCounts,
      resolvedFindings,
      newFindings,
      unchangedFindings,
    };
  }

  /** Approximate match: AI wording can vary between otherwise related reviews. */
  private fingerprint(finding: ReviewFinding): string {
    return [finding.file, finding.category, finding.title]
      .map((value) => value.trim().toLowerCase().replace(/\s+/g, ' '))
      .join('|');
  }

  private getSeverityCounts(review: ReviewDocument): SeverityCounts {
    if (review.severityCounts) {
      return Object.fromEntries(
        REVIEW_SEVERITIES.map((severity) => [
          severity,
          review.severityCounts?.[severity] ?? 0,
        ]),
      ) as SeverityCounts;
    }

    const counts = Object.fromEntries(
      REVIEW_SEVERITIES.map((severity) => [severity, 0]),
    ) as SeverityCounts;

    for (const finding of review.findings ?? []) {
      if (this.isKnownSeverity(finding.severity)) {
        counts[finding.severity] += 1;
      }
    }

    return counts;
  }

  private toSummary(review: ReviewDocument): ComparisonReviewSummary {
    const timestamps = review as ReviewDocument & { createdAt?: Date };
    return {
      _id: String(review._id),
      version: review.version ?? null,
      headSha: review.headSha ?? null,
      score: review.score ?? null,
      createdAt: timestamps.createdAt ?? null,
    };
  }

  private isKnownSeverity(value: string): value is ReviewSeverity {
    return REVIEW_SEVERITIES.includes(value as ReviewSeverity);
  }
}
