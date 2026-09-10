import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { getCurrentUser, loginRequest, registerRequest } from '../services/authApi'
import { authStorage } from '../services/authStorage'
import { pendingGithubPr } from '../services/pendingGithubPr'
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
  const sessionVersion = useRef(0)

  const logout = () => {
    pendingGithubPr.clearAll()
    sessionVersion.current += 1
    authStorage.clear(); setAccessToken(null); setUser(null); setLoading(false); window.location.hash = 'login'
  }

  useEffect(() => {
    const version = ++sessionVersion.current
    const restore = async () => {
      if (!authStorage.getToken()) { setLoading(false); return }
      try {
        const restoredUser = await getCurrentUser()
        if (version === sessionVersion.current) setUser(restoredUser)
      } catch {
        if (version === sessionVersion.current) { authStorage.clear(); setAccessToken(null); setUser(null) }
      } finally { if (version === sessionVersion.current) setLoading(false) }
    }
    void restore()
    const unauthorized = () => {
      pendingGithubPr.clearAll()
      sessionVersion.current += 1
      authStorage.clear(); setUser(null); setAccessToken(null); setLoading(false); window.location.hash = 'login'
    }
    window.addEventListener('auth:unauthorized', unauthorized)
    return () => { sessionVersion.current += 1; window.removeEventListener('auth:unauthorized', unauthorized) }
  }, [])

  const authenticate = (response: { user: AuthUser; accessToken: string }) => {
    if (user && user.id !== response.user.id) pendingGithubPr.clear(user.id)
    authStorage.setToken(response.accessToken); setAccessToken(response.accessToken); setUser(response.user)
  }

  const login = async (input: LoginInput) => {
    const version = ++sessionVersion.current
    const response = await loginRequest(input)
    if (version === sessionVersion.current) { authenticate(response); setLoading(false) }
  }
  const register = async (input: RegisterInput) => {
    const version = ++sessionVersion.current
    const response = await registerRequest(input)
    if (version === sessionVersion.current) { authenticate(response); setLoading(false) }
  }

  return <AuthContext.Provider value={{ user, accessToken, isAuthenticated: Boolean(user && accessToken), loading, login, register, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
