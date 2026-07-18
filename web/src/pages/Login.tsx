import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { supabaseConfigured } from '../lib/supabase'
import { apiUrl } from '../lib/api'
import './Login.css'

export default function Login() {
  const { loginWithGoogle, loginWithPokerID, signUpWithPokerID, isAuthenticated, loading } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [pokerIdError, setPokerIdError] = useState('')
  const [apiDown, setApiDown] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard')
  }, [isAuthenticated, navigate])

  useEffect(() => {
    if (showForm && !supabaseConfigured) {
      fetch(apiUrl('/api/health')).then((r) => setApiDown(!r.ok)).catch(() => setApiDown(true))
    } else {
      setApiDown(false)
    }
  }, [showForm])

  const handlePokerID = async (e: React.FormEvent) => {
    e.preventDefault()
    setPokerIdError('')
    if (apiDown) {
      setPokerIdError('API not running. Start it with: ./run_api.sh from project root.')
      return
    }
    try {
      if (isSignUp) {
        await signUpWithPokerID(email.trim(), password, username.trim())
      } else {
        await loginWithPokerID(email.trim(), password)
      }
      navigate('/dashboard')
    } catch (err: unknown) {
      setPokerIdError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  const handleGoogle = async () => {
    if (!supabaseConfigured) {
      setPokerIdError('Supabase is not configured. Create web/.env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the web dev server.')
      return
    }
    try {
      await loginWithGoogle()
    } catch {
      setPokerIdError('Google sign-in failed')
    }
  }

  if (loading) return <div className="login-page"><div className="loading-spinner">Loading…</div></div>

  if (showForm) {
    return (
      <div className="login-page login-form-only">
        <button
          type="button"
          className="login-theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
        <div className="login-card neu-raised">
          <button type="button" className="login-back" onClick={() => setShowForm(false)}>← Back</button>
          <h2>{isSignUp ? 'Create account' : 'Sign in'}</h2>

          <>
            <button
              type="button"
              className="neu-btn google-btn"
              onClick={handleGoogle}
              disabled={!supabaseConfigured}
              title={!supabaseConfigured ? 'Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in web/.env to enable Google sign-in' : undefined}
            >
              <span className="google-icon">G</span> Continue with Google
            </button>
            <div className="divider">
              <span>or</span>
            </div>
          </>

          <form onSubmit={handlePokerID}>
            <div className="form-group">
              <label htmlFor="email">Email or username</label>
              <input
                id="email"
                type="text"
                placeholder={isSignUp ? 'Pick a username (email optional)' : 'Email or username'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="neu-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="neu-input"
                required
              />
            </div>
            {isSignUp && (
              <div className="form-group">
                <label htmlFor="username">Display name</label>
                <input
                  id="username"
                  type="text"
                  placeholder="Your name"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="neu-input"
                  required
                />
              </div>
            )}
            <button type="submit" className="neu-btn neu-btn-primary login-btn">
              {isSignUp ? 'Create PokerID account' : 'Sign in with PokerID'}
            </button>
          </form>
          {apiDown && <p className="error-msg">API not running. Run ./run_api.sh from project root, then refresh.</p>}
        {pokerIdError && <p className="error-msg">{pokerIdError}</p>}
          <p className="switch-mode">
            <button type="button" className="link-btn" onClick={() => setIsSignUp(!isSignUp)}>
              {isSignUp ? 'Already have an account? Sign in' : 'New? Create PokerID account'}
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page potbot-style">
      <button
        type="button"
        className="login-theme-toggle"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        )}
      </button>
      <header className="login-header">
        <span className="login-logo">♠</span>
        <h1>Poker Simulation</h1>
        <p className="login-tagline">Monte Carlo Texas Hold'em — Win %, EV strategy & live probability</p>
      </header>
      <div className="login-actions">
        <button
          type="button"
          className="login-cta primary-cta"
          onClick={() => { setIsSignUp(true); setShowForm(true) }}
        >
          Get Started
        </button>
        <button
          type="button"
          className="login-cta secondary-cta"
          onClick={() => { setIsSignUp(false); setShowForm(true) }}
        >
          Sign in
        </button>
      </div>
      {!supabaseConfigured && (
        <p className="error-msg" style={{ marginTop: 12, maxWidth: 520 }}>
          Google sign-in is disabled locally until Supabase is configured. Create <code>web/.env</code> with{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart <code>npm run dev</code>.
        </p>
      )}
      {pokerIdError && <p className="error-msg" style={{ marginTop: 12 }}>{pokerIdError}</p>}
      <p className="login-features-hint">Live probability • Hand analysis • Monte Carlo equity</p>
      <div className="login-features">
        <div className="login-feature-card">
          <span className="feature-icon">📊</span>
          <h3>Live probability</h3>
          <p>Win % updates as you pick 2nd, 3rd, 4th, 5th board cards.</p>
        </div>
        <div className="login-feature-card">
          <span className="feature-icon">🎴</span>
          <h3>Hand analysis</h3>
          <p>Best possible hand, hand distribution, and exploitative guidance.</p>
        </div>
        <div className="login-feature-card">
          <span className="feature-icon">⚡</span>
          <h3>Monte Carlo equity</h3>
          <p>EV by street. FOLD/CALL/RAISE recommendations with reasoning.</p>
        </div>
      </div>
    </div>
  )
}
