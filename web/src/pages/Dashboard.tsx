declare global {
  function createPokerSim(): Promise<any>;
}

let wasmModule: any = null;

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import EquityGraph from '../components/EquityGraph'
import PokerTips from '../components/PokerTips'
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

interface SimResult {
  win_pct: number
  tie_pct: number
  loss_pct: number
  suggested_action: string
  strategy_message: string
  elapsed_ms?: number
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
  const [result, setResult] = useState<SimResult | null>(null)
  const [equityByStreet, setEquityByStreet] = useState<StreetData[] | null>(null)
  const [analyze, setAnalyze] = useState<AnalyzeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [liveAnalysis, setLiveAnalysis] = useState<LiveAnalysisData | null>(null)
  const [liveEquity, setLiveEquity] = useState<StreetData[] | null>(null)
  const [timing, setTiming] = useState<{ simulate?: number; equity?: number; analyze?: number; live?: number }>({})
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

  const LIVE_TRIALS = trialsSpecified ? Math.min(numTrials, 3000) : 1000
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
    if (allCards.length < 2) return
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
        const streetVec = wasmModule.get_equity_by_street(holeVec, boardVec, numOpponents, LIVE_TRIALS)
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
        aRes.delete()
      }

      holeVec.delete()
      boardVec.delete()

      setTiming({ live: performance.now() - t0 })
    } catch {
      // ignore
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
        setBoardCards([...boardCards, card].sort((a, b) => a - b))
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

  const runSimulation = async () => {
    if (holeCards.length !== 2) {
      setError('Select exactly 2 hole cards.')
      return
    }
    if (![0, 3, 4, 5].includes(boardCards.length)) {
      setError('Board must have 0 (pre-flop), 3 (flop), 4 (turn), or 5 (river) cards.')
      return
    }
    setError(null)
    setLoading(true)
    setResult(null)
    setEquityByStreet(null)
    setAnalyze(null)
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

      const res = wasmModule.run_monte_carlo(holeVec, boardVec, numOpponents, numTrials)
      
      const simData = {
        win_pct: res.win_rate(),
        tie_pct: res.tie_rate(),
        loss_pct: res.loss_rate(),
        elapsed_ms: performance.now() - t0
      }

      holeVec.delete()
      boardVec.delete()
      res.delete()

      setResult(simData)
      setTiming({ simulate: simData.elapsed_ms })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'WebAssembly simulation failed')
    } finally {
      setLoading(false)
    }
  }

  const clearSelection = () => {
    setHoleCards([])
    setBoardCards([])
    setResult(null)
    setEquityByStreet(null)
    setAnalyze(null)
    setError(null)
  }

  const saveSimulation = () => {
    if (!result || !user) return
    const key = `poker_saved_${user.email}`
    const saved = JSON.parse(localStorage.getItem(key) || '[]')
    saved.push({
      holeCards,
      boardCards,
      numOpponents,
      result,
      timestamp: Date.now(),
    })
    localStorage.setItem(key, JSON.stringify(saved.slice(-50)))
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Poker Simulation</h1>
        <p className="subtitle">Monte Carlo Texas Hold'em — Win % & EV</p>
      </header>

      <main className="dashboard-main">
        {apiOk === false && (
          <div className="api-banner">
            API not running. Start it with <code>./run_api.sh</code> from the project root, then refresh.
          </div>
        )}
        <section className={`section ${loading ? 'loading' : ''}`}>
          <h2>Your hand</h2>
          <div className="selected-cards-row selected-cards-inline">
            <span className="label-small">Hole (2):</span>
            {holeCards.map((c) => {
              const { rank, suit } = cardLabel(c)
              return (
                <button key={c} type="button" className={`card-btn selected-hole ${isRedSuit(c) ? 'red' : ''}`} onClick={() => toggleCard(c)}>
                  <span className="rank">{displayRank(rank)}</span>
                  <span className="suit">{suit}</span>
                </button>
              )
            })}
            <span className="label-small" style={{ marginLeft: '0.5rem' }}>Board:</span>
            {boardCards.map((c) => {
              const { rank, suit } = cardLabel(c)
              return (
                <button key={c} type="button" className={`card-btn selected-board ${isRedSuit(c) ? 'red' : ''}`} onClick={() => toggleCard(c)}>
                  <span className="rank">{displayRank(rank)}</span>
                  <span className="suit">{suit}</span>
                </button>
              )
            })}
            {(holeCards.length > 0 || boardCards.length > 0) && (
              <button type="button" className="neu-btn" onClick={clearSelection} style={{ marginLeft: '0.5rem' }}>Clear</button>
            )}

          </div>
          <p className="hint">Click cards: first 2 = hole, then 0–5 = board.</p>
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
          <div className="controls-row">
            <div className="control-group">
              <label>Opponents</label>
              <input type="number" min={1} max={8} value={numOpponents} onChange={(e) => setNumOpponents(Number(e.target.value) || 1)} className="neu-input" />
            </div>
            <div className="control-group">
              <label>Trials</label>
              <input
                type="number"
                min={10}
                max={500000}
                step={100}
                value={numTrials}
                onChange={(e) => {
                  setTrialsSpecified(true)
                  setNumTrials(Number(e.target.value) || 10)
                }}
                className="neu-input trials-input"
              />
            </div>
            <button type="button" className="neu-btn neu-btn-primary" onClick={runSimulation} disabled={loading || holeCards.length !== 2 || ![0, 3, 4, 5].includes(boardCards.length)}>
              {loading ? 'Running…' : 'Run simulation'}
            </button>
          </div>
          {error && <p className="error-msg">{error}</p>}
        </section>

        {((liveAnalysis && (liveAnalysis.win_pct !== undefined || liveAnalysis.message)) || liveLoading || allCards.length === 1) && !result && (
          <section className="section live-section">
            <h2>Live probability {liveLoading ? '…' : ''}</h2>
            {liveAnalysis?.message && <p className="live-msg">{liveAnalysis.message}</p>}
            {liveAnalysis && liveAnalysis.win_pct !== undefined && (
              <>
                <div className="action-tile neu-raised">
                  <span className="action-label">Suggested action</span>
                  <strong className={`action-value action-${(liveAnalysis.suggested_action ?? '').toLowerCase().replace(/ \/ /g, '-').replace(/ /g, '-') || 'check-fold'}`}>
                    {liveAnalysis.suggested_action ?? (((liveAnalysis.win_pct ?? 0) + (liveAnalysis.tie_pct ?? 0) / 2) >= 0.5 ? 'Bet' : 'Check / Fold')}
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
                <p className="live-hint">Quick estimate ({LIVE_TRIALS} trials). Click Run for full accuracy.{liveAnalysis.elapsed_ms != null && ` (${liveAnalysis.elapsed_ms.toFixed(0)} ms)`}</p>
                <PokerTips
                  winPct={liveAnalysis.win_pct}
                  handName={liveAnalyze?.hand_name}
                  bestHand={liveAnalysis.best_possible_hand}
                  boardLen={boardCards.length}
                  strategyMessage={result?.strategy_message}
                />
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
          </section>
        )}

        {equityByStreet && equityByStreet.length > 0 && (
          <section className="section">
            <h2>Equity by street</h2>
            <p className="section-desc">How your win probability changes as each card is revealed.</p>
            <EquityGraph data={equityByStreet} title="Win probability curve" />
            <div className="equity-chart equity-chart-bars">
              {equityByStreet.map((s) => (
                <div key={s.street} className="equity-bar-wrap">
                  <span className="street-label">{s.street}</span>
                  <div className="equity-bar-bg">
                    <div className="equity-bar-fill" style={{ width: `${s.equity * 100}%` }} />
                  </div>
                  <span className="equity-pct">{(s.equity * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            {(timing.simulate != null || timing.equity != null || timing.analyze != null) && (
              <p className="timing-hint">
                {[timing.simulate != null && `Sim: ${timing.simulate.toFixed(0)}ms`, timing.equity != null && `Equity: ${timing.equity.toFixed(0)}ms`, timing.analyze != null && `Analyze: ${timing.analyze.toFixed(0)}ms`].filter(Boolean).join(' · ')}
              </p>
            )}
            {result && (
              <div className="stats-box">
                <h4>Math & stats</h4>
                <p><strong>EV formula:</strong> EV = (Win% × Pot) − (Loss% × Call) − (Tie% × ½Call)</p>
                <p><strong>Equity:</strong> Win% + ½Tie% (your share of the pot when tied)</p>
              </div>
            )}
          </section>
        )}

        {analyze && (holeCards.length + boardCards.length >= 5) && (
          <section className="section">
            <h2>Hand analysis</h2>
            <div className="analyze-grid">
              <div className="analyze-item">
                <span className="analyze-label">Your hand</span>
                <span className="analyze-value">{analyze.hand_name}</span>
              </div>
              {analyze.hands_that_beat.length > 0 && (
                <div className="analyze-item">
                  <span className="analyze-label">Hands that beat you</span>
                  <span className="analyze-value">{analyze.hands_that_beat.join(', ')}</span>
                </div>
              )}
              {analyze.potential_draws.length > 0 && (
                <div className="analyze-item">
                  <span className="analyze-label">Potential draws</span>
                  <span className="analyze-value">{analyze.potential_draws.join(', ')}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {((liveAnalysis?.win_pct != null) || result || (liveEquity && liveEquity.length > 0)) && (
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
            winPct: liveAnalysis?.win_pct ?? result?.win_pct,
            handName: liveAnalyze?.hand_name ?? analyze?.hand_name,
            boardLen: boardCards.length,
          }}
        />
        {result && (
          <section className="section">
            <div className="action-tile neu-raised">
              <span className="action-label">Suggested action</span>
              <strong className={`action-value action-${(result.suggested_action ?? '').toLowerCase().replace(/ \/ /g, '-').replace(/ /g, '-') || 'check-fold'}`}>
                {result.suggested_action ?? ((result.win_pct + result.tie_pct / 2) >= 0.5 ? 'Bet' : 'Check / Fold')}
              </strong>
            </div>
            <h2>Results</h2>
            {timing.simulate != null && <p className="timing-hint">Simulation: {timing.simulate.toFixed(0)} ms</p>}
            <div className="results-grid">
              <div className="result-card win">
                <div className="label">Win</div>
                <div className="value">{(result.win_pct * 100).toFixed(1)}%</div>
              </div>
              <div className="result-card tie">
                <div className="label">Tie</div>
                <div className="value">{(result.tie_pct * 100).toFixed(1)}%</div>
              </div>
              <div className="result-card loss">
                <div className="label">Loss</div>
                <div className="value">{(result.loss_pct * 100).toFixed(1)}%</div>
              </div>
            </div>
            <div className="progress-bar-wrap">
              <div className="progress-bar-inner" style={{ display: 'flex', width: '100%' }}>
                <div className="win" style={{ width: `${result.win_pct * 100}%` }} />
                <div className="tie" style={{ width: `${result.tie_pct * 100}%` }} />
                <div className="loss" style={{ width: `${result.loss_pct * 100}%` }} />
              </div>
            </div>
            <p className="strategy-message">{result.strategy_message}</p>
            {user && (
              <button type="button" className="neu-btn save-btn" onClick={saveSimulation}>
                Save to My Simulations
              </button>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
