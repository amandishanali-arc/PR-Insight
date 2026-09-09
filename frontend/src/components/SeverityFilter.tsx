import type { FindingSeverity } from '../types/review'

export type SeveritySelection = 'all' | FindingSeverity

interface SeverityFilterProps {
  active: SeveritySelection
  counts: Record<SeveritySelection, number>
  onChange: (severity: SeveritySelection) => void
}

const FILTERS: SeveritySelection[] = ['all', 'critical', 'high', 'medium', 'low', 'info']

export function SeverityFilter({ active, counts, onChange }: SeverityFilterProps) {
  return (
    <div className="severity-filters" aria-label="Filter findings by severity">
      {FILTERS.map((filter) => (
        <button
          type="button"
          className={active === filter ? 'active' : ''}
          aria-pressed={active === filter}
          onClick={() => onChange(filter)}
          key={filter}
        >
          <span>{filter}</span>
          <span className="filter-count">{counts[filter]}</span>
        </button>
      ))}
    </div>
  )
}
