export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface Finding {
  file: string
  category: string
  severity: FindingSeverity
  title: string
  description: string
  suggestion: string
}

export interface SeverityCounts {
  critical: number
  high: number
  medium: number
  low: number
  info: number
}

export interface AnalysisMetadata {
  totalFiles: number
  reviewedFiles: number
  skippedFiles: number
  chunksProcessed: number
  chunksFailed: number
  partialAnalysis: boolean
}

export interface Review {
  _id: string
  pullRequestUrl: string
  repositoryOwner: string
  repositoryName: string
  pullRequestNumber: number
  headSha?: string
  version?: number
  title: string
  author: string
  state: string
  filesChanged: number
  additions: number
  deletions: number
  summary: string
  findings: Finding[]
  score?: number
  severityCounts?: SeverityCounts
  analysisMetadata?: AnalysisMetadata
  status: string
  createdAt: string
  updatedAt: string
}

export interface ComparisonReviewSummary {
  _id: string
  version: number | null
  headSha: string | null
  score: number | null
  createdAt: string | null
}

export interface ReviewComparison {
  baseReview: ComparisonReviewSummary
  targetReview: ComparisonReviewSummary
  scoreChange: number | null
  issueCountChange: number
  severityChange: SeverityCounts
  resolvedFindings: Finding[]
  newFindings: Finding[]
  unchangedFindings: Finding[]
}
