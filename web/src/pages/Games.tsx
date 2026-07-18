import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiUrl } from '../lib/api'
import './Games.css'

interface Friend {
  id: string
  email: string
  name: string
}

interface GamePlayer {
  user_id: string
  user_name: string
  initial_buy_in: number
  total_buy_in: number
  cash_out: number | null
  left_at: string | null
}

interface Game {
  id: string
  host_id: string
  join_code: string
  display_name?: string
  status: string
  created_at?: string
  players?: GamePlayer[]
  invited_ids?: string[]
}

function computeSettlements(players: GamePlayer[]) {
  const withProfit = players
    .filter((p) => p.cash_out != null)
    .map((p) => ({ ...p, profit: (p.cash_out ?? 0) - p.total_buy_in }))
  const winners = withProfit.filter((p) => p.profit > 0)
  const losers = withProfit.filter((p) => p.profit < 0)
  const settlements: { from: string; to: string; amount: number }[] = []
  const losersCopy = losers.map((l) => ({ ...l, remaining: -l.profit }))
  let wi = 0
  for (const loser of losersCopy) {
    let toPay = loser.remaining
    while (toPay > 0.01 && wi < winners.length) {
      const winner = winners[wi]
      const paid = settlements.filter((s) => s.to === winner.user_name).reduce((a, s) => a + s.amount, 0)
      const needed = winner.profit - paid
      if (needed <= 0) {
        wi++
        continue
      }
      const pay = Math.min(toPay, needed)
      settlements.push({ from: loser.user_name, to: winner.user_name, amount: Math.round(pay * 100) / 100 })
      toPay -= pay
      loser.remaining -= pay
      if (needed <= pay) wi++
    }
  }
  return settlements
}

export default function Games() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { gameId } = useParams()
  const { pathname } = useLocation()
  const isJoinView = pathname === '/games/join'
  const [games, setGames] = useState<Game[]>([])
  const [game, setGame] = useState<Game | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const [joinCode, setJoinCode] = useState('')
  const [joinGame, setJoinGame] = useState<Game | null>(null)
  const [initialBuyIn, setInitialBuyIn] = useState('')
  const [addBuyInAmt, setAddBuyInAmt] = useState('')
  const [addBuyInUserId, setAddBuyInUserId] = useState<string | null>(null)
  const [leaveCashOut, setLeaveCashOut] = useState('')
  const [leaveUserId, setLeaveUserId] = useState<string | null>(null)
  const [addToWinnings, setAddToWinnings] = useState(false)
  const [leaveHours, setLeaveHours] = useState('')
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set())
  const [addByEmail, setAddByEmail] = useState('')
  const [addManualName, setAddManualName] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [gameInvites, setGameInvites] = useState<Array<{ id: string; join_code: string; display_name?: string }>>([])
  const [acceptBuyIn, setAcceptBuyIn] = useState('')
  const [acceptGameId, setAcceptGameId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadGames = () => {
    if (!user?.id) return
    fetch(apiUrl(`/api/games/user/${user.id}`))
      .then((r) => r.json())
      .then((d) => setGames(d.games || []))
      .catch(() => setGames([]))
  }

  const loadFriends = () => {
    if (!user?.id) return
    fetch(apiUrl(`/api/friends?user_id=${user.id}`))
      .then((r) => r.json())
      .then((d) => setFriends(d.friends || []))
      .catch(() => setFriends([]))
  }

  const loadGame = (id: string) => {
    fetch(apiUrl(`/api/games/${id}`))
      .then((r) => r.json())
      .then(setGame)
      .catch(() => setGame(null))
  }

  const loadGameInvites = () => {
    if (!user?.id) return
    fetch(apiUrl(`/api/games/invites?user_id=${encodeURIComponent(user.id)}`))
      .then((r) => r.json())
      .then((d) => setGameInvites(d.invites || []))
      .catch(() => setGameInvites([]))
  }

  useEffect(loadGames, [user?.id])
  useEffect(loadFriends, [user?.id])
  useEffect(loadGameInvites, [user?.id])
  useEffect(() => {
    if (gameId) loadGame(gameId)
  }, [gameId])

  const handleCreateGame = async () => {
    if (!user) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/games'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, user_name: user.name || user.email }),
      })
      const g = await res.json()
      if (!res.ok) throw new Error(g?.detail || 'Failed')
      if (!g?.id) throw new Error('Failed to create game (missing id)')
      loadGames()
      setGame(g)
      navigate(`/games/${g.id}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create game')
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptGameInvite = async () => {
    if (!user || !acceptGameId) return
    const buyIn = parseFloat(acceptBuyIn) || 0
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/games/${acceptGameId}/accept-invite`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_name: user.name || user.email,
          initial_buy_in: buyIn,
        }),
      })
      const g = await res.json()
      if (!res.ok) throw new Error(g.detail || 'Failed')
      setAcceptGameId(null)
      setAcceptBuyIn('')
      loadGameInvites()
      loadGames()
      setGame(g)
      navigate(`/games/${g.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleFindGame = async () => {
    if (!joinCode.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/games/by-code/${encodeURIComponent(joinCode.trim().toUpperCase())}`))
      const g = await res.json()
      if (!res.ok) throw new Error(g.detail || 'Game not found')
      setJoinGame(g)
      setInitialBuyIn('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Game not found')
      setJoinGame(null)
    } finally {
      setLoading(false)
    }
  }

  const handleJoinGame = async () => {
    if (!user || !joinGame) return
    const buyIn = parseFloat(initialBuyIn) || 0
    if (buyIn < 0) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/games/${joinGame.id}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_name: user.name || user.email,
          initial_buy_in: buyIn,
        }),
      })
      const g = await res.json()
      if (!res.ok) throw new Error(g.detail || 'Failed to join')
      setGame(g)
      setJoinGame(null)
      setJoinCode('')
      navigate(`/games/${g.id}`)
      loadGames()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join')
    } finally {
      setLoading(false)
    }
  }

  const handleInviteByEmail = async () => {
    if (!game || game.host_id !== user?.id || !addByEmail.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/games/${game.id}/add-by-email`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_id: user.id, email: addByEmail.trim() }),
      })
      const g = await res.json()
      if (!res.ok) throw new Error(g.detail || 'Failed')
      setGame(g)
      setAddByEmail('')
      loadGame(game.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleAddManual = async () => {
    if (!game || game.host_id !== user?.id || !addManualName.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/games/${game.id}/add-manual`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_id: user.id, name: addManualName.trim() }),
      })
      const g = await res.json()
      if (!res.ok) throw new Error(g.detail || 'Failed')
      setGame(g)
      setAddManualName('')
      loadGame(game.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleInviteFriends = async () => {
    if (!game || game.host_id !== user?.id || selectedFriends.size === 0) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/games/${game.id}/invite`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_id: user.id, friend_ids: Array.from(selectedFriends) }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed')
      loadGame(game.id)
      setSelectedFriends(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleAddBuyIn = async () => {
    if (!game || !addBuyInUserId) return
    const amt = parseFloat(addBuyInAmt) || 0
    if (amt <= 0) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/games/${game.id}/add-buy-in`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: addBuyInUserId, amount: amt }),
      })
      const g = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = Array.isArray(g.detail)
          ? g.detail.map((d: { msg?: string }) => d.msg || '').join('; ') || 'Failed'
          : (typeof g.detail === 'string' ? g.detail : 'Failed')
        throw new Error(msg)
      }
      setGame(g)
      setAddBuyInUserId(null)
      setAddBuyInAmt('')
      loadGame(game.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleLeaveGame = async () => {
    if (!game || !leaveUserId || !user?.id) return
    const isHost = game.host_id === user.id
    const isMe = user.id === leaveUserId
    if (!isHost && !isMe) return
    const cashOut = parseFloat(leaveCashOut)
    if (isNaN(cashOut) || cashOut < 0) return
    const target = game.players?.find((p) => p.user_id === leaveUserId)
    const buyIn = target?.total_buy_in ?? 0
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/games/${game.id}/leave`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: leaveUserId, cash_out: cashOut }),
      })
      const g = await res.json()
      if (!res.ok) throw new Error(g.detail || 'Failed')
      setGame(g)
      if (addToWinnings && isMe) {
        await fetch(apiUrl('/api/winnings'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            session_date: new Date().toISOString().slice(0, 10),
            buy_in: buyIn,
            cash_out: cashOut,
            hours: parseFloat(leaveHours) || 0,
            notes: `Game ${game.display_name || game.join_code}`,
          }),
        })
      }
      setLeaveUserId(null)
      setLeaveCashOut('')
      setAddToWinnings(false)
      setLeaveHours('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRenameGame = async () => {
    if (!game || game.host_id !== user?.id || !renameValue.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/games/${game.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, name: renameValue.trim() }),
      })
      const g = await res.json()
      if (!res.ok) throw new Error(g.detail || 'Failed')
      setGame(g)
      setEditingName(false)
      setRenameValue('')
      loadGames()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteGame = async () => {
    if (!game || game.host_id !== user?.id) return
    if (!confirm('Delete this game? This cannot be undone.')) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/games/${game.id}?user_id=${encodeURIComponent(user.id)}`), { method: 'DELETE' })
      if (!res.ok) {
        const g = await res.json().catch(() => ({}))
        throw new Error(g.detail || 'Failed')
      }
      navigate('/games')
      loadGames()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleEndGame = async () => {
    if (!game || game.host_id !== user?.id) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/games/${game.id}/end`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
      const g = await res.json()
      if (!res.ok) throw new Error(g.detail || 'Failed')
      setGame(g)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const toggleFriend = (id: string) => {
    setSelectedFriends((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const allLeft = game?.players?.every((p) => p.left_at != null) ?? false
  const settlements = game?.players ? computeSettlements(game.players) : []

  if (!user) {
    return (
      <div className="games-page">
        <p>Please sign in to use Games.</p>
        <Link to="/">Go to login</Link>
      </div>
    )
  }

  // Join flow
  if (isJoinView) {
    return (
      <div className="games-page">
        <header className="games-header page-header">
          <h1>Join Game</h1>
          <div className="page-header-right">
            <Link to="/games" className="neu-btn">← Back</Link>
          </div>
        </header>
        {!joinGame ? (
          <div className="join-code-form neu-raised">
            <input
              type="text"
              className="neu-input"
              placeholder="Enter 6-letter code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              onKeyDown={(e) => e.key === 'Enter' && handleFindGame()}
            />
            <button type="button" className="neu-btn neu-btn-primary" onClick={handleFindGame} disabled={loading}>
              Find game
            </button>
          </div>
        ) : (
          <div className="join-buyin neu-raised">
            <p>Game found. Enter your initial buy-in:</p>
            <input
              type="number"
              step="0.01"
              min="0"
              className="neu-input"
              placeholder="0.00"
              value={initialBuyIn}
              onChange={(e) => setInitialBuyIn(e.target.value)}
            />
            <div className="join-actions">
              <button type="button" className="neu-btn" onClick={() => setJoinGame(null)}>Cancel</button>
              <button type="button" className="neu-btn neu-btn-primary" onClick={handleJoinGame} disabled={loading}>
                Join game
              </button>
            </div>
          </div>
        )}
        {error && <p className="games-error">{error}</p>}
      </div>
    )
  }

  // Game detail view
  if (gameId && game) {
    const isHost = game.host_id === user.id
    const me = game.players?.find((p) => p.user_id === user.id)

    return (
      <div className="games-page">
        <header className="games-header page-header">
          <div className="games-header-left">
            {editingName ? (
              <div className="game-rename-row">
                <input
                  type="text"
                  className="neu-input"
                  placeholder={game.display_name || game.join_code}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRenameGame()}
                />
                <button type="button" className="neu-btn" onClick={() => { setEditingName(false); setRenameValue(''); }}>Cancel</button>
                <button type="button" className="neu-btn neu-btn-primary" onClick={handleRenameGame} disabled={loading || !renameValue.trim()}>Save</button>
              </div>
            ) : (
              <h1>{game.display_name || game.join_code}</h1>
            )}
          </div>
          <div className="games-header-actions">
            {isHost && !editingName && (
              <button type="button" className="neu-btn" onClick={() => { setRenameValue(game.display_name || game.join_code); setEditingName(true); }}>Rename</button>
            )}
            {isHost && (
              <button type="button" className="neu-btn delete-game-btn" onClick={handleDeleteGame} disabled={loading}>Delete</button>
            )}
            <Link to="/games" className="neu-btn">← Back to games</Link>
          </div>
        </header>

        <div className="game-code-box neu-raised">
          <strong>Join code:</strong> <code>{game.join_code}</code>
          <span className="code-hint">Share this code — tell friends to join with &quot;Join with code&quot;</span>
        </div>

        <div className="game-detail-layout">
        <div className="game-add-section game-add-narrow">
        {isHost && game.status === 'active' && (
          <div className="add-players-options neu-raised">
            <h3>Invite players</h3>
            <div className="add-option">
              <label>By email</label>
              <div className="add-option-row">
                <input
                  type="email"
                  className="neu-input"
                  placeholder="friend@example.com"
                  value={addByEmail}
                  onChange={(e) => setAddByEmail(e.target.value)}
                />
                <button type="button" className="neu-btn" onClick={handleInviteByEmail} disabled={loading || !addByEmail.trim()}>
                  Invite
                </button>
              </div>
            </div>
            <div className="add-option">
              <label>Manually (no account)</label>
              <div className="add-option-row">
                <input
                  type="text"
                  className="neu-input"
                  placeholder="Player name"
                  value={addManualName}
                  onChange={(e) => setAddManualName(e.target.value)}
                />
                <button type="button" className="neu-btn" onClick={handleAddManual} disabled={loading || !addManualName.trim()}>
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {isHost && friends.length > 0 && game.status === 'active' && (
          <div className="add-friends neu-raised">
            <h3>Invite friends to game</h3>
            {friends
              .filter((f) => !game.players?.some((p) => p.user_id === f.id))
              .map((f) => (
                <label key={f.id} className="friend-check">
                  <input
                    type="checkbox"
                    checked={selectedFriends.has(f.id)}
                    onChange={() => toggleFriend(f.id)}
                  />
                  {f.name}{f.email ? ` (${f.email})` : ''}
                </label>
              ))}
            {selectedFriends.size > 0 && (
              <button type="button" className="neu-btn neu-btn-primary" onClick={handleInviteFriends} disabled={loading}>
                Send invite
              </button>
            )}
          </div>
        )}
        </div>

        <div className="game-players-section">
        <div className="game-players neu-raised game-players-grid">
          <h3 className="game-players-title">Players</h3>
          {game.players?.map((p) => {
            const profit = p.cash_out != null ? (p.cash_out - p.total_buy_in) : null
            const isMe = p.user_id === user.id
            return (
              <div key={p.user_id} className={`player-card ${p.left_at ? 'left' : ''}`}>
                <div className="player-main">
                  <span className="player-name">{p.user_name} {p.user_id === game.host_id && '(Host)'}</span>
                  <div className="player-amounts">
                    <span>Buy-in: ${p.total_buy_in.toFixed(2)}</span>
                    {p.cash_out != null && (
                      <span>Cash-out: ${p.cash_out.toFixed(2)}</span>
                    )}
                    {profit != null && (
                      <span className={`profit ${profit >= 0 ? 'win' : 'loss'}`}>
                        {profit >= 0 ? '+' : ''}{profit.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                {game.status === 'active' && !p.left_at && (
                  <div className="player-actions">
                    {(isHost || isMe) && (
                      <button
                        type="button"
                        className="neu-btn small"
                        onClick={() => setAddBuyInUserId(p.user_id)}
                      >
                        + Add buy-in
                      </button>
                    )}
                    {(isHost || isMe) && (
                      <button
                        type="button"
                        className="neu-btn small"
                        onClick={() => setLeaveUserId(p.user_id)}
                      >
                        {isHost && !isMe ? 'Cash out player' : 'Leave game'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        </div>
        </div>

        {addBuyInUserId && (
          <div className="modal-overlay" onClick={() => setAddBuyInUserId(null)}>
            <div className="modal neu-raised" onClick={(e) => e.stopPropagation()}>
              <h3>Add buy-in</h3>
              <input
                type="number"
                step="0.01"
                min="0"
                className="neu-input"
                placeholder="Amount"
                value={addBuyInAmt}
                onChange={(e) => setAddBuyInAmt(e.target.value)}
              />
              <div className="modal-actions">
                <button type="button" className="neu-btn" onClick={() => setAddBuyInUserId(null)}>Cancel</button>
                <button type="button" className="neu-btn neu-btn-primary" onClick={handleAddBuyIn} disabled={loading}>
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {leaveUserId && (
          <div className="modal-overlay" onClick={() => setLeaveUserId(null)}>
            <div className="modal neu-raised" onClick={(e) => e.stopPropagation()}>
              <h3>Enter final cash-out amount</h3>
              <input
                type="number"
                step="0.01"
                min="0"
                className="neu-input"
                placeholder="0.00"
                value={leaveCashOut}
                onChange={(e) => setLeaveCashOut(e.target.value)}
              />
              {leaveUserId === user.id && (
                <>
                  <label className="leave-add-winnings">
                    <input type="checkbox" checked={addToWinnings} onChange={(e) => setAddToWinnings(e.target.checked)} />
                    Add to winnings
                  </label>
                  {addToWinnings && (
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      className="neu-input"
                      placeholder="Hours played"
                      value={leaveHours}
                      onChange={(e) => setLeaveHours(e.target.value)}
                    />
                  )}
                </>
              )}
              <div className="modal-actions">
                <button type="button" className="neu-btn" onClick={() => setLeaveUserId(null)}>Cancel</button>
                <button type="button" className="neu-btn neu-btn-primary" onClick={handleLeaveGame} disabled={loading}>
                  Cash out
                </button>
              </div>
            </div>
          </div>
        )}

        {isHost && game.status === 'active' && allLeft && (
          <div className="end-game-section">
            <button type="button" className="neu-btn neu-btn-primary" onClick={handleEndGame} disabled={loading}>
              End game & show settlements
            </button>
          </div>
        )}

        {(game.status === 'ended' || settlements.length > 0) && (
          <div className="settlements neu-raised">
            <h3>Settlements</h3>
            {settlements.map((s, i) => (
              <div key={i} className="settlement-row">
                <span className="from">{s.from}</span>
                <span className="arrow">→</span>
                <span className="to">{s.to}</span>
                <span className="amount">${s.amount.toFixed(2)}</span>
              </div>
            ))}
            {settlements.length === 0 && allLeft && (
              <p>Everyone broke even. No payments needed.</p>
            )}
          </div>
        )}

        {error && <p className="games-error">{error}</p>}
      </div>
    )
  }

  // Games list
  return (
    <div className="games-page">
      <header className="games-header page-header">
        <h1>Games</h1>
        <Link to="/dashboard" className="neu-btn">Back to simulator</Link>
      </header>

      <div className="games-actions">
        <button type="button" className="neu-btn neu-btn-primary" onClick={handleCreateGame} disabled={loading}>
          {loading ? 'Creating…' : '+ New game'}
        </button>
        <Link to="/games/join" className="neu-btn">Join with code</Link>
      </div>

      {gameInvites.length > 0 && (
        <div className="game-invites neu-raised">
          <h3>Game invites</h3>
          {gameInvites.map((inv) => (
            <div key={inv.id} className="game-invite-row">
              <span>{inv.display_name || inv.join_code}</span>
              <button type="button" className="neu-btn neu-btn-primary" onClick={() => setAcceptGameId(inv.id)}>
                Accept
              </button>
            </div>
          ))}
        </div>
      )}

      {acceptGameId && (
        <div className="modal-overlay" onClick={() => setAcceptGameId(null)}>
          <div className="modal neu-raised" onClick={(e) => e.stopPropagation()}>
            <h3>Join game</h3>
            <input
              type="number"
              step="0.01"
              min="0"
              className="neu-input"
              placeholder="Initial buy-in (optional)"
              value={acceptBuyIn}
              onChange={(e) => setAcceptBuyIn(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" className="neu-btn" onClick={() => setAcceptGameId(null)}>Cancel</button>
              <button type="button" className="neu-btn neu-btn-primary" onClick={handleAcceptGameInvite} disabled={loading}>
                Join
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="games-list">
        <h3>Your games</h3>
        {games.length === 0 ? (
          <p className="empty-msg">No games yet. Create one to get started.</p>
        ) : (
          games.map((g) => (
            <div key={g.id} className="game-item-wrap">
              <Link to={`/games/${g.id}`} className="game-item neu-raised">
                <span className="game-code">{g.display_name || g.join_code}</span>
                <span className={`game-status ${g.status}`}>{g.status === 'ended' ? 'completed' : g.status}</span>
                {g.created_at && (
                  <span className="game-date">{new Date(g.created_at).toLocaleDateString()}</span>
                )}
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
