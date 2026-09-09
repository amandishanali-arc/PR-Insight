import { apiRequest } from './apiClient'
import type { GithubConnectionStatus } from '../types/githubConnection'

export const getGithubConnectionStatus = () =>
  apiRequest<GithubConnectionStatus>('/github-app/status')

export async function connectGithub(): Promise<void> {
  const { url } = await apiRequest<{ url: string }>('/github-app/connect')
  window.location.assign(url)
}

export const disconnectGithub = () =>
  apiRequest<{ disconnected: boolean }>('/github-app/disconnect', { method: 'DELETE' })
