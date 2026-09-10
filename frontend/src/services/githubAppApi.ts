import { apiRequest } from './apiClient'
import type { GithubConnectionStatus } from '../types/githubConnection'
import { authStorage } from './authStorage'

export const getGithubConnectionStatus = () =>
  apiRequest<GithubConnectionStatus>('/github-app/status')

export async function connectGithub(pullRequestUrl?: string): Promise<void> {
  const token = authStorage.getToken()
  const query = pullRequestUrl?.trim() ? `?${new URLSearchParams({ pullRequestUrl: pullRequestUrl.trim() })}` : ''
  const { url } = await apiRequest<{ url: string }>(`/github-app/connect${query}`)
  if (token !== authStorage.getToken()) throw new Error('Your session changed. Please connect GitHub again.')
  window.location.assign(url)
}

export const disconnectGithub = () =>
  apiRequest<{ disconnected: boolean }>('/github-app/disconnect', { method: 'DELETE' })
