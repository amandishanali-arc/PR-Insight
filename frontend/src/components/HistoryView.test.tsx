import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createMockReview } from '../test/factories'
import { getReviews } from '../services/reviewApi'
import { HistoryView } from './HistoryView'

vi.mock('../services/reviewApi', () => ({ getReviews: vi.fn() }))
const mockedGetReviews = vi.mocked(getReviews)

describe('HistoryView', () => {
  it('renders the empty history state', async () => {
    mockedGetReviews.mockResolvedValue([])
    render(<HistoryView onAnalyze={() => undefined} onSelect={() => undefined} />)
    expect(await screen.findByText('No reviews yet')).toBeInTheDocument()
  })

  it('searches saved reviews and displays their versions', async () => {
    mockedGetReviews.mockResolvedValue([createMockReview(), createMockReview({ _id: 'review-2', repositoryName: 'other', title: 'Other change', version: 2 })])
    render(<HistoryView onAnalyze={() => undefined} onSelect={() => undefined} />)
    await screen.findByText('Improve feature')
    await userEvent.type(screen.getByPlaceholderText('Search by repository or PR title'), 'other')
    await waitFor(() => expect(screen.queryByText('Improve feature')).not.toBeInTheDocument())
    expect(screen.getByText('Other change')).toBeInTheDocument()
    expect(screen.getByText('v2')).toBeInTheDocument()
  })
})
