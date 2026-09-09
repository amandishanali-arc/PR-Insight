import type { SeverityCounts } from '../types/review'

interface CodeReviewScoreProps {
  score?: number
  severityCounts?: SeverityCounts
}

const severityLabels: { key: keyof SeverityCounts; label: string }[] = [
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
  { key: 'info', label: 'Info' },
]

export function CodeReviewScore({ score, severityCounts }: CodeReviewScoreProps) {
  if (score === undefined) return null

  return (
    <section className="score-panel" aria-labelledby="score-heading">
      <div className="score-primary">
        <span className="section-kicker" id="score-heading">Code Review Score</span>
        <div className="score-value"><strong>{score}</strong><span>/ 100</span></div>
        <span className={`score-rating rating-${getScoreRating(score).className}`}>
          {getScoreRating(score).label}
        </span>
      </div>
      {severityCounts && (
        <dl className="score-counts">
          {severityLabels.map(({ key, label }) => (
            <div className={`score-count count-${key}`} key={key}>
              <dt>{label}</dt><dd>{severityCounts[key]}</dd>
            </div>
          ))}
        </dl>
      )}
      <p>AI-assisted review score based on detected findings.</p>
    </section>
  )
}

function getScoreRating(score: number): { label: string; className: string } {
  if (score >= 90) return { label: 'Excellent', className: 'excellent' }
  if (score >= 75) return { label: 'Good', className: 'good' }
  if (score >= 60) return { label: 'Needs Attention', className: 'attention' }
  return { label: 'High Risk', className: 'risk' }
}
