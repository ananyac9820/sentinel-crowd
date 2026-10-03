import { LEVELS, zoneName } from '../lib/risk.js'

const TREND = {
  1: { sym: '↑', label: 'rising', cls: 'text-fg' },
  0: { sym: '→', label: 'steady', cls: 'text-dim' },
  '-1': { sym: '↓', label: 'falling', cls: 'text-muted' },
}

// Mini-map in the same 4x3 layout as the camera grid.
export default function ZoneTable({ snap }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">Zones</span>
        <span className="ml-auto text-[11px] text-dim">people, 5 s trend</span>
      </div>
      <div className="grid grid-cols-4 gap-px bg-line p-px">
        {snap.counts.map((c, i) => {
          const l = snap.levels[i]
          const lvl = LEVELS[l]
          const tr = TREND[snap.trends[i]]
          return (
            <div
              key={i}
              title={`Zone ${zoneName(i)}: ${c} people, ${lvl.label}, ${tr.label}`}
              className="bg-panel px-2.5 py-1.5 transition-colors duration-700"
              style={l ? { background: `color-mix(in srgb, ${lvl.color} 20%, var(--color-panel))` } : undefined}
            >
              <div className="num flex items-center justify-between text-[11px] text-muted">
                {zoneName(i)}
                {snap.surges[i] && <span className="text-[9px] font-bold tracking-wider text-warn">SURGE</span>}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="num text-[20px] font-bold leading-6" style={{ color: l ? lvl.color : undefined }}>
                  {c}
                </span>
                <span className={`num text-[13px] ${tr.cls}`} aria-label={tr.label}>
                  {tr.sym}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
