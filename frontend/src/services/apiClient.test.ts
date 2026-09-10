import { vi } from 'vitest'
import { apiRequest } from './apiClient'
import { authStorage } from './authStorage'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); authStorage.clear() })

it('uses the configured production backend for GitHub connection requests', async () => {
  vi.stubEnv('VITE_API_URL', 'https://backend.example.com/')
  vi.resetModules()
  const fetch = vi.fn().mockResolvedValue(new Response('{"url":"https://github.com/login/oauth/authorize"}'))
  vi.stubGlobal('fetch', fetch)
  const { apiRequest: configuredRequest } = await import('./apiClient')
  await configuredRequest('/github-app/connect')
  expect(fetch).toHaveBeenCalledWith('https://backend.example.com/github-app/connect', expect.anything())
})

it.each([true, false])('a late 401 only clears the session that made the request (changed=%s)', async (changed) => {
  let respond!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { respond = resolve })))
  authStorage.setToken('test-user-a')
  const request = apiRequest('/github-app/status')
  const rejection = expect(request).rejects.toThrow('Your session has expired')
  if (changed) authStorage.setToken('test-user-b')
  respond(new Response('{}', { status: 401 }))
  await rejection
  expect(authStorage.getToken()).toBe(changed ? 'test-user-b' : null)
})
