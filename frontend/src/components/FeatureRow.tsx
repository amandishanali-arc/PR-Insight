export function FeatureRow() {
  return (
    <div className="feature-row" aria-label="PR Insight capabilities">
      <div className="feature-item">
        <span className="feature-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.3 3.8 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.8a2 2 0 0 0-3.4 0Z" /></svg>
        </span>
        <div><strong>Detect issues early</strong><span>Bugs, security, performance</span></div>
      </div>
      <div className="feature-item">
        <span className="feature-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m9 12 2 2 4-4m5-3.5v5.1c0 4.6-3.1 7.5-8 9.4-4.9-1.9-8-4.8-8-9.4V6.5L12 3Z" /></svg>
        </span>
        <div><strong>Improve code quality</strong><span>Actionable suggestions</span></div>
      </div>
      <div className="feature-item">
        <span className="feature-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 1-4.7-7.3M8.5 11.5l2.3 2.3L20 4.5" /></svg>
        </span>
        <div><strong>Ship with confidence</strong><span>Better, maintainable code</span></div>
      </div>
    </div>
  )
}
