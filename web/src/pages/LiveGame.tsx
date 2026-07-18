import { useState } from 'react'
import { Link } from 'react-router-dom'
import './LiveGame.css'

interface Player {
  id: string
  name: string
  buyIn: number
  cashOut: number
}

function genId() {
  return Math.random().toString(36).slice(2, 11)
}

function computeSettlements(players: Player[]) {
  const profits = players.map((p) => ({ ...p, profit: p.cashOut - p.buyIn }))
  const winners = profits.filter((p) => p.profit > 0)
  const losers = profits.filter((p) => p.profit < 0)
  const settlements: { from: string; to: string; amount: number }[] = []
  const losersCopy = losers.map((l) => ({ ...l, remaining: -l.profit }))
  let wi = 0
  for (const loser of losersCopy) {
    let toPay = loser.remaining
    while (toPay > 0.01 && wi < winners.length) {
      const winner = winners[wi]
      const needed = winner.profit - settlements.filter((s) => s.to === winner.name).reduce((a, s) => a + s.amount, 0)
      if (needed <= 0) { wi++; continue }
      const pay = Math.min(toPay, needed)
      settlements.push({ from: loser.name, to: winner.name, amount: Math.round(pay * 100) / 100 })
      toPay -= pay
      loser.remaining -= pay
      if (needed <= pay) wi++
    }
  }
  return settlements
}

export default function LiveGame() {
  const [players, setPlayers] = useState<Player[]>([
    { id: genId(), name: 'Player 1', buyIn: 0, cashOut: 0 },
    { id: genId(), name: 'Player 2', buyIn: 0, cashOut: 0 },
  ])
  const [settleOpen, setSettleOpen] = useState(false)
  const [paid, setPaid] = useState<Set<number>>(new Set())

  const totalBuyIn = players.reduce((s, p) => s + p.buyIn, 0)
  const totalCashOut = players.reduce((s, p) => s + p.cashOut, 0)
  const totalProfit = totalCashOut - totalBuyIn

  const updatePlayer = (id: string, updates: Partial<Player>) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)))
  }

  const removePlayer = (id: string) => {
    if (players.length <= 2) return
    setPlayers((prev) => prev.filter((p) => p.id !== id))
  }

  const settlements = computeSettlements(players)
  const hasSettlements = settlements.length > 0
  const allPaid = paid.size === settlements.length && hasSettlements

  const togglePaid = (i: number) => {
    setPaid((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const openSettle = () => {
    setPaid(new Set())
    setSettleOpen(true)
  }

  return (
    <div className="live-game-page">
      <header className="live-game-header page-header">
        <h1>Live Game</h1>
        <div className="page-header-right live-game-header-actions">
          <button
            type="button"
            className="neu-btn neu-btn-primary"
            onClick={() => {
              setPlayers((prev) => [...prev, { id: genId(), name: `Player ${prev.length + 1}`, buyIn: 0, cashOut: 0 }])
            }}
          >
            + Add player
          </button>
          {hasSettlements && (
            <button type="button" className="neu-btn settle-btn" onClick={openSettle}>
              Settle Up
            </button>
          )}
          <Link to="/dashboard" className="neu-btn">Back to simulator</Link>
        </div>
      </header>
      <p className="live-game-desc">Track buy-ins and cash-outs. We calculate who pays whom.</p>

      <div className="live-game-totals neu-raised">
        <div className="totals-row">
          <span>Total buy-ins</span>
          <span>${totalBuyIn.toFixed(2)}</span>
        </div>
        <div className="totals-row">
          <span>Total cash-out</span>
          <span>${totalCashOut.toFixed(2)}</span>
        </div>
        <div className={`totals-row total-profit ${totalProfit >= 0 ? 'win' : 'loss'}`}>
          <span>Net</span>
          <span>${totalProfit.toFixed(2)}</span>
        </div>
      </div>

      <div className="live-game-players">
        {players.map((p) => (
          <div key={p.id} className="player-card">
            <input
              type="text"
              className="player-name neu-input"
              value={p.name}
              onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
              placeholder="Name"
            />
            <div className="player-inputs">
              <div>
                <label>Buy-in $</label>
                <input
                  type="number"
                  step="0.01"
                  value={p.buyIn || ''}
                  onChange={(e) => updatePlayer(p.id, { buyIn: parseFloat(e.target.value) || 0 })}
                  className="neu-input"
                />
              </div>
              <div>
                <label>Cash-out $</label>
                <input
                  type="number"
                  step="0.01"
                  value={p.cashOut || ''}
                  onChange={(e) => updatePlayer(p.id, { cashOut: parseFloat(e.target.value) || 0 })}
                  className="neu-input"
                />
              </div>
            </div>
            <div className={`player-profit ${p.cashOut - p.buyIn >= 0 ? 'win' : 'loss'}`}>
              {p.cashOut - p.buyIn >= 0 ? '+' : ''}{(p.cashOut - p.buyIn).toFixed(2)}
            </div>
            <button type="button" className="remove-btn" onClick={() => removePlayer(p.id)} disabled={players.length <= 2}>
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Settle Up Modal */}
      {settleOpen && (
        <div className="settle-overlay" onClick={() => setSettleOpen(false)}>
          <div className="settle-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settle-modal-header">
              <h2>Settle Up</h2>
              <button type="button" className="settle-close" onClick={() => setSettleOpen(false)}>
                &times;
              </button>
            </div>
            <p className="settle-desc">Tap each transfer when it's been paid.</p>
            <div className="settle-list">
              {settlements.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className={`settle-row ${paid.has(i) ? 'settle-paid' : ''}`}
                  onClick={() => togglePaid(i)}
                >
                  <div className="settle-row-names">
                    <span className="settle-from">{s.from}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                    <span className="settle-to">{s.to}</span>
                  </div>
                  <span className="settle-amount">${s.amount.toFixed(2)}</span>
                  <span className="settle-check">
                    {paid.has(i) ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                      </svg>
                    )}
                  </span>
                </button>
              ))}
            </div>
            {allPaid && (
              <div className="settle-done">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                All settled up!
              </div>
            )}
            <button type="button" className="neu-btn neu-btn-primary settle-close-btn" onClick={() => setSettleOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
