import { authStorage } from './authStorage'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

interface ApiErrorBody { message?: string | string[] }

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = authStorage.getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  } catch {
    throw new Error('Unable to connect to PR Insight backend. Make sure it is running and try again.')
  }

  if (!response.ok) {
    const errorBody = await readErrorBody(response)
    const backendMessage = Array.isArray(errorBody?.message) ? errorBody.message.join(' ') : errorBody?.message
    if (response.status === 401) {
      authStorage.clear()
      window.dispatchEvent(new Event('auth:unauthorized'))
    }
    throw new Error(toFriendlyMessage(response.status, backendMessage))
  }
  return (await response.json()) as T
}

function toFriendlyMessage(status: number, message?: string): string {
  if (status === 400) return message || 'The request is invalid.'
  if (status === 401) return message === 'Invalid email or password' ? message : 'Your session has expired. Please sign in again.'
  if (status === 403) return message || 'You do not have permission to access this resource.'
  if (status === 404) return message === 'Review not found' ? 'The saved review could not be found.' : 'The requested resource could not be found.'
  if (status === 409) return message || 'An account with this email already exists.'
  if (status === 429) return message || 'Too many requests. Please try again later.'
  if (status === 502) return 'The AI review service is temporarily unavailable. Please try again.'
  if (status === 503) return 'The GitHub API is temporarily unavailable. Please try again shortly.'
  if (message && status < 500) return message
  return 'PR Insight could not complete the request. Please try again.'
}

async function readErrorBody(response: Response): Promise<ApiErrorBody | null> {
  try { return (await response.json()) as ApiErrorBody } catch { return null }
}
