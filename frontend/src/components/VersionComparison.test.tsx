import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { compareReviews } from '../services/reviewApi'
import { createMockFinding, createMockReview } from '../test/factories'
import { VersionComparison } from './VersionComparison'

vi.mock('../services/reviewApi', () => ({ compareReviews: vi.fn() }))

it('renders stored comparison values without triggering new analysis', async () => {
  const reviews = [
    createMockReview({ _id: 'one', version: 1, score: 70, findings: [createMockFinding()] }),
    createMockReview({ _id: 'two', version: 2, score: 80, findings: [] }),
  ]
  vi.mocked(compareReviews).mockResolvedValue({
    baseReview: { _id: 'one', version: 1, headSha: 'a', score: 70, createdAt: reviews[0].createdAt },
    targetReview: { _id: 'two', version: 2, headSha: 'b', score: 80, createdAt: reviews[1].createdAt },
    scoreChange: 10, issueCountChange: -1,
    severityChange: { critical: 0, high: 0, medium: -1, low: 0, info: 0 },
    resolvedFindings: reviews[0].findings, newFindings: [], unchangedFindings: [],
  })
  render(<VersionComparison currentId="two" reviews={reviews} />)
  await userEvent.click(screen.getByRole('button', { name: 'Compare Reviews' }))
  expect(await screen.findByText(/\+10 improvement/)).toBeInTheDocument()
  expect(screen.getByText('Resolved Findings')).toBeInTheDocument()
  expect(compareReviews).toHaveBeenCalledWith('one', 'two')
})
