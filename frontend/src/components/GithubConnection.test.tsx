import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GithubConnection } from './GithubConnection'
import * as api from '../services/githubAppApi'

vi.mock('../services/githubAppApi')

describe('GithubConnection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows connected installation data returned by the backend', async () => {
    vi.mocked(api.getGithubConnectionStatus).mockResolvedValue({
      connected: true,
      installations: [{ installationId: 42, accountLogin: 'octocat', accountType: 'User' }],
    })
    render(<GithubConnection />)
    expect(await screen.findByText('GitHub connected')).toBeInTheDocument()
    expect(screen.getByText('Installed for octocat')).toBeInTheDocument()
  })

  it('disconnects without inventing connection state', async () => {
    vi.mocked(api.getGithubConnectionStatus).mockResolvedValue({
      connected: true,
      installations: [{ installationId: 42, accountLogin: 'octocat', accountType: 'User' }],
    })
    vi.mocked(api.disconnectGithub).mockResolvedValue({ disconnected: true })
    render(<GithubConnection />)
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(screen.getByText('Private repository access')).toBeInTheDocument())
  })
})
