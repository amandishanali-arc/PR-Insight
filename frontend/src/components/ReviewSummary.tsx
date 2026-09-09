import type { Review } from '../types/review'
import { FindingCard } from './FindingCard'
import { SeverityFilter, type SeveritySelection } from './SeverityFilter'
import { useMemo, useState } from 'react'
import { CodeReviewScore } from './CodeReviewScore'
import { ReviewVersions } from './ReviewVersions'
import { AnalysisCoverage } from './AnalysisCoverage'

interface ReviewSummaryProps {
  review: Review
  onAction: () => void
  actionLabel?: string
  contextLabel?: string
  versions?: Review[]
  onVersionSelect?: (id: string) => void
}

export function ReviewSummary({ review, onAction, actionLabel = 'Analyze Another PR', contextLabel = 'Review result', versions, onVersionSelect }: ReviewSummaryProps) {
  const [activeSeverity, setActiveSeverity] = useState<SeveritySelection>('all')
  const counts = useMemo(() => {
    const result: Record<SeveritySelection, number> = {
      all: review.findings.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    }
    review.findings.forEach((finding) => { result[finding.severity] += 1 })
    return result
  }, [review.findings])
  const visibleFindings = activeSeverity === 'all'
    ? review.findings
    : review.findings.filter((finding) => finding.severity === activeSeverity)
  const reviewedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(review.createdAt))

  return (
    <section className="results-section" aria-live="polite" aria-labelledby="review-heading">
      <div className="results-toolbar">
        <span>{contextLabel}</span>
        <button type="button" onClick={onAction}>{actionLabel}</button>
      </div>
      <div className="result-heading">
        <div>
          <span className="section-kicker completion-label"><span aria-hidden="true">✓</span> Analysis complete</span>
          <h2 id="review-heading">
            {review.repositoryOwner}/{review.repositoryName}
            <span> #{review.pullRequestNumber}</span>
          </h2>
          <p className="pr-title">{review.title}</p>
        </div>
        <span className={`pr-state state-${review.state.toLowerCase()}`}>
          {review.state}
        </span>
      </div>

      <div className="metadata-row">
        <div className="metadata-items">
          <span>Repository <strong>{review.repositoryOwner}/{review.repositoryName}</strong></span>
          <span>PR <strong>#{review.pullRequestNumber}</strong></span>
          <span>Version <strong>{review.version ? `v${review.version}` : 'Legacy'}</strong></span>
          <span>
            Commit{' '}
            {review.headSha ? (
              <a href={`https://github.com/${review.repositoryOwner}/${review.repositoryName}/commit/${review.headSha}`} target="_blank" rel="noreferrer">
                <strong>{review.headSha.slice(0, 7)}</strong>
              </a>
            ) : (
              <strong>Unavailable</strong>
            )}
          </span>
          <span>Author <strong>@{review.author}</strong></span>
          <span>Reviewed <strong>{reviewedAt}</strong></span>
        </div>
        <a href={review.pullRequestUrl} target="_blank" rel="noreferrer">
          View on GitHub <span aria-hidden="true">↗</span>
        </a>
      </div>

      {versions && onVersionSelect && (
        <ReviewVersions currentId={review._id} reviews={versions} onSelect={onVersionSelect} />
      )}

      <div className="stats-grid" aria-label="Pull request statistics">
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">F</span>
          <span className="stat-label">Files changed</span>
          <strong>{review.filesChanged}</strong>
        </div>
        <div className="stat-card additions">
          <span className="stat-icon" aria-hidden="true">+</span>
          <span className="stat-label">Additions</span>
          <strong>+{review.additions}</strong>
        </div>
        <div className="stat-card deletions">
          <span className="stat-icon" aria-hidden="true">−</span>
          <span className="stat-label">Deletions</span>
          <strong>−{review.deletions}</strong>
        </div>
        <div className="stat-card issues">
          <span className="stat-icon" aria-hidden="true">!</span>
          <span className="stat-label">Issues found</span>
          <strong>{review.findings.length}</strong>
        </div>
      </div>

      <CodeReviewScore score={review.score} severityCounts={review.severityCounts} />

      <div className="summary-card">
        <div className="summary-icon" aria-hidden="true">✦</div>
        <div>
          <span className="section-kicker">AI Review Summary</span>
          <p>{review.summary}</p>
          <small>AI-generated review. Verify findings before making code changes.</small>
        </div>
      </div>

      <AnalysisCoverage metadata={review.analysisMetadata} />

      <div className="findings-section">
        <div className="findings-heading">
          <div>
            <span className="section-kicker">Code review</span>
            <h2>Findings</h2>
          </div>
          <span className="finding-count">
            {review.findings.length} {review.findings.length === 1 ? 'issue' : 'issues'}
          </span>
        </div>

        {review.findings.length > 0 ? (
          <>
            <SeverityFilter active={activeSeverity} counts={counts} onChange={setActiveSeverity} />
            {visibleFindings.length > 0 ? (
              <div className="findings-list">
                {visibleFindings.map((finding, index) => (
                  <FindingCard
                    key={`${finding.file}-${finding.title}-${index}`}
                    finding={finding}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <p className="no-filter-results">No {activeSeverity} severity findings.</p>
            )}
          </>
        ) : (
          <div className="empty-findings">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>No significant issues detected</strong>
              <p>The AI reviewer did not identify significant problems in the supplied code changes.</p>
              <small>AI-generated review. Verify the result before making code changes.</small>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
