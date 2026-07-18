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
        onClick={() => setProfileOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setProfileOpen((v) => !v)}
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
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'} {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button type="button" className="sidebar-btn logout-btn" onClick={() => logout()}>
          Log Out
        </button>
      </div>
    </aside>
  )
}
