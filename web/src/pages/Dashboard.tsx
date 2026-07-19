declare global {
  function createPokerSim(): Promise<any>;
}

let wasmModule: any = null;

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import EquityGraph from '../components/EquityGraph'

import AIChatPanel from '../components/AIChatPanel'
import { apiUrl } from '../lib/api'
import '../App.css'
import './Dashboard.css'

const RANKS = '23456789TJQKA'
const SUITS = '♣♦♥♠'

function cardLabel(card: number) {
  return { rank: RANKS[card % 13], suit: SUITS[Math.floor(card / 13)] }
}
function displayRank(r: string) {
  return r === 'T' ? '10' : r
}
function isRedSuit(card: number) {
  return Math.floor(card / 13) === 1 || Math.floor(card / 13) === 2
}


interface StreetData {
  street: string
  board_len: number
  equity: number
  win_pct: number
  tie_pct: number
  loss_pct: number
}

interface AnalyzeResult {
  hand_name: string
  hands_that_beat: string[]
  potential_draws: string[]
  elapsed_ms?: number
}

interface LiveAnalysisData {
  win_pct?: number
  tie_pct?: number
  loss_pct?: number
  suggested_action?: string
  strategy_message?: string
  hand_distribution?: Record<string, number>
  best_possible_hand?: string
  current_hand?: string | null
  message?: string
  equity?: number
  elapsed_ms?: number
}

export default function Dashboard() {
  const { user } = useAuth()
  const [holeCards, setHoleCards] = useState<number[]>([])
  const [boardCards, setBoardCards] = useState<number[]>([])
  const [numOpponents, setNumOpponents] = useState(1)
  const [numTrials, setNumTrials] = useState(3000)
  const [trialsSpecified, setTrialsSpecified] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [liveAnalysis, setLiveAnalysis] = useState<LiveAnalysisData | null>(null)
  const [liveEquity, setLiveEquity] = useState<StreetData[] | null>(null)

  const [liveAnalyze, setLiveAnalyze] = useState<AnalyzeResult | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const liveTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const [mobileCards, setMobileCards] = useState(false)

  useEffect(() => {
    fetch(apiUrl('/api/health')).then((r) => r.ok && r.json()).then((d) => setApiOk(d?.ok === true)).catch(() => setApiOk(false))
  }, [])

  useEffect(() => {
    const m = window.matchMedia('(max-width: 640px)')
    const update = () => setMobileCards(m.matches)
    update()
    m.addEventListener?.('change', update)
    return () => m.removeEventListener?.('change', update)
  }, [])

  const selectedSet = new Set([...holeCards, ...boardCards])

  const LIVE_TRIALS = 500000
  const allCards = [...holeCards, ...boardCards]

  const cardButtons = (() => {
    if (!mobileCards) return Array.from({ length: 52 }, (_, i) => i as number | null)
    // Mobile: keep suits from spilling across rows -> 7 then 6 (+1 spacer) per suit (7-6-7-6-7-6-7-6)
    const out: Array<number | null> = []
    for (let suit = 0; suit < 4; suit++) {
      const base = suit * 13
      for (let r = 0; r < 7; r++) out.push(base + r)
      for (let r = 7; r < 13; r++) out.push(base + r)
      out.push(null) // spacer to complete the 7-wide row (6 + 1 spacer)
    }
    return out
  })()

  const fetchLive = useCallback(async () => {
    if (![2, 5, 6, 7].includes(allCards.length)) {
      setLiveAnalysis(null)
      setLiveEquity(null)
      setLiveAnalyze(null)
      setLiveLoading(false)
      return
    }
    setLiveLoading(true)
    setLiveAnalysis(null)
    setLiveEquity(null)
    setLiveAnalyze(null)
    try {
      const t0 = performance.now()

      if (!wasmModule) {
        // @ts-ignore
        wasmModule = await createPokerSim()
      }

      const holeVec = new wasmModule.VectorUint8()
      holeCards.forEach((c) => holeVec.push_back(c))
      const boardVec = new wasmModule.VectorUint8()
      boardCards.forEach((c) => boardVec.push_back(c))

      const liveRes = wasmModule.run_monte_carlo(holeVec, boardVec, numOpponents, LIVE_TRIALS)
      setLiveAnalysis({
        win_pct: liveRes.win_rate(),
        tie_pct: liveRes.tie_rate(),
        loss_pct: liveRes.loss_rate(),
        equity: liveRes.equity(),
      })
      liveRes.delete()

      if (holeCards.length === 2 && [0, 3, 4, 5].includes(boardCards.length)) {
        // Run fewer trials for street equity to prevent freezing the main UI thread
        const streetTrials = Math.max(10000, Math.floor(LIVE_TRIALS / 10))
        const streetVec = wasmModule.get_equity_by_street(holeVec, boardVec, numOpponents, streetTrials)
        const streetArr: StreetData[] = []
        for (let i = 0; i < streetVec.size(); i++) {
          const s = streetVec.get(i)
          streetArr.push({
            street: s.street,
            board_len: s.board_len,
            equity: s.equity,
            win_pct: s.win_pct,
            tie_pct: s.tie_pct,
            loss_pct: s.loss_pct
          })
          s.delete()
        }
        setLiveEquity(streetArr)
        streetVec.delete()
      }

      if (holeCards.length + boardCards.length >= 5) {
        const aRes = wasmModule.analyze_hand(holeVec, boardVec)
        const htbVec = aRes.hands_that_beat
        const htbArr: string[] = []
        for(let i = 0; i < htbVec.size(); i++) htbArr.push(htbVec.get(i))

        const pdVec = aRes.potential_draws
        const pdArr: string[] = []
        for(let i = 0; i < pdVec.size(); i++) pdArr.push(pdVec.get(i))

        setLiveAnalyze({
          hand_name: aRes.hand_name,
          hands_that_beat: htbArr,
          potential_draws: pdArr
        })
        htbVec.delete()
        pdVec.delete()
        aRes.delete()
      }

      holeVec.delete()
      boardVec.delete()

      setTiming({ live: performance.now() - t0 })
    } catch (e) {
      console.error("fetchLive error:", e)
    } finally {
      setLiveLoading(false)
    }
  }, [allCards, holeCards, boardCards, numOpponents])

  useEffect(() => {
    if (liveTimeoutRef.current) clearTimeout(liveTimeoutRef.current)
    if (allCards.length < 2) {
      setLiveAnalysis(allCards.length === 1 ? { message: 'Select 2 hole cards for probability analysis.' } : null)
      setLiveEquity(null)
      setLiveAnalyze(null)
      return
    }
    liveTimeoutRef.current = setTimeout(fetchLive, 400)
    return () => { if (liveTimeoutRef.current) clearTimeout(liveTimeoutRef.current) }
  }, [allCards.join(','), holeCards.length, boardCards.length, numOpponents])


  const toggleCard = useCallback(
    (card: number) => {
      if (selectedSet.has(card)) {
        if (holeCards.includes(card)) setHoleCards(holeCards.filter((c) => c !== card))
        else setBoardCards(boardCards.filter((c) => c !== card))
        setResult(null)
        setEquityByStreet(null)
        setAnalyze(null)
        setLiveAnalysis(null)
        setLiveEquity(null)
        setLiveAnalyze(null)
        setError(null)
        return
      }
      if (holeCards.length < 2) {
        setHoleCards([...holeCards, card].sort((a, b) => a - b))
      } else if (boardCards.length < 5) {
        setBoardCards([...boardCards, card])
      }
      setResult(null)
      setEquityByStreet(null)
      setAnalyze(null)
      setLiveAnalysis(null)
      setLiveEquity(null)
      setLiveAnalyze(null)
      setError(null)
    },
    [holeCards, boardCards, selectedSet]
  )

  const clearSelection = () => {
    setHoleCards([])
    setBoardCards([])
    setResult(null)
    setEquityByStreet(null)
    setAnalyze(null)
    setError(null)
  }

  const saveSimulation = () => {
    if (!liveAnalysis || !user) return
    const key = `poker_saved_${user.email}`
    const saved = JSON.parse(localStorage.getItem(key) || '[]')
    saved.push({
      holeCards,
      boardCards,
      numOpponents,
      result: {
        win_pct: liveAnalysis.win_pct,
        tie_pct: liveAnalysis.tie_pct,
        loss_pct: liveAnalysis.loss_pct,
      },
      timestamp: Date.now(),
    })
    localStorage.setItem(key, JSON.stringify(saved.slice(-50)))
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Poker Simulation Engine</h1>
        <p className="subtitle">Monte Carlo Texas Hold'em — Win % & EV</p>
      </header>

      <main className="dashboard-main">
        <section className={`section ${loading ? 'loading' : ''}`}>
          <h2>Your Hand</h2>
          <div className="selected-cards-row selected-cards-inline">
            <span className="label-small" style={{ marginRight: '1.2rem' }}>Hole:</span>
            {Array.from({ length: 2 }).map((_, i) => {
              const c = holeCards[i]
              if (c == null) return <div key={`hole-empty-${i}`} className="card-btn empty-slot" />
              const { rank, suit } = cardLabel(c)
              return (
                <button key={c} type="button" className={`card-btn selected-hole ${isRedSuit(c) ? 'red' : ''}`} onClick={() => toggleCard(c)}>
                  <span className="rank">{displayRank(rank)}</span>
                  <span className="suit">{suit}</span>
                </button>
              )
            })}
            <span className="label-small" style={{ marginLeft: '1rem', marginRight: '1.2rem' }}>Board:</span>
            {Array.from({ length: 5 }).map((_, i) => {
              const c = boardCards[i]
              if (c == null) return <div key={`board-empty-${i}`} className="card-btn empty-slot" />
              const { rank, suit } = cardLabel(c)
              return (
                <button key={c} type="button" className={`card-btn selected-board ${isRedSuit(c) ? 'red' : ''}`} onClick={() => toggleCard(c)}>
                  <span className="rank">{displayRank(rank)}</span>
                  <span className="suit">{suit}</span>
                </button>
              )
            })}
            
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: '1rem' }}>
              <span className="label-small" style={{ marginRight: '1.2rem' }}>Opponents:</span>
              <input
                type="number"
                min={1}
                max={8}
                value={numOpponents}
                onChange={(e) => setNumOpponents(Math.max(1, Number(e.target.value)))}
                className="neu-input"
                style={{ width: '70px', padding: '0.5rem', textAlign: 'center', fontWeight: 'bold' }}
              />
            </div>

            <button
              type="button"
              className="icon-btn"
              onClick={clearSelection}
              disabled={holeCards.length === 0 && boardCards.length === 0}
              title="Clear cards"
              style={{ marginLeft: '1rem', background: 'transparent', border: 'none', cursor: (holeCards.length === 0 && boardCards.length === 0) ? 'default' : 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--neu-danger)', opacity: (holeCards.length === 0 && boardCards.length === 0) ? 0.3 : 0.8 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18"></path>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
          <div className="card-picker-grid">
            {cardButtons.map((card, idx) => {
              if (card == null) return <div key={`sp-${idx}`} className="card-spacer" aria-hidden="true" />
              const { rank: r, suit: s } = cardLabel(card)
              const selected = selectedSet.has(card)
              const disabled = !selected && holeCards.length === 2 && boardCards.length === 5
              return (
                <button
                  key={card}
                  type="button"
                  className={`card-btn ${selected ? (holeCards.includes(card) ? 'selected-hole' : 'selected-board') : ''} ${isRedSuit(card) ? 'red' : ''}`}
                  onClick={() => !disabled && toggleCard(card)}
                  disabled={disabled}
                >
                  <span className="rank">{displayRank(r)}</span>
                  <span className="suit">{s}</span>
                </button>
              )
            })}
          </div>

          {error && <p className="error-msg">{error}</p>}
        </section>

        {((liveAnalysis && (liveAnalysis.win_pct !== undefined || liveAnalysis.message)) || liveLoading || allCards.length === 1) && (
          <section className="section live-section">
            <h2>Live probability {liveLoading ? '…' : ''}</h2>
            {liveAnalysis?.message && <p className="live-msg">{liveAnalysis.message}</p>}
            {liveAnalysis && liveAnalysis.win_pct !== undefined && (
              <>
                <div className="action-tile neu-raised">
                  <span className="action-label">Suggested action</span>
                  <strong className={`action-value action-${
                    ((liveAnalysis.equity ?? 0) >= (1.0 / (numOpponents + 1)) * 1.2) ? 'bet' :
                    ((liveAnalysis.equity ?? 0) >= (1.0 / (numOpponents + 1)) * 0.85) ? 'call' : 'check-fold'
                  }`}>
                    {((liveAnalysis.equity ?? 0) >= (1.0 / (numOpponents + 1)) * 1.2) ? 'Raise / Bet' :
                     ((liveAnalysis.equity ?? 0) >= (1.0 / (numOpponents + 1)) * 0.85) ? 'Call / Check' : 'Check / Fold'}
                  </strong>
                </div>
                <div className="results-grid">
                  <div className="result-card win">
                    <div className="label">Win</div>
                    <div className="value">{((liveAnalysis.win_pct ?? 0) * 100).toFixed(1)}%</div>
                  </div>
                  <div className="result-card tie">
                    <div className="label">Tie</div>
                    <div className="value">{((liveAnalysis.tie_pct ?? 0) * 100).toFixed(1)}%</div>
                  </div>
                  <div className="result-card loss">
                    <div className="label">Loss</div>
                    <div className="value">{((liveAnalysis.loss_pct ?? 0) * 100).toFixed(1)}%</div>
                  </div>
                </div>
                {holeCards.length + boardCards.length >= 5 && (liveAnalyze?.hand_name || liveAnalysis?.best_possible_hand || liveAnalysis?.current_hand) && (
                  <div className="best-hand-live neu-raised">
                    <span className="analyze-label">Your best hand</span>
                    <strong>{liveAnalyze?.hand_name || liveAnalysis?.best_possible_hand || liveAnalysis?.current_hand}</strong>
                  </div>
                )}
                {(holeCards.length + boardCards.length < 5) && (liveAnalysis?.best_possible_hand || liveAnalysis?.current_hand) && (
                  <p className="best-hand">
                    Best possible: <strong>{liveAnalysis.best_possible_hand || liveAnalysis.current_hand}</strong>
                  </p>
                )}
                {liveAnalysis.hand_distribution && Object.keys(liveAnalysis.hand_distribution).length > 0 && (
                  <div className="hand-dist">
                    <span className="analyze-label">Hand distribution (over random boards)</span>
                    <div className="dist-bars">
                      {Object.entries(liveAnalysis.hand_distribution).map(([hand, pct]) => (
                        <div key={hand} className="dist-row">
                          <span>{hand}</span>
                          <div className="dist-bar-bg">
                            <div className="dist-bar-fill" style={{ width: `${pct * 100}%` }} />
                          </div>
                          <span>{(pct * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="live-hint">Simulated {LIVE_TRIALS.toLocaleString()} trials.{liveAnalysis.elapsed_ms != null && ` (${liveAnalysis.elapsed_ms.toFixed(0)} ms)`}</p>
              </>
            )}
            {liveEquity && liveEquity.length > 0 && (
              <>
                <EquityGraph data={liveEquity} title="Win probability by street" />
                <div className="equity-chart equity-chart-bars">
                  {liveEquity.map((s) => (
                    <div key={s.street} className="equity-bar-wrap">
                      <span className="street-label">{s.street}</span>
                      <div className="equity-bar-bg">
                        <div className="equity-bar-fill" style={{ width: `${s.equity * 100}%` }} />
                      </div>
                      <span className="equity-pct">{(s.equity * 100).toFixed(1)}% (W:{(s.win_pct*100).toFixed(0)} T:{(s.tie_pct*100).toFixed(0)} L:{(s.loss_pct*100).toFixed(0)})</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {liveAnalyze && (holeCards.length + boardCards.length >= 5) && (
              <div className="analyze-grid">
                <div className="analyze-item">
                  <span className="analyze-label">Your hand</span>
                  <span className="analyze-value">{liveAnalyze.hand_name}</span>
                </div>
                {liveAnalyze.hands_that_beat.length > 0 && (
                  <div className="analyze-item">
                    <span className="analyze-label">Hands that beat you</span>
                    <span className="analyze-value">{liveAnalyze.hands_that_beat.join(', ')}</span>
                  </div>
                )}
                {liveAnalyze.potential_draws.length > 0 && (
                  <div className="analyze-item">
                    <span className="analyze-label">Potential draws</span>
                    <span className="analyze-value">{liveAnalyze.potential_draws.join(', ')}</span>
                  </div>
                )}
              </div>
            )}
            {user && liveAnalysis && (
              <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                <button type="button" className="neu-btn save-btn" onClick={saveSimulation} style={{ padding: '0.5rem 1.5rem', fontSize: '0.85rem' }}>
                  Save to My Simulations
                </button>
              </div>
            )}
          </section>
        )}

        {((liveAnalysis?.win_pct != null) || (liveEquity && liveEquity.length > 0)) && (
          <div className="sim-chat-wrap">
            <button
              type="button"
              className="ai-chat-fab neu-raised"
              onClick={() => setChatOpen(true)}
              title="Ask AI assistant"
            >
              🤖
            </button>
          </div>
        )}
        <AIChatPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          context={{
            winPct: liveAnalysis?.win_pct,
            handName: liveAnalyze?.hand_name,
            boardLen: boardCards.length,
          }}
        />
      </main>
    </div>
  )
}
