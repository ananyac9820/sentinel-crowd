import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, ReferenceLine, Tooltip, CartesianGrid } from 'recharts'

const WINDOW = 120
const AXIS = { fill: '#8a929b', fontSize: 11, fontFamily: 'IBM Plex Mono' }

export default function DensityChart({ timeline, now, className = '' }) {
  const end = Math.max(now, WINDOW)
  const maxPeople = Math.max(40, ...timeline.map((p) => p.people))
  const waiting = timeline.length < 2

  return (
    <section className={`panel flex flex-col ${className}`}>
      <div className="panel-head">
        <span className="label">Density, last 2 minutes</span>
        <div className="ml-auto flex items-center gap-4 text-[11px] text-muted">
          <Key swatch={<span className="h-2.5 w-2.5" style={{ background: '#4a7fab80' }} />} text="People (left axis)" />
          <Key swatch={<span className="h-0.5 w-4 bg-fg" />} text="Risk score (right)" />
          <Key swatch={<span className="w-4 border-t border-dashed border-crit" />} text="Danger, 75" />
        </div>
      </div>
      <div className="relative min-h-0 flex-1 px-1 pb-1 pt-2">
        {waiting ? (
          <ChartSkeleton />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={timeline} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#30353c" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={[end - WINDOW, end]}
                ticks={[0, 30, 60, 90, 120].map((s) => end - WINDOW + s)}
                tickFormatter={(v) => (Math.round(v - end) === 0 ? 'now' : `${Math.round(v - end)}s`)}
                tick={AXIS}
                axisLine={{ stroke: '#363c44' }}
                tickLine={false}
              />
              <YAxis yAxisId="p" domain={[0, Math.ceil(maxPeople / 20) * 20]} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS} axisLine={false} tickLine={false} width={30} />
              <ReferenceLine yAxisId="r" y={75} stroke="#b4463e" strokeDasharray="5 4" />
              <Tooltip
                contentStyle={{ background: '#22262b', border: '1px solid #4a525c', borderRadius: 2, fontSize: 12, fontFamily: 'IBM Plex Mono' }}
                labelStyle={{ color: '#9aa2ab' }}
                labelFormatter={(v) => `${Math.round(v - end)}s`}
                formatter={(val, name) => [val, name === 'people' ? 'People' : 'Risk score']}
              />
              <Area yAxisId="p" dataKey="people" type="monotone" stroke="#4a7fab" strokeWidth={1.5} fill="#4a7fab" fillOpacity={0.28} isAnimationActive={false} />
              <Line yAxisId="r" dataKey="risk" type="monotone" stroke="#d9dde1" strokeWidth={1.75} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

function ChartSkeleton() {
  return (
    <div className="flex h-full items-end gap-1.5 px-3 pb-5" aria-label="Waiting for data">
      {[30, 34, 32, 38, 42, 40, 46, 50, 48, 55, 60, 58, 62, 66, 64, 70].map((h, i) => (
        <div key={i} className="skel flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

function Key({ swatch, text }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {text}
    </span>
  )
}
