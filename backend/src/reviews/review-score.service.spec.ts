import { ReviewScoreService } from './review-score.service';

describe('ReviewScoreService', () => {
  const service = new ReviewScoreService();
  const finding = (severity: unknown) => ({ severity });

  it('returns 100 when there are no findings', () => {
    expect(service.calculateReviewScore([]).score).toBe(100);
  });

  it('deducts 15 for one high-severity finding', () => {
    expect(service.calculateReviewScore([finding('high')]).score).toBe(85);
  });

  it('deducts the combined weight of high and medium findings', () => {
    expect(
      service.calculateReviewScore([finding('high'), finding('medium')]).score,
    ).toBe(77);
  });

  it('clamps four critical findings to zero', () => {
    expect(
      service.calculateReviewScore(
        Array.from({ length: 4 }, () => finding('critical')),
      ).score,
    ).toBe(0);
  });

  it('ignores unknown severities without crashing', () => {
    const result = service.calculateReviewScore([finding('unknown')]);
    expect(result.score).toBe(100);
    expect(
      Object.values(result.severityCounts).every((count) => count === 0),
    ).toBe(true);
  });

  it('never returns a score above 100', () => {
    expect(
      service.calculateReviewScore([finding(undefined)]).score,
    ).toBeLessThanOrEqual(100);
  });

  it('never returns a score below zero', () => {
    const findings = Array.from({ length: 20 }, () => finding('critical'));
    expect(service.calculateReviewScore(findings).score).toBeGreaterThanOrEqual(
      0,
    );
  });
});
