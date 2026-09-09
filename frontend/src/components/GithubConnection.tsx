import { useCallback, useEffect, useState } from 'react'
import { connectGithub, disconnectGithub, getGithubConnectionStatus } from '../services/githubAppApi'
import type { GithubConnectionStatus } from '../types/githubConnection'

interface GithubConnectionProps {
  connectRequest?: number
}

export function GithubConnection({ connectRequest = 0 }: GithubConnectionProps) {
  const [status, setStatus] = useState<GithubConnectionStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try { setStatus(await getGithubConnectionStatus()) }
    catch { setStatus(null) }
  }, [])

  useEffect(() => { void loadStatus() }, [loadStatus])

  const handleConnect = useCallback(async () => {
    setBusy(true)
    setError(null)
    try { await connectGithub() }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'GitHub could not be connected.')
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (connectRequest > 0) void handleConnect()
  }, [connectRequest, handleConnect])

  const handleDisconnect = async () => {
    setBusy(true)
    setError(null)
    try {
      await disconnectGithub()
      setStatus({ connected: false, installations: [] })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'GitHub could not be disconnected.')
    } finally { setBusy(false) }
  }

  const accounts = status?.installations.map(({ accountLogin }) => accountLogin).join(', ')

  return (
    <aside className="github-connection" aria-label="GitHub connection">
      <div>
        <span className={`github-connection-dot ${status?.connected ? 'connected' : ''}`} aria-hidden="true" />
        <p><strong>{status?.connected ? 'GitHub connected' : 'Private repository access'}</strong>
          <span>{status?.connected ? `Installed for ${accounts}` : 'Connect the GitHub App to review selected private repositories.'}</span>
        </p>
      </div>
      <button type="button" disabled={busy} onClick={() => void (status?.connected ? handleDisconnect() : handleConnect())}>
        {busy ? 'Please wait…' : status?.connected ? 'Disconnect' : 'Connect GitHub'}
      </button>
      {error && <small role="alert">{error}</small>}
    </aside>
  )
}
