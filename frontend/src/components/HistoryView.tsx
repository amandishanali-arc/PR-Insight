import { useEffect, useMemo, useState } from 'react'
import { getReviews } from '../services/reviewApi'
import type { Review } from '../types/review'

interface HistoryViewProps {
  onAnalyze: () => void
  onSelect: (id: string) => void
}

export function HistoryView({ onAnalyze, onSelect }: HistoryViewProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let isCurrent = true
    setIsLoading(true)
    setError(null)
    getReviews()
      .then((data) => { if (isCurrent) setReviews(data) })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(requestError instanceof Error ? requestError.message : 'Unable to load review history.')
      })
      .finally(() => { if (isCurrent) setIsLoading(false) })
    return () => { isCurrent = false }
  }, [reloadKey])

  const visibleReviews = useMemo(() => {
    const query = search.trim().toLowerCase()
    return reviews.filter((review) => {
      const matchesStatus = status === 'all' || review.status.toLowerCase() === status
      const searchable = `${review.repositoryOwner}/${review.repositoryName} ${review.title}`.toLowerCase()
      return matchesStatus && (!query || searchable.includes(query))
    })
  }, [reviews, search, status])

  return (
    <section className="content-view" aria-labelledby="history-heading">
      <span className="section-kicker">Saved reviews</span>
      <h1 id="history-heading">Review History</h1>
      <p className="view-subtitle">Previously analyzed pull requests</p>

      {isLoading ? (
        <div className="history-state" role="status"><span className="progress-spinner" /> Loading saved reviews...</div>
      ) : error ? (
        <div className="history-state error-history" role="alert">
          <strong>Review history could not be loaded</strong><span>{error}</span>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)}>Try Again</button>
        </div>
      ) : reviews.length === 0 ? (
        <div className="history-state empty-history">
          <strong>No reviews yet</strong>
          <span>Analyze a GitHub pull request to see it here.</span>
          <button type="button" onClick={onAnalyze}>Analyze Pull Request</button>
        </div>
      ) : (
        <>
          <div className="history-controls">
            <label>
              <span className="sr-only">Search review history</span>
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by repository or PR title" />
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </label>
          </div>
          <div className="history-list">
            <div className="history-header" aria-hidden="true">
              <span>Repository</span><span>PR</span><span>Title</span><span>Score</span><span>Issues</span><span>Status</span><span>Reviewed</span>
            </div>
            {visibleReviews.map((review) => (
              <button className="history-row" type="button" onClick={() => onSelect(review._id)} key={review._id}>
                <strong data-label="Repository">{review.repositoryOwner}/{review.repositoryName}</strong>
                <span data-label="PR">
                  #{review.pullRequestNumber}{' '}
                  <span className="version-badge">{review.version ? `v${review.version}` : 'Legacy'}</span>
                </span>
                <span className="history-title" data-label="Title">{review.title}</span>
                <span className="history-score" data-label="Score">{review.score === undefined ? '—' : `${review.score}/100`}</span>
                <span data-label="Issues">{review.findings.length} {review.findings.length === 1 ? 'issue' : 'issues'}</span>
                <span data-label="Status" className={`history-status status-${review.status.toLowerCase()}`}>{review.status}</span>
                <time data-label="Reviewed" dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
              </button>
            ))}
          </div>
          {visibleReviews.length === 0 && <div className="no-history-results">No saved reviews match these filters.</div>}
        </>
      )}
    </section>
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}
