import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, ReferenceLine, Tooltip, CartesianGrid } from 'recharts'

const WINDOW = 120

export default function DensityChart({ timeline, now, className = '' }) {
  const end = Math.max(now, WINDOW)
  const maxPeople = Math.max(40, ...timeline.map((p) => p.people))

  return (
    <section className={`card p-4 pb-2 flex flex-col ${className}`}>
      <div className="flex items-center gap-4">
        <span className="label">Density timeline · last 2 min</span>
        <div className="ml-auto flex items-center gap-4 text-[11px] text-slate-400">
          <Legend swatch={<span className="h-2.5 w-2.5 rounded-sm bg-accent/70" />} text="People" />
          <Legend swatch={<span className="h-0.5 w-4 bg-slate-100" />} text="Risk score" />
          <Legend swatch={<span className="w-4 border-t-2 border-dashed border-crit" />} text="Danger (75)" />
        </div>
      </div>
      <div className="flex-1 min-h-0 mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={timeline} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="peopleFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e2736" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[end - WINDOW, end]}
              ticks={[0, 30, 60, 90, 120].map((s) => end - WINDOW + s)}
              tickFormatter={(v) => (Math.round(v - end) === 0 ? 'now' : `${Math.round(v - end)}s`)}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis yAxisId="p" domain={[0, Math.ceil(maxPeople / 20) * 20]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="r" orientation="right" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
            <ReferenceLine yAxisId="r" y={75} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={1.5} />
            <Tooltip
              contentStyle={{ background: '#111722', border: '1px solid #222b3b', borderRadius: 8, fontSize: 12 }}
              labelFormatter={(v) => `${Math.round(v - end)}s`}
              formatter={(val, name) => [val, name === 'people' ? 'People' : 'Risk score']}
            />
            <Area yAxisId="p" dataKey="people" type="monotone" stroke="#818cf8" strokeWidth={1.5} fill="url(#peopleFill)" isAnimationActive={false} />
            <Line yAxisId="r" dataKey="risk" type="monotone" stroke="#f1f5f9" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function Legend({ swatch, text }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {text}
    </span>
  )
}
