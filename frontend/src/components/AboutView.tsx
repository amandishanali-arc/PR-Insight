export function AboutView() {
  return (
    <section className="content-view" aria-labelledby="about-heading">
      <span className="section-kicker">About the project</span>
      <h1 id="about-heading">Review code with better context.</h1>
      <div className="about-panel">
        <p>PR Insight analyzes GitHub pull request code changes using AI to identify potential bugs, security concerns, performance problems, maintainability issues, and code-quality improvements.</p>
        <p>Reviews are designed to support engineering judgment, not replace it. AI-generated findings should always be verified by a developer before code changes are made.</p>
      </div>
    </section>
  )
}
