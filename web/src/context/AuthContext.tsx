import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { apiUrl } from '../lib/api'

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  provider?: 'google' | 'email' | 'pokerid' | string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  loginWithGoogle: () => Promise<void>
  loginWithPokerID: (email: string, password: string) => Promise<void>
  signUpWithPokerID: (email: string, password: string, username: string) => Promise<void>
  updateProfile: (currentPassword: string, newUsername?: string, newPassword?: string) => Promise<void>
  logout: () => Promise<void>
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const STORAGE_KEY = 'poker_sim_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const avatarFromMeta = (meta: any) =>
    (meta?.avatar_url as string | undefined) ||
    (meta?.picture as string | undefined) ||
    undefined

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const provider = (session.user.app_metadata as any)?.provider || (session.user.app_metadata as any)?.providers?.[0]
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
            avatar: avatarFromMeta(session.user.user_metadata),
            provider,
          })
        } else {
          const stored = localStorage.getItem(STORAGE_KEY)
          if (stored) {
            try {
              setUser(JSON.parse(stored))
            } catch {
              localStorage.removeItem(STORAGE_KEY)
            }
          }
        }
        setLoading(false)
      })
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
        if (session?.user) {
          const provider = (session.user.app_metadata as any)?.provider || (session.user.app_metadata as any)?.providers?.[0]
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
            avatar: avatarFromMeta(session.user.user_metadata),
            provider,
          })
        } else {
          setUser(null)
        }
      })
      return () => subscription.unsubscribe()
    }
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setUser(JSON.parse(stored))
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    setLoading(false)
  }, [])

  const loginWithGoogle = async () => {
    if (!supabase) {
      // No prompt - user should use PokerID or configure Supabase (see .env.example)
      return
    }
    // Explicit redirect avoids localhost/127.0.0.1 mismatch issues in local dev.
    const redirectUrl = `${window.location.origin}/dashboard`
    
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl },
    })
  }

  const loginWithPokerID = async (email: string, password: string, username?: string) => {
    const ident = (email || '').trim()
    // On Vercel/production when Supabase is configured, email+password should use Supabase Auth.
    // Username-based PokerID remains a local-only convenience.
    if (supabase && import.meta.env.PROD && ident.includes('@')) {
      const { error } = await supabase.auth.signInWithPassword({ email: ident, password })
      if (error) throw error
      return
    }
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      let msg = typeof data?.detail === 'string' ? data.detail : data?.detail?.[0]?.msg || data?.message
      if (res.status === 404 || (msg && String(msg).toLowerCase().includes('not found'))) {
        msg = 'API not reachable. Start the backend: ./run_api.sh. For preview/mobile, set VITE_API_URL=http://YOUR_IP:8000 in web/.env'
      } else if (!msg) {
        msg = 'Login failed'
      }
      throw new Error(msg)
    }
    const u: User = { id: data.id, email: data.email, name: data.name, provider: 'pokerid' }
    setUser(u)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
  }

  const signUpWithPokerID = async (email: string, password: string, username: string) => {
    if (!username?.trim()) throw new Error('Display name is required')
    const em = (email || '').trim()
    if (supabase && import.meta.env.PROD) {
      if (!em || !em.includes('@')) throw new Error('Email is required to create an account on production')
      const { error } = await supabase.auth.signUp({
        email: em,
        password,
        options: { data: { name: username.trim() } },
      })
      if (error) throw error
      return
    }
    const res = await fetch(apiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username: username.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      let msg = typeof data?.detail === 'string' ? data.detail : data?.detail?.[0]?.msg || data?.message
      if (res.status === 404 || (msg && String(msg).toLowerCase().includes('not found'))) {
        msg = 'API not reachable. Start the backend in a terminal: ./run_api.sh (from project root), then refresh. If using preview or mobile, set VITE_API_URL=http://YOUR_IP:8000 in web/.env'
      } else if (!msg) {
        msg = 'Registration failed'
      }
      throw new Error(msg)
    }
    const u: User = { id: data.id, email: data.email, name: data.name }
    const u2: User = { ...u, provider: 'pokerid' }
    setUser(u2)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u2))
  }

  const updateProfile = async (currentPassword: string, newUsername?: string, newPassword?: string) => {
    if (!user?.id) throw new Error('Not logged in')
    if (supabase && user.provider !== 'pokerid') {
      if (newPassword?.trim()) {
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) throw error
      }
      if (newUsername?.trim()) {
        const { error } = await supabase.auth.updateUser({ data: { name: newUsername.trim() } })
        if (error) throw error
        setUser({ ...user, name: newUsername.trim() })
      }
      return
    }
    const res = await fetch(apiUrl('/api/auth/update-profile'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        current_password: currentPassword,
        new_username: newUsername || null,
        new_password: newPassword || null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.detail || 'Update failed')
    setUser({ ...user, name: data.name })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...user, name: data.name }))
  }

  const logout = async () => {
    if (supabase) await supabase.auth.signOut()
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithGoogle,
        loginWithPokerID,
        signUpWithPokerID,
        updateProfile,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
