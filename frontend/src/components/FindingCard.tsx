import type { Finding } from '../types/review'
import { useState } from 'react'

interface FindingCardProps {
  finding: Finding
  index: number
}

export function FindingCard({ finding, index }: FindingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <article className={`finding-card severity-${finding.severity}`}>
      <div className="finding-card-header">
        <div className="finding-labels">
          <span className="severity-badge">{finding.severity}</span>
          <span className="category-badge">
            {finding.category.replaceAll('_', ' ')}
          </span>
        </div>
        <span className="finding-number">#{String(index + 1).padStart(2, '0')}</span>
      </div>
      <h3>{finding.title}</h3>
      <div className="file-path">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6" /></svg>
        <code>{finding.file}</code>
      </div>
      <p className={`finding-description ${isExpanded ? '' : 'clamped'}`}>
        {finding.description}
      </p>
      <button
        className="details-button"
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        {isExpanded ? 'Hide details' : 'View details'}
        <span aria-hidden="true">{isExpanded ? '↑' : '↓'}</span>
      </button>
      <div className={`finding-details ${isExpanded ? 'expanded' : ''}`}>
        <div className="suggestion">
          <strong>Suggested fix</strong>
          <p>{finding.suggestion}</p>
        </div>
      </div>
    </article>
  )
}
