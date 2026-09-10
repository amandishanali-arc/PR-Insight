import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { AnalyzeForm } from './components/AnalyzeForm'
import { AnalysisProgress } from './components/AnalysisProgress'
import { AboutView } from './components/AboutView'
import { ErrorState } from './components/ErrorState'
import { FeatureRow } from './components/FeatureRow'
import { Footer } from './components/Footer'
import { Header, type AppView } from './components/Header'
import { HistoryDetail } from './components/HistoryDetail'
import { HistoryView } from './components/HistoryView'
import { HowItWorks } from './components/HowItWorks'
import { ReviewSummary } from './components/ReviewSummary'
import { createReview } from './services/reviewApi'
import type { Review } from './types/review'
import { AuthView } from './components/AuthView'
import { useAuth } from './auth/AuthContext'
import { GithubConnection } from './components/GithubConnection'
import { connectGithub } from './services/githubAppApi'
import { pendingGithubPr } from './services/pendingGithubPr'

interface AppRoute {
  view: AppView
  reviewId: string | null
}

const readRouteFromHash = (): AppRoute => {
  const hash = window.location.hash.slice(1)
  if (hash === 'login') return { view: 'login', reviewId: null }
  if (hash === 'register') return { view: 'register', reviewId: null }
  if (hash === 'about') return { view: 'about', reviewId: null }
  if (hash === 'history') return { view: 'history', reviewId: null }
  if (hash.startsWith('history/') && hash.length > 8) {
    return { view: 'history', reviewId: hash.slice(8) }
  }
  return { view: 'analyze', reviewId: null }
}

function App() {
  const { user } = useAuth()
  // Discard every user's input, results, history view, and GitHub status together.
  return <UserWorkspace key={user?.id ?? 'signed-out'} />
}

function UserWorkspace() {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth()
  const [review, setReview] = useState<Review | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pullRequestUrl, setPullRequestUrl] = useState('')
  const [githubConnectRequest, setGithubConnectRequest] = useState(0)
  const initialRoute = readRouteFromHash()
  const [activeView, setActiveView] = useState<AppView>(initialRoute.view)
  const [historyReviewId, setHistoryReviewId] = useState<string | null>(initialRoute.reviewId)
  const inputRef = useRef<HTMLInputElement>(null)
  const analysisRequest = useRef(0)

  useEffect(() => () => { analysisRequest.current += 1 }, [])

  useEffect(() => {
    if (!user || authLoading) return
    const url = new URL(window.location.href)
    const result = url.searchParams.get('github')
    if (result !== 'connected' && result !== 'error') return
    const pending = pendingGithubPr.read(user.id)
    if (pending) setPullRequestUrl(pending)
    if (result === 'connected') pendingGithubPr.clear(user.id)
    else {
      const reason = url.searchParams.get('reason')
      setError(reason === 'repository_access'
        ? 'GitHub could not verify access to this repository. Check your account and repository selection, then Connect GitHub again.'
        : reason === 'authorization'
          ? 'GitHub authorization was cancelled, invalid, or expired. Your PR is preserved; Connect GitHub again.'
          : 'GitHub connection could not be completed. Your PR is preserved; try Connect GitHub again shortly.')
    }
    url.searchParams.delete('github')
    url.searchParams.delete('reason')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [user, authLoading])

  const handleConnectGithub = useCallback(async () => {
    if (!user) return
    pendingGithubPr.save(user.id, pullRequestUrl)
    await connectGithub(pullRequestUrl)
  }, [user, pullRequestUrl])

  useEffect(() => {
    const syncView = () => {
      let route = readRouteFromHash()
      if (!authLoading && !isAuthenticated && !['login', 'register', 'about'].includes(route.view)) {
        window.history.replaceState(null, '', '#login')
        route = { view: 'login', reviewId: null }
      }
      if (!authLoading && isAuthenticated && ['login', 'register'].includes(route.view)) {
        window.history.replaceState(null, '', '#analyze')
        route = { view: 'analyze', reviewId: null }
      }
      setActiveView(route.view)
      setHistoryReviewId(route.reviewId)
      if (!['#login', '#register', '#analyze', '#history', '#about'].includes(window.location.hash) && !route.reviewId) {
        window.history.replaceState(null, '', isAuthenticated ? '#analyze' : '#login')
      }
    }

    syncView()
    window.addEventListener('hashchange', syncView)
    return () => window.removeEventListener('hashchange', syncView)
  }, [authLoading, isAuthenticated])

  const handleAnalyze = async (pullRequestUrl: string) => {
    const request = ++analysisRequest.current
    setIsLoading(true)
    setError(null)
    setReview(null)

    try {
      const result = await createReview(pullRequestUrl)
      if (request === analysisRequest.current) setReview(result)
    } catch (requestError) {
      if (request !== analysisRequest.current) return
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Something went wrong while analyzing the pull request.',
      )
    } finally {
      if (request === analysisRequest.current) setIsLoading(false)
    }
  }

  const clearAnalyzeState = () => {
    analysisRequest.current += 1
    setReview(null)
    setError(null)
    setPullRequestUrl('')
    setIsLoading(false)
  }

  const handleLogout = () => {
    clearAnalyzeState()
    logout()
  }

  const handleNewReview = () => {
    window.location.hash = 'analyze'
    clearAnalyzeState()
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleNavigate = (view: AppView) => {
    if (!isAuthenticated && (view === 'analyze' || view === 'history')) view = 'login'
    setActiveView(view)
    setHistoryReviewId(null)
    window.location.hash = view
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleHistorySelect = (id: string) => {
    window.location.hash = `history/${id}`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="app-shell">
      <Header activeView={activeView} onNavigate={handleNavigate} user={user} onLogout={handleLogout} />

      <main>
        {authLoading && <section className="auth-loading"><span className="progress-spinner" /> Restoring your session...</section>}
        {!authLoading && activeView === 'login' && <AuthView mode="login" onSwitch={() => handleNavigate('register')} onSuccess={() => handleNavigate('analyze')} />}
        {!authLoading && activeView === 'register' && <AuthView mode="register" onSwitch={() => handleNavigate('login')} onSuccess={() => handleNavigate('analyze')} />}
        {!authLoading && isAuthenticated && activeView === 'analyze' && (
          <>
            <section className="hero-section" id="analyze" aria-labelledby="page-title">
              <div className="eyebrow">Code better together</div>
              <h1 id="page-title"><span>PR</span> Insight</h1>
              <p className="hero-copy">AI-powered GitHub Pull Request reviews</p>
              <p className="hero-detail">Turn code changes into focused, actionable feedback before they reach production.</p>
              <FeatureRow />
              <GithubConnection connectRequest={githubConnectRequest} onConnect={handleConnectGithub} />
              <AnalyzeForm inputRef={inputRef} pullRequestUrl={pullRequestUrl} onUrlChange={setPullRequestUrl} onSubmit={handleAnalyze} isLoading={isLoading} />
              {isLoading && <AnalysisProgress />}
              {error && <ErrorState message={error} onRetry={() => void handleAnalyze(pullRequestUrl)}
                actionLabel={error.includes('Connect GitHub') ? 'Connect GitHub' : undefined}
                onAction={error.includes('Connect GitHub') ? () => setGithubConnectRequest((value) => value + 1) : undefined} />}
            </section>
            {review && <ReviewSummary review={review} onAction={handleNewReview} />}
            {!review && !isLoading && <HowItWorks />}
          </>
        )}
        {!authLoading && isAuthenticated && activeView === 'history' && !historyReviewId && (
          <HistoryView onAnalyze={() => handleNavigate('analyze')} onSelect={handleHistorySelect} />
        )}
        {!authLoading && isAuthenticated && activeView === 'history' && historyReviewId && (
          <HistoryDetail id={historyReviewId} onBack={() => handleNavigate('history')} onSelectVersion={handleHistorySelect} />
        )}
        {!authLoading && activeView === 'about' && <AboutView />}
      </main>

      <Footer />
    </div>
  )
}

export default App
