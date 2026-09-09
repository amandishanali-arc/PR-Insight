import type { Review } from '../types/review'

interface ReviewVersionsProps {
  currentId: string
  reviews: Review[]
  onSelect: (id: string) => void
}

export function ReviewVersions({ currentId, reviews, onSelect }: ReviewVersionsProps) {
  if (reviews.length < 2) return null

  return (
    <section className="review-versions" aria-labelledby="versions-heading">
      <div>
        <span className="section-kicker">Saved snapshots</span>
        <h3 id="versions-heading">Review Versions</h3>
      </div>
      <div className="version-list">
        {reviews.map((review) => (
          <button
            type="button"
            className={review._id === currentId ? 'active' : ''}
            aria-current={review._id === currentId ? 'true' : undefined}
            onClick={() => onSelect(review._id)}
            key={review._id}
          >
            <strong>{review.version ? `v${review.version}` : 'Legacy'}</strong>
            <span>{review.score === undefined ? 'Not scored' : `Score ${review.score}`}</span>
            <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
          </button>
        ))}
      </div>
    </section>
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}
