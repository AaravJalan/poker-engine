import './EquityGraph.css'

interface StreetData {
  street: string
  board_len: number
  equity: number
  win_pct: number
  tie_pct: number
  loss_pct: number
}

interface EquityGraphProps {
  data: StreetData[]
  title?: string
}

function cardsLabel(s: { street: string; board_len: number }): string {
  const total = 2 + s.board_len
  return `${total} cards (${s.street})`
}

export default function EquityGraph({ data, title = 'Win probability by street' }: EquityGraphProps) {
  if (!data?.length) return null

  const points = data.map((s, i) => ({ ...s, x: (i / Math.max(1, data.length - 1)) * 100, y: 100 - s.equity * 100 }))
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')
  const areaD = `${pathD} L 100 100 L 0 100 Z`

  return (
    <div className="equity-graph">
      <h3>{title}</h3>
      <p className="equity-graph-desc">Win probability (2 → 5 → 6 → 7 cards) as community cards are revealed</p>
      <div className="equity-graph-svg-wrap">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="equity-graph-svg">
          <defs>
            <linearGradient id="equityGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="var(--neu-accent)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--neu-accent)" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#equityGrad)" />
          <path d={pathD} fill="none" stroke="var(--neu-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="1" fill="var(--neu-accent)" vectorEffect="non-scaling-stroke" stroke="var(--neu-accent)" strokeWidth="2.5" />
          ))}
        </svg>
      </div>
      <div className="equity-graph-labels">
        {data.map((s, i) => (
          <span key={i} className="equity-graph-label">
            {cardsLabel(s)}: {(s.equity * 100).toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  )
}
