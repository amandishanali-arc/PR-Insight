import { useEffect, useState } from 'react'
import { getReviewById, getReviews } from '../services/reviewApi'
import type { Review } from '../types/review'
import { ReviewSummary } from './ReviewSummary'
import { VersionComparison } from './VersionComparison'

interface HistoryDetailProps {
  id: string
  onBack: () => void
  onSelectVersion: (id: string) => void
}

export function HistoryDetail({ id, onBack, onSelectVersion }: HistoryDetailProps) {
  const [review, setReview] = useState<Review | null>(null)
  const [versions, setVersions] = useState<Review[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    setReview(null)
    setError(null)
    Promise.all([getReviewById(id), getReviews()])
      .then(([data, allReviews]) => {
        if (!isCurrent) return
        setReview(data)
        setVersions(
          allReviews
            .filter((candidate) =>
              candidate.repositoryOwner === data.repositoryOwner &&
              candidate.repositoryName === data.repositoryName &&
              candidate.pullRequestNumber === data.pullRequestNumber,
            )
            .sort((a, b) => (a.version ?? 0) - (b.version ?? 0)),
        )
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(requestError instanceof Error ? requestError.message : 'Unable to load this saved review.')
      })
    return () => { isCurrent = false }
  }, [id])

  if (error) {
    return <section className="content-view"><div className="history-state error-history" role="alert"><strong>Saved review unavailable</strong><span>{error}</span><button type="button" onClick={onBack}>Back to Review History</button></div></section>
  }

  if (!review) {
    return <section className="content-view"><div className="history-state" role="status"><span className="progress-spinner" /> Loading saved review...</div></section>
  }

  return <><ReviewSummary review={review} versions={versions} onVersionSelect={onSelectVersion} actionLabel="Back to Review History" contextLabel="Saved review" onAction={onBack} /><VersionComparison currentId={review._id} reviews={versions} /></>
}
