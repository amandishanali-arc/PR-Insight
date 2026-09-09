import { useEffect, useRef, useState } from 'react'

import type { AuthUser } from '../types/auth'

export type AppView = 'login' | 'register' | 'analyze' | 'history' | 'about'

interface HeaderProps {
  activeView: AppView
  onNavigate: (view: AppView) => void
  user: AuthUser | null
  onLogout: () => void
}

const navItems: { label: string; view: AppView; icon: string }[] = [
  { label: 'Analyze', view: 'analyze', icon: 'M4 19h16M7 16l3-3 3 2 5-6' },
  { label: 'Review History', view: 'history', icon: 'M12 8v5l3 2M4.9 5A9 9 0 1 1 3 12' },
  { label: 'About', view: 'about', icon: 'M12 11v5m0-9h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
]

export function Header({ activeView, onNavigate, user, onLogout }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isUserMenuOpen) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setIsUserMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsUserMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isUserMenuOpen])

  const navigate = (view: AppView) => {
    onNavigate(view)
    setIsMenuOpen(false)
    setIsUserMenuOpen(false)
  }

  return (
    <div className="header-shell">
      <header className="site-header">
        <button className="brand" type="button" onClick={() => navigate('analyze')} aria-label="PR Insight home">
          <span className="brand-mark" aria-hidden="true">PI</span><span>PR Insight</span>
        </button>

        <nav className={`primary-nav ${isMenuOpen ? 'open' : ''}`} aria-label="Primary navigation">
          {navItems.filter((item) => user || item.view === 'about').map((item) => (
            <button type="button" className={activeView === item.view ? 'active' : ''} aria-current={activeView === item.view ? 'page' : undefined} onClick={() => navigate(item.view)} key={item.view}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={item.icon} /></svg>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <span className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            <strong>AI Engine Online</strong>
          </span>
          {user ? (
            <div className="user-menu" ref={userMenuRef}>
              <button className="user-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={isUserMenuOpen} onClick={() => setIsUserMenuOpen((open) => !open)}>
                <span>{user.name}</span><span className="user-menu-chevron" aria-hidden="true">⌄</span>
              </button>
              {isUserMenuOpen && (
                <div className="user-dropdown" role="menu">
                  <div className="user-dropdown-identity"><strong>{user.name}</strong><span>{user.email}</span></div>
                  <div className="user-dropdown-separator" />
                  <button type="button" role="menuitem" onClick={onLogout}>Logout</button>
                </div>
              )}
            </div>
          ) : (
            <div className="auth-actions"><button type="button" onClick={() => navigate('login')}>Login</button><button type="button" onClick={() => navigate('register')}>Create Account</button></div>
          )}
          <a className="github-button" href="https://github.com" target="_blank" rel="noreferrer" aria-label="Open GitHub in a new tab">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.83a9.5 9.5 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg>
          </a>
          <button className="menu-button" type="button" aria-label="Toggle navigation menu" aria-expanded={isMenuOpen} onClick={() => setIsMenuOpen((open) => !open)}>
            <span /><span /><span />
          </button>
        </div>
      </header>
    </div>
  )
}
