const steps = [
  ['01', 'Paste a GitHub PR URL'],
  ['02', 'Analyze code changes'],
  ['03', 'Review actionable findings'],
] as const

export function HowItWorks() {
  return (
    <section className="how-it-works" aria-labelledby="how-it-works-heading">
      <span className="section-kicker">Simple workflow</span>
      <h2 id="how-it-works-heading">How it works</h2>
      <ol>
        {steps.map(([number, label]) => (
          <li key={number}>
            <span>{number}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>
    </section>
  )
}
