import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockFinding, createMockReview } from '../test/factories'
import { ReviewSummary } from './ReviewSummary'

describe('ReviewSummary', () => {
  it('renders score, version, coverage, and filters findings', async () => {
    const review = createMockReview({ findings: [createMockFinding({ severity: 'high', title: 'High issue' }), createMockFinding({ severity: 'low', title: 'Low issue' })] })
    render(<ReviewSummary review={review} onAction={() => undefined} />)
    expect(screen.getByText('92')).toBeInTheDocument()
    expect(screen.getByText('v1')).toBeInTheDocument()
    expect(screen.getByText('4 / 4 files reviewed')).toBeInTheDocument()
    expect(screen.getByText('1 batch')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /high 1/i }))
    expect(screen.getByText('High issue')).toBeInTheDocument()
    expect(screen.queryByText('Low issue')).not.toBeInTheDocument()
  })

  it('renders a legacy review without analysis metadata', () => {
    render(<ReviewSummary review={createMockReview({ analysisMetadata: undefined })} onAction={() => undefined} />)
    expect(screen.queryByText('Analysis Coverage')).not.toBeInTheDocument()
  })
})
