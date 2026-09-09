import type { AnalysisMetadata } from '../types/review'

interface AnalysisCoverageProps {
  metadata?: AnalysisMetadata
}

export function AnalysisCoverage({ metadata }: AnalysisCoverageProps) {
  if (!metadata) return null

  return (
    <section className={`coverage-panel ${metadata.partialAnalysis ? 'partial' : ''}`} aria-labelledby="coverage-title">
      <div className="coverage-heading">
        <div>
          <span className="section-kicker">Analysis Coverage</span>
          <h3 id="coverage-title">
            {metadata.reviewedFiles} / {metadata.totalFiles} files reviewed
          </h3>
        </div>
        <span className="coverage-status">
          {metadata.partialAnalysis ? 'Partial analysis' : 'Complete'}
        </span>
      </div>
      <div className="coverage-metrics" aria-label="Analysis coverage details">
        <span>{metadata.skippedFiles} skipped</span>
        <span>{metadata.chunksProcessed} {metadata.chunksProcessed === 1 ? 'batch' : 'batches'}</span>
        {metadata.chunksFailed > 0 && (
          <span className="coverage-failed">
            {metadata.chunksFailed} failed {metadata.chunksFailed === 1 ? 'batch' : 'batches'}
          </span>
        )}
      </div>
      {metadata.partialAnalysis && <p>Some code batches could not be reviewed.</p>}
    </section>
  )
}
