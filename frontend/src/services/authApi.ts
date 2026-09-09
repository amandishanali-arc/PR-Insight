import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from '../types/auth'
import { apiRequest } from './apiClient'

export function loginRequest(input: LoginInput): Promise<AuthResponse> {
  return apiRequest('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
}

export function registerRequest(input: RegisterInput): Promise<AuthResponse> {
  return apiRequest('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
}

export function getCurrentUser(): Promise<AuthUser> { return apiRequest('/auth/me') }
