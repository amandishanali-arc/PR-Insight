import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'
import { AuthProvider, useAuth } from './auth/AuthContext'
import * as authApi from './services/authApi'
import * as githubApi from './services/githubAppApi'
import * as reviewApi from './services/reviewApi'
import { authStorage } from './services/authStorage'
import { pendingGithubPr } from './services/pendingGithubPr'
import { createMockReview } from './test/factories'
import type { AuthResponse, AuthUser } from './types/auth'
import type { GithubConnectionStatus } from './types/githubConnection'

vi.mock('./services/authApi')
vi.mock('./services/githubAppApi')
vi.mock('./services/reviewApi')

const userA = { id: 'user-a', name: 'User A', email: 'a@example.com' }
const userB = { id: 'user-b', name: 'User B', email: 'b@example.com' }
const disconnected = { connected: false, installations: [] }
const connected: GithubConnectionStatus = { connected: true, installations: [{ installationId: 42, accountLogin: 'account-a', accountType: 'User' }] }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function SessionControls() {
  const { user, login, logout } = useAuth()
  return <>
    <output data-testid="current-user">{user?.id ?? 'signed-out'}</output>
    <button onClick={() => void login({ email: userA.email, password: 'test-password' })}>Login A</button>
    <button onClick={() => void login({ email: userB.email, password: 'test-password' })}>Login B</button>
    <button onClick={logout}>Test logout</button>
  </>
}
function renderApp() {
  return render(<AuthProvider><SessionControls /><App /></AuthProvider>)
}
async function login(name: 'A' | 'B') {
  fireEvent.click(screen.getByText(`Login ${name}`))
  await waitFor(() => expect(screen.getByTestId('current-user')).toHaveTextContent(`user-${name.toLowerCase()}`))
  await screen.findByLabelText('GitHub Pull Request URL')
}
beforeEach(() => {
  vi.resetAllMocks()
  authStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  window.location.hash = '#analyze'
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.mocked(authApi.loginRequest).mockImplementation(async ({ email }) => {
    const user = email === userA.email ? userA : userB
    return { user, accessToken: user.id }
  })
  vi.mocked(githubApi.getGithubConnectionStatus).mockImplementation(async () => authStorage.getToken() === userA.id ? connected : disconnected)
  vi.mocked(reviewApi.getReviews).mockResolvedValue([])
})
afterEach(() => { authStorage.clear(); vi.restoreAllMocks() })

it('preserves the pending PR through a full GitHub round trip, restores once, and refreshes status', async () => {
  vi.mocked(githubApi.getGithubConnectionStatus).mockResolvedValue(disconnected)
  const app = renderApp()
  await login('A')
  const url = 'https://github.com/owner/private-repo/pull/1'
  fireEvent.change(screen.getByLabelText('GitHub Pull Request URL'), { target: { value: url } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' })) })
  expect(pendingGithubPr.read(userA.id)).toBe(url)
  expect(pendingGithubPr.read(userB.id)).toBeNull()
  expect(githubApi.connectGithub).toHaveBeenCalledWith(url)
  app.unmount()
  window.history.replaceState(null, '', '/?github=connected#analyze')
  vi.mocked(authApi.getCurrentUser).mockResolvedValue(userA)
  vi.mocked(githubApi.getGithubConnectionStatus).mockResolvedValue(connected)
  renderApp()
  await waitFor(() => expect(screen.getByLabelText('GitHub Pull Request URL')).toHaveValue(url))
  await screen.findByText('GitHub connected')
  expect(pendingGithubPr.read(userA.id)).toBeNull()
  expect(window.location.search).toBe('')
  expect(reviewApi.createReview).not.toHaveBeenCalled()
  expect(githubApi.getGithubConnectionStatus).toHaveBeenCalledTimes(2)
})

it('does not restore A pending input into a callback opened by B and clears it on logout', async () => {
  pendingGithubPr.save(userA.id, 'https://github.com/owner/private-repo/pull/1')
  authStorage.setToken(userB.id)
  vi.mocked(authApi.getCurrentUser).mockResolvedValue(userB)
  window.history.replaceState(null, '', '/?github=connected#analyze')
  renderApp()
  expect(await screen.findByLabelText('GitHub Pull Request URL')).toHaveValue('')
  fireEvent.click(screen.getByText('Test logout'))
  expect(pendingGithubPr.read(userA.id)).toBeNull()
})

it('restores the PR and keeps the pending copy on a failed GitHub callback', async () => {
  const url = 'https://github.com/owner/private-repo/pull/1'
  pendingGithubPr.save(userA.id, url)
  authStorage.setToken(userA.id)
  vi.mocked(authApi.getCurrentUser).mockResolvedValue(userA)
  window.history.replaceState(null, '', '/?github=error&reason=repository_access#analyze')
  renderApp()
  await waitFor(() => expect(screen.getByLabelText('GitHub Pull Request URL')).toHaveValue(url))
  await screen.findByText(/GitHub could not verify access/)
  expect(pendingGithubPr.read(userA.id)).toBe(url)
  expect(window.location.search).toBe('')
})

async function loginThroughForm(user: AuthUser) {
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: user.email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
  await screen.findByLabelText('GitHub Pull Request URL')
}

function logoutThroughMenu(user: AuthUser) {
  fireEvent.click(screen.getByRole('button', { name: user.name }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }))
}

it('clears the reported URL and displayed result through the actual login/logout UI', async () => {
  vi.mocked(reviewApi.createReview).mockResolvedValue(createMockReview({ title: 'A transient result' }))
  render(<AuthProvider><App /></AuthProvider>)
  await loginThroughForm(userA)
  const input = screen.getByLabelText('GitHub Pull Request URL')
  expect(input).toHaveAttribute('autocomplete', 'off')
  fireEvent.change(input, { target: { value: 'https://github.com/vercel/next.js/pull/63226' } })
  fireEvent.click(screen.getByRole('button', { name: 'Analyze Pull Request' }))
  await screen.findByText('A transient result')
  await screen.findByText('GitHub connected')
  logoutThroughMenu(userA)
  await loginThroughForm(userB)
  expect(screen.getByLabelText('GitHub Pull Request URL')).toHaveValue('')
  expect(screen.queryByText('A transient result')).not.toBeInTheDocument()
  expect(screen.queryByText('GitHub connected')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Review History/ }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyze' })) })
  expect(screen.getByLabelText('GitHub Pull Request URL')).toHaveValue('')
  expect(githubApi.disconnectGithub).not.toHaveBeenCalled()
})

it('clears transient analysis errors on logout without restoring the old URL', async () => {
  vi.mocked(reviewApi.createReview).mockRejectedValue(new Error('A transient failure'))
  render(<AuthProvider><App /></AuthProvider>)
  await loginThroughForm(userA)
  fireEvent.change(screen.getByLabelText('GitHub Pull Request URL'), { target: { value: 'https://github.com/vercel/next.js/pull/63226' } })
  fireEvent.click(screen.getByRole('button', { name: 'Analyze Pull Request' }))
  await screen.findByText('A transient failure')
  logoutThroughMenu(userA)
  await loginThroughForm(userB)
  expect(screen.queryByText('A transient failure')).not.toBeInTheDocument()
  expect(screen.getByLabelText('GitHub Pull Request URL')).toHaveValue('')
})

it('Analyze Another PR clears only transient state and navigation does not restore it', async () => {
  vi.mocked(reviewApi.createReview).mockResolvedValue(createMockReview({ title: 'A transient result' }))
  renderApp()
  await login('A')
  fireEvent.change(screen.getByLabelText('GitHub Pull Request URL'), { target: { value: 'https://github.com/vercel/next.js/pull/63226' } })
  fireEvent.click(screen.getByRole('button', { name: 'Analyze Pull Request' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Analyze Another PR' }))
  expect(screen.getByLabelText('GitHub Pull Request URL')).toHaveValue('')
  expect(screen.queryByText('A transient result')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /About/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }))
  expect(screen.getByLabelText('GitHub Pull Request URL')).toHaveValue('')
  await screen.findByText('GitHub connected')
  expect(githubApi.disconnectGithub).not.toHaveBeenCalled()
})

it('clears PR input and GitHub status after logout and fetches fresh status for B', async () => {
  renderApp()
  await login('A')
  fireEvent.change(screen.getByLabelText('GitHub Pull Request URL'), { target: { value: 'https://github.com/owner/private/pull/1' } })
  await screen.findByText('GitHub connected')
  fireEvent.click(screen.getByText('Test logout'))
  expect(authStorage.getToken()).toBeNull()
  expect(screen.queryByText('GitHub connected')).not.toBeInTheDocument()
  await login('B')
  expect(screen.getByLabelText('GitHub Pull Request URL')).toHaveValue('')
  await waitFor(() => expect(githubApi.getGithubConnectionStatus).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('GitHub connected')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeInTheDocument()
  expect(githubApi.disconnectGithub).not.toHaveBeenCalled()
})

it('also resets the workspace on a direct change of authenticated user', async () => {
  renderApp()
  await login('A')
  fireEvent.change(screen.getByLabelText('GitHub Pull Request URL'), { target: { value: 'https://github.com/owner/private/pull/1' } })
  await screen.findByText('GitHub connected')
  await login('B')
  expect(screen.getByLabelText('GitHub Pull Request URL')).toHaveValue('')
  await waitFor(() => expect(githubApi.getGithubConnectionStatus).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('GitHub connected')).not.toBeInTheDocument()
})

it('ignores A review and GitHub status responses arriving after B signs in', async () => {
  const status = deferred<GithubConnectionStatus>()
  const review = deferred<ReturnType<typeof createMockReview>>()
  vi.mocked(githubApi.getGithubConnectionStatus).mockReturnValueOnce(status.promise).mockResolvedValue(disconnected)
  vi.mocked(reviewApi.createReview).mockReturnValue(review.promise)
  renderApp()
  await login('A')
  fireEvent.change(screen.getByLabelText('GitHub Pull Request URL'), { target: { value: 'https://github.com/owner/private/pull/1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Analyze Pull Request' }))
  fireEvent.click(screen.getByText('Test logout'))
  await login('B')
  await act(async () => { status.resolve(connected); review.resolve(createMockReview({ title: 'A private result' })) })
  expect(screen.queryByText('GitHub connected')).not.toBeInTheDocument()
  expect(screen.queryByText('A private result')).not.toBeInTheDocument()
  expect(screen.getByLabelText('GitHub Pull Request URL')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Analyze Pull Request' })).toBeDisabled()
})

it('does not restore A over a new B session when auth/me finishes late', async () => {
  const restored = deferred<AuthUser>()
  authStorage.setToken(userA.id)
  vi.mocked(authApi.getCurrentUser).mockReturnValue(restored.promise)
  renderApp()
  fireEvent.click(screen.getByText('Test logout'))
  await login('B')
  await act(async () => restored.resolve(userA))
  expect(screen.getByTestId('current-user')).toHaveTextContent(userB.id)
  expect(authStorage.getToken()).toBe(userB.id)
  expect(screen.queryByText('GitHub connected')).not.toBeInTheDocument()
})

it('does not complete a pending login after logout', async () => {
  const pending = deferred<AuthResponse>()
  vi.mocked(authApi.loginRequest).mockReturnValue(pending.promise)
  renderApp()
  fireEvent.click(screen.getByText('Login A'))
  fireEvent.click(screen.getByText('Test logout'))
  await act(async () => pending.resolve({ user: userA, accessToken: userA.id }))
  expect(screen.getByTestId('current-user')).toHaveTextContent('signed-out')
  expect(authStorage.getToken()).toBeNull()
})

it('clears transient input on session expiry, including when the same user logs back in', async () => {
  renderApp()
  await login('A')
  fireEvent.change(screen.getByLabelText('GitHub Pull Request URL'), { target: { value: 'https://github.com/owner/private/pull/1' } })
  act(() => window.dispatchEvent(new Event('auth:unauthorized')))
  expect(screen.queryByLabelText('GitHub Pull Request URL')).not.toBeInTheDocument()
  expect(authStorage.getToken()).toBeNull()
  await login('A')
  expect(screen.getByLabelText('GitHub Pull Request URL')).toHaveValue('')
})

it('keeps saved history available to A and fetches B history separately', async () => {
  const saved = createMockReview({ title: 'A saved review' })
  vi.mocked(reviewApi.getReviews).mockImplementation(async () => authStorage.getToken() === userA.id ? [saved] : [])
  renderApp()
  await login('A')
  fireEvent.click(screen.getByRole('button', { name: /Review History/ }))
  await screen.findByText('A saved review')
  fireEvent.click(screen.getByText('Test logout'))
  await login('B')
  fireEvent.click(screen.getByRole('button', { name: /Review History/ }))
  await waitFor(() => expect(reviewApi.getReviews).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('A saved review')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Test logout'))
  await login('A')
  fireEvent.click(screen.getByRole('button', { name: /Review History/ }))
  await screen.findByText('A saved review')
})
