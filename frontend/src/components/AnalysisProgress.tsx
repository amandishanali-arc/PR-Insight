import { useEffect, useState } from 'react'

const STEPS = [
  'Reading pull request',
  'Collecting changed files',
  'Preparing reviewable changes',
  'Analyzing code batches',
  'Finalizing review',
]

export function AnalysisProgress() {
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, STEPS.length - 1))
    }, 2200)

    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className="analysis-progress" role="status" aria-live="polite">
      <div className="progress-heading">
        <span className="progress-spinner" aria-hidden="true" />
        <div>
          <strong>Analyzing pull request...</strong>
          <p>This may take a moment while the review is generated.</p>
        </div>
      </div>
      <ol>
        {STEPS.map((step, index) => {
          const state = index < activeStep ? 'complete' : index === activeStep ? 'active' : 'pending'
          return (
            <li className={state} key={step}>
              <span aria-hidden="true">{state === 'complete' ? '✓' : ''}</span>
              {step}
            </li>
          )
        })}
      </ol>
      <p className="progress-note">Progress stages are an estimate, not live server telemetry.</p>
    </div>
  )
}
