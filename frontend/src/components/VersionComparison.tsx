import { useEffect, useState } from 'react'
import { compareReviews } from '../services/reviewApi'
import type { Finding, Review, ReviewComparison } from '../types/review'
import { FindingCard } from './FindingCard'

interface VersionComparisonProps {
  currentId: string
  reviews: Review[]
}

export function VersionComparison({ currentId, reviews }: VersionComparisonProps) {
  const [baseId, setBaseId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [comparison, setComparison] = useState<ReviewComparison | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const currentIndex = reviews.findIndex((review) => review._id === currentId)
    const targetIndex = currentIndex >= 0 ? currentIndex : reviews.length - 1
    const baseIndex = targetIndex > 0 ? targetIndex - 1 : 0
    const fallbackTarget = targetIndex === baseIndex ? 1 : targetIndex
    setBaseId(reviews[baseIndex]?._id ?? '')
    setTargetId(reviews[fallbackTarget]?._id ?? '')
    setComparison(null)
    setError(null)
  }, [currentId, reviews])

  if (reviews.length < 2) return null

  const runComparison = async () => {
    if (!baseId || !targetId || baseId === targetId) return
    setIsLoading(true)
    setError(null)
    setComparison(null)
    try {
      setComparison(await compareReviews(baseId, targetId))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to compare these reviews.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="comparison-panel" aria-labelledby="compare-heading">
      <div className="comparison-heading">
        <div><span className="section-kicker">Stored reviews</span><h3 id="compare-heading">Compare versions</h3></div>
        <span>No new AI analysis</span>
      </div>
      <div className="comparison-controls">
        <label>Base<select value={baseId} onChange={(event) => setBaseId(event.target.value)}>{reviews.map((review) => <option value={review._id} disabled={review._id === targetId} key={review._id}>{versionLabel(review)}</option>)}</select></label>
        <span aria-hidden="true">→</span>
        <label>Compare with<select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{reviews.map((review) => <option value={review._id} disabled={review._id === baseId} key={review._id}>{versionLabel(review)}</option>)}</select></label>
        <button type="button" disabled={isLoading || baseId === targetId} onClick={() => void runComparison()}>{isLoading ? 'Comparing...' : 'Compare Reviews'}</button>
      </div>
      {error && <p className="comparison-error" role="alert">{error}</p>}
      {comparison && <ComparisonResult comparison={comparison} reviews={reviews} />}
    </section>
  )
}

function ComparisonResult({ comparison, reviews }: { comparison: ReviewComparison; reviews: Review[] }) {
  const base = reviews.find((review) => review._id === comparison.baseReview._id)
  const target = reviews.find((review) => review._id === comparison.targetReview._id)
  const scoreDescription = comparison.scoreChange === null ? 'Unavailable' : comparison.scoreChange > 0 ? 'improvement' : comparison.scoreChange < 0 ? 'regression' : 'no change'

  return (
    <div className="comparison-result">
      <div className="comparison-title">
        <div><span className="section-kicker">Review Comparison</span><h3>{base?.repositoryOwner}/{base?.repositoryName} #{base?.pullRequestNumber}</h3></div>
        <strong>{summaryVersion(comparison.baseReview.version)} → {summaryVersion(comparison.targetReview.version)}</strong>
      </div>
      <div className="comparison-metrics">
        <ComparisonMetric label="Score" value={`${formatScore(comparison.baseReview.score)} → ${formatScore(comparison.targetReview.score)}`} delta={formatDelta(comparison.scoreChange)} note={scoreDescription} />
        <ComparisonMetric label="Issues" value={`${base?.findings.length ?? 0} → ${target?.findings.length ?? 0}`} delta={formatDelta(comparison.issueCountChange)} />
        <ComparisonMetric label="Resolved" value={String(comparison.resolvedFindings.length)} />
        <ComparisonMetric label="New" value={String(comparison.newFindings.length)} />
        <ComparisonMetric label="Unchanged" value={String(comparison.unchangedFindings.length)} />
      </div>
      <p className="comparison-note">Comparison is based on AI-generated findings and stored review scores. Finding matches are approximate.</p>
      <ComparisonFindings title="Resolved Findings" note="Not detected in the newer review" findings={comparison.resolvedFindings} empty="No previously detected findings disappeared in this version." tone="resolved" />
      <ComparisonFindings title="New Findings" findings={comparison.newFindings} empty="No new findings were detected." tone="new" />
      <ComparisonFindings title="Still Detected" findings={comparison.unchangedFindings} empty="No matching findings remained between these versions." tone="unchanged" />
    </div>
  )
}

function ComparisonMetric({ label, value, delta, note }: { label: string; value: string; delta?: string; note?: string }) {
  return <div className="comparison-metric"><span>{label}</span><strong>{value}</strong>{delta && <small>{delta} {note}</small>}</div>
}

function ComparisonFindings({ title, note, findings, empty, tone }: { title: string; note?: string; findings: Finding[]; empty: string; tone: string }) {
  return <section className={`comparison-findings ${tone}`}><div className="comparison-findings-heading"><div><h4>{title}</h4>{note && <span>{note}</span>}</div><strong>{findings.length}</strong></div>{findings.length ? <div className="findings-list">{findings.map((finding, index) => <FindingCard finding={finding} index={index} key={`${finding.file}-${finding.title}-${index}`} />)}</div> : <p>{empty}</p>}</section>
}

function versionLabel(review: Review): string { return `${review.version ? `v${review.version}` : 'Legacy'}${review.score === undefined ? '' : ` — Score ${review.score}`}` }
function summaryVersion(version: number | null): string { return version === null ? 'Legacy' : `v${version}` }
function formatScore(score: number | null): string { return score === null ? '—' : String(score) }
function formatDelta(value: number | null): string { return value === null ? '—' : `${value > 0 ? '+' : ''}${value}` }
