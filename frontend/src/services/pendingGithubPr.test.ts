import { vi } from 'vitest'
import { pendingGithubPr } from './pendingGithubPr'

const url = 'https://github.com/owner/private-repo/pull/1'
afterEach(() => { sessionStorage.clear(); vi.useRealTimers() })
it('stores only a user-scoped, expiring PR URL and never gives A input to B', () => {
  pendingGithubPr.save('a', url)
  expect(pendingGithubPr.read('b')).toBeNull()
  expect(pendingGithubPr.read('a')).toBe(url)
  pendingGithubPr.save('b', 'https://github.com/other/repo/pull/2')
  pendingGithubPr.clear('a')
  expect(pendingGithubPr.read('a')).toBeNull()
  expect(pendingGithubPr.read('b')).toBe('https://github.com/other/repo/pull/2')
})
it('expires pending input and leaves unrelated session data alone on logout cleanup', () => {
  vi.useFakeTimers()
  pendingGithubPr.save('a', url)
  vi.advanceTimersByTime(30 * 60 * 1000)
  expect(pendingGithubPr.read('a')).toBeNull()
  pendingGithubPr.save('a', url)
  sessionStorage.setItem('unrelated', 'keep')
  pendingGithubPr.clearAll()
  expect(pendingGithubPr.read('a')).toBeNull()
  expect(sessionStorage.getItem('unrelated')).toBe('keep')
})
it('rejects non-PR values rather than persisting arbitrary URLs', () => {
  expect(() => pendingGithubPr.save('a', 'https://example.com/')).toThrow('valid GitHub pull request URL')
})
