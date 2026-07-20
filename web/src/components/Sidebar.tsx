import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { apiUrl } from '../lib/api'
import ProfileMenu from './ProfileMenu'
import './Sidebar.css'

interface SidebarProps {
  onNav?: () => void
}

export default function Sidebar({ onNav }: SidebarProps) {
  const { user, logout } = useAuth()
  const [inboxCount, setInboxCount] = useState(0)
  const { theme, toggleTheme } = useTheme()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileAnchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user?.id) return
    const refresh = () => {
      fetch(apiUrl(`/api/friends/inbox?user_id=${encodeURIComponent(user.id)}`))
        .then((r) => r.json())
        .then((d) => setInboxCount((d.requests || []).length))
        .catch(() => setInboxCount(0))
    }
    refresh()
    const i = setInterval(refresh, 30000)
    const handler = refresh
    window.addEventListener('friends-inbox-update', handler)
    return () => {
      clearInterval(i)
      window.removeEventListener('friends-inbox-update', handler)
    }
  }, [user?.id])

  return (
    <aside className="sidebar">
      <div
        ref={profileAnchorRef}
        className="sidebar-user clickable"
        onClick={() => { setProfileOpen((v) => !v); onNav?.(); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setProfileOpen((v) => !v)
            onNav?.()
          }
        }}
      >
        <div className="user-avatar">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name || 'User'} className="user-avatar-img" referrerPolicy="no-referrer" />
          ) : (
            user?.name?.charAt(0)?.toUpperCase() || '?'
          )}
        </div>
        <span className="user-name">{user?.name || user?.email || 'Guest'}</span>
        {profileOpen && <ProfileMenu anchorRef={profileAnchorRef} onClose={() => setProfileOpen(false)} />}
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onNav}>
          Simulator
        </NavLink>
        <NavLink to="/saved" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onNav}>
          Past Simulations
        </NavLink>
        <NavLink to="/winnings" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onNav}>
          Winnings
        </NavLink>
        <NavLink to="/friends" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onNav}>
          Friends
          {inboxCount > 0 && <span className="sidebar-badge" aria-label={`${inboxCount} pending request(s)`}>{inboxCount}</span>}
        </NavLink>

        <NavLink to="/live-game" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onNav}>
          Live Game
        </NavLink>
        <NavLink to="/games" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onNav}>
          Games
        </NavLink>
      </nav>
      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-btn theme-toggle"
          onClick={() => { toggleTheme(); onNav?.(); }}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )} 
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button type="button" className="sidebar-btn logout-btn" onClick={() => { logout(); onNav?.(); }}>
          Log Out
        </button>
      </div>
    </aside>
  )
}
