import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getCurrentUser, loginRequest, registerRequest } from '../services/authApi'
import { authStorage } from '../services/authStorage'
import type { AuthUser, LoginInput, RegisterInput } from '../types/auth'

interface AuthContextValue {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  loading: boolean
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(() => authStorage.getToken())
  const [loading, setLoading] = useState(true)

  const logout = () => {
    authStorage.clear(); setAccessToken(null); setUser(null); window.location.hash = 'login'
  }

  useEffect(() => {
    const restore = async () => {
      if (!authStorage.getToken()) { setLoading(false); return }
      try { setUser(await getCurrentUser()) } catch { authStorage.clear(); setAccessToken(null) } finally { setLoading(false) }
    }
    void restore()
    const unauthorized = () => { setUser(null); setAccessToken(null); window.location.hash = 'login' }
    window.addEventListener('auth:unauthorized', unauthorized)
    return () => window.removeEventListener('auth:unauthorized', unauthorized)
  }, [])

  const authenticate = (response: { user: AuthUser; accessToken: string }) => {
    authStorage.setToken(response.accessToken); setAccessToken(response.accessToken); setUser(response.user)
  }

  const login = async (input: LoginInput) => authenticate(await loginRequest(input))
  const register = async (input: RegisterInput) => authenticate(await registerRequest(input))

  return <AuthContext.Provider value={{ user, accessToken, isAuthenticated: Boolean(user && accessToken), loading, login, register, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
