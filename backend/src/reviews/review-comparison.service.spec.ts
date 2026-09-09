import { ReviewComparisonService } from './review-comparison.service';
import { ReviewDocument, ReviewFinding } from './schemas/reviews.schemas';

describe('ReviewComparisonService', () => {
  const service = new ReviewComparisonService();

  it('compares two versions of the same review', () => {
    const result = service.compare(
      review({ version: 1 }),
      review({ version: 2 }),
    );
    expect(result.baseReview.version).toBe(1);
    expect(result.targetReview.version).toBe(2);
  });

  it('detects a resolved finding', () => {
    const result = service.compare(
      review({ findings: [finding('Old issue')] }),
      review(),
    );
    expect(result.resolvedFindings).toHaveLength(1);
  });

  it('detects a new finding', () => {
    const result = service.compare(
      review(),
      review({ findings: [finding('New issue')] }),
    );
    expect(result.newFindings).toHaveLength(1);
  });

  it('returns the newer object for an unchanged finding', () => {
    const newer = finding('Same issue', { description: 'Newer wording' });
    const result = service.compare(
      review({ findings: [finding('Same issue')] }),
      review({ findings: [newer] }),
    );
    expect(result.unchangedFindings).toEqual([newer]);
  });

  it('calculates a score increase', () => {
    expect(
      service.compare(review({ score: 72 }), review({ score: 88 })).scoreChange,
    ).toBe(16);
  });

  it('calculates a score decrease', () => {
    expect(
      service.compare(review({ score: 88 }), review({ score: 70 })).scoreChange,
    ).toBe(-18);
  });

  it('returns null when either score is missing', () => {
    expect(
      service.compare(review({ score: undefined }), review({ score: 88 }))
        .scoreChange,
    ).toBeNull();
  });

  it('handles empty finding arrays', () => {
    const result = service.compare(review(), review());
    expect(result.issueCountChange).toBe(0);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toEqual([]);
  });

  it('normalizes capitalization and repeated title whitespace', () => {
    const result = service.compare(
      review({ findings: [finding('  Potential   BUG ')] }),
      review({ findings: [finding('potential bug')] }),
    );
    expect(result.unchangedFindings).toHaveLength(1);
  });

  it('calculates issue count change', () => {
    const result = service.compare(
      review({ findings: [finding('One'), finding('Two')] }),
      review({ findings: [finding('One')] }),
    );
    expect(result.issueCountChange).toBe(-1);
  });

  it('derives legacy severity counts from saved findings', () => {
    const result = service.compare(
      review({ findings: [finding('High', { severity: 'high' })] }),
      review({ findings: [finding('Low', { severity: 'low' })] }),
    );
    expect(result.severityChange.high).toBe(-1);
    expect(result.severityChange.low).toBe(1);
  });

  function finding(
    title: string,
    overrides: Partial<ReviewFinding> = {},
  ): ReviewFinding {
    return {
      file: 'src/file.ts',
      category: 'bug',
      severity: 'medium',
      title,
      description: 'Description',
      suggestion: 'Suggestion',
      ...overrides,
    };
  }

  function review(overrides: Partial<ReviewDocument> = {}): ReviewDocument {
    return {
      _id: '507f1f77bcf86cd799439011',
      findings: [],
      score: 80,
      ...overrides,
    } as unknown as ReviewDocument;
  }
});
