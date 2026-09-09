export interface GithubInstallation {
  installationId: number
  accountLogin: string
  accountType: string
}

export interface GithubConnectionStatus {
  connected: boolean
  installations: GithubInstallation[]
}
