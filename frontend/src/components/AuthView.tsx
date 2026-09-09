import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'

interface AuthViewProps { mode: 'login' | 'register'; onSwitch: () => void; onSuccess: () => void }

export function AuthView({ mode, onSwitch, onSuccess }: AuthViewProps) {
  const { login, register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null)
    if (!email.trim() || !password || (mode === 'register' && !name.trim())) return setError('Please complete all required fields.')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (mode === 'register' && password !== confirmPassword) return setError('Passwords do not match.')
    setSubmitting(true)
    try {
      if (mode === 'login') await login({ email, password })
      else await register({ name, email, password })
      onSuccess()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Authentication failed. Please try again.')
    } finally { setSubmitting(false) }
  }

  return (
    <section className="auth-view" aria-labelledby="auth-title">
      <div className="auth-panel">
        <span className="section-kicker">Secure workspace</span>
        <h1 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p>{mode === 'login' ? 'Sign in to analyze pull requests and access your review history.' : 'Start building a private history of AI-assisted pull request reviews.'}</p>
        <form onSubmit={submit}>
          {mode === 'register' && <label>Name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" disabled={submitting} /></label>}
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" disabled={submitting} /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} disabled={submitting} /></label>
          {mode === 'register' && <label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" disabled={submitting} /></label>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}</button>
        </form>
        <div className="auth-switch">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button type="button" onClick={onSwitch}>{mode === 'login' ? 'Create one' : 'Sign in'}</button>
        </div>
      </div>
    </section>
  )
}
