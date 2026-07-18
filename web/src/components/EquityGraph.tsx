import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip
} from 'recharts'
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

export default function EquityGraph({ data, title = 'Win probability by street' }: EquityGraphProps) {
  if (!data?.length) return null

  // Format data for recharts
  const chartData = data.map((s) => ({
    ...s,
    cards: 2 + s.board_len,
    equityPct: s.equity * 100,
  }))

  return (
    <div className="equity-graph">
      <h3>{title}</h3>
      <p className="equity-graph-desc">Win probability (2 → 5 → 6 → 7 cards) as community cards are revealed</p>
      <div className="equity-graph-recharts" style={{ width: '100%', height: '240px', marginTop: '1rem' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--neu-accent)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--neu-accent)" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--neu-border)" />
            <XAxis 
              dataKey="cards" 
              tick={{ fill: 'var(--neu-text-muted)', fontSize: 12 }} 
              tickLine={false} 
              axisLine={false}
              ticks={[2, 5, 6, 7]}
              domain={[2, 7]}
              type="number"
            />
            <YAxis 
              tick={{ fill: 'var(--neu-text-muted)', fontSize: 12 }} 
              tickLine={false} 
              axisLine={false}
              tickFormatter={(val) => `${val}%`}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
            />
            <Tooltip 
              contentStyle={{ 
                borderRadius: '8px', 
                border: 'none', 
                background: 'var(--neu-bg)', 
                boxShadow: '4px 4px 10px var(--neu-shadow-dark), -4px -4px 10px var(--neu-shadow-light)',
                color: 'var(--neu-text)'
              }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, 'Win Probability']}
              labelFormatter={(label) => `${label} Cards`}
            />
            <Area 
              type="monotone" 
              dataKey="equityPct" 
              stroke="var(--neu-accent)" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#equityGrad)" 
              isAnimationActive={true}
              dot={{ r: 4, fill: 'var(--neu-accent)', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: 'var(--neu-accent)', stroke: 'var(--neu-bg)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
