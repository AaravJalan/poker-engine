import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import './Saved.css'

const RANKS = '23456789TJQKA'
const SUITS = '♣♦♥♠'

function cardLabel(card: number) {
  const r = RANKS[card % 13]
  return (r === 'T' ? '10' : r) + SUITS[Math.floor(card / 13)]
}

export default function Saved() {
  const { user } = useAuth()
  const [saved, setSaved] = useState<Array<{ holeCards: number[]; boardCards: number[]; numOpponents: number; result: { win_pct: number; tie_pct: number; loss_pct: number }; timestamp: number }>>([])

  useEffect(() => {
    if (user) {
      const key = `poker_saved_${user.email}`
      const data = JSON.parse(localStorage.getItem(key) || '[]')
      setSaved(data.reverse())
    }
  }, [user])

  const deleteItem = (i: number) => {
    if (!user) return
    const key = `poker_saved_${user.email}`
    const data = JSON.parse(localStorage.getItem(key) || '[]').reverse()
    data.splice(i, 1)
    localStorage.setItem(key, JSON.stringify(data.reverse().slice(-50)))
    setSaved([...data].reverse())
  }

  if (!user) {
    return (
      <div className="saved-page">
        <p>Please sign in to view saved simulations.</p>
        <Link to="/">Go to login</Link>
      </div>
    )
  }

  return (
    <div className="saved-page">
      <header className="saved-header page-header">
        <h1>Past Simulations</h1>
        <div className="page-header-right">
          <Link to="/dashboard" className="neu-btn">Back to simulator</Link>
        </div>
      </header>
      {saved.length === 0 ? (
        <p className="empty-msg">No saved simulations yet. Run a simulation and click "Save to My Simulations".</p>
      ) : (
        <div className="saved-list">
          {saved.map((s, i) => (
            <div key={i} className="saved-item neu-raised">
              <div className="saved-item-header">
                <div className="saved-meta">
                  <span className="saved-date">{new Date(s.timestamp).toLocaleString()}</span>
                  <span className="saved-opponents">vs {s.numOpponents} opponent{s.numOpponents > 1 ? 's' : ''}</span>
                </div>
                <button type="button" className="delete-btn" onClick={() => deleteItem(i)} title="Delete simulation">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
              <div className="saved-content-row">
                <div className="saved-cards">
                  <div className="card-group">
                    <span className="saved-label">Hole</span>
                    <div className="card-row">
                      {(s.holeCards || []).map((c) => {
                        const label = cardLabel(c);
                        return <span key={c} className={`mini-card ${label.slice(-1)}`}>{label}</span>
                      })}
                    </div>
                  </div>
                  {(s.boardCards || []).length > 0 && (
                    <div className="card-group">
                      <span className="saved-label">Board</span>
                      <div className="card-row">
                        {(s.boardCards || []).map((c) => {
                          const label = cardLabel(c);
                          return <span key={c} className={`mini-card ${label.slice(-1)}`}>{label}</span>
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div className="saved-stats">
                  <div className="stat-box win">
                    <span className="stat-label">Win</span>
                    <span className="stat-val">{((s.result?.win_pct || 0) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="stat-box tie">
                    <span className="stat-label">Tie</span>
                    <span className="stat-val">{((s.result?.tie_pct || 0) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="stat-box loss">
                    <span className="stat-label">Loss</span>
                    <span className="stat-val">{((s.result?.loss_pct || 0) * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
