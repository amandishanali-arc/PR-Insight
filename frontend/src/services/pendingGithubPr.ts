const PREFIX = 'pr-insight.pending-github-pr:'
const MAX_AGE = 30 * 60 * 1000
const validUrl = (value: unknown): value is string => typeof value === 'string' && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+\/?$/.test(value)

export const pendingGithubPr = {
  save(userId: string, url: string) {
    const value = url.trim()
    if (!value) { this.clear(userId); return }
    if (!validUrl(value)) throw new Error('Enter a valid GitHub pull request URL before connecting.')
    try { sessionStorage.setItem(PREFIX + userId, JSON.stringify({ url: value, expiresAt: Date.now() + MAX_AGE })) }
    catch { throw new Error('This browser could not save your pending PR. Enable session storage before connecting GitHub.') }
  },
  read(userId: string): string | null {
    try {
      const value = JSON.parse(sessionStorage.getItem(PREFIX + userId) ?? 'null') as { url?: unknown; expiresAt?: number } | null
      if (value && validUrl(value.url) && typeof value.expiresAt === 'number' && value.expiresAt > Date.now()) return value.url
      this.clear(userId)
    } catch { this.clear(userId) }
    return null
  },
  clear(userId: string) {
    try { sessionStorage.removeItem(PREFIX + userId) } catch { /* Storage may be disabled. */ }
  },
  clearAll() {
    try {
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index)
        if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key)
      }
    } catch { /* Storage may be disabled. */ }
  },
}
