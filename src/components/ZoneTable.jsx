import { LEVELS } from '../lib/risk.js'
import { isConfigured, zoneLinks } from '../lib/site.js'

const TREND = {
  1: { sym: '↑', label: 'rising', cls: 'text-fg' },
  0: { sym: '→', label: 'steady', cls: 'text-dim' },
  '-1': { sym: '↓', label: 'falling', cls: 'text-muted' },
}
const DIRS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗']

function direction(m) {
  if (!m) return { sym: '-', label: 'no data' }
  const speed = Math.hypot(m.vx, m.vy)
  if (speed < 0.004) return { sym: '·', label: 'standing' }
  const a = Math.atan2(m.vy, m.vx)
  return { sym: DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8], label: `${(speed * 100).toFixed(1)} frame heights per 100 s` }
}

function Bar({ value, threshold }) {
  const over = value >= threshold
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-20 bg-raised" style={{ borderRadius: 1 }}>
        <div className="absolute inset-y-0 left-0" style={{ width: `${value}%`, background: over ? '#b02a22' : '#6b6963' }} />
        <div className="absolute -top-0.5 h-3 w-px bg-fg" style={{ left: `${threshold}%` }} title={`Alert at ${threshold}`} />
      </div>
      <span className={`num w-7 text-right text-[12px] ${over ? 'text-crit' : ''}`}>{value}</span>
    </div>
  )
}

// Detailed table of every zone: density, forecast and movement.
export default function ZoneTable({ snap, settings, site, className = '' }) {
  const configured = isConfigured(site)
  return (
    <section className={`panel flex flex-col ${className}`}>
      <div className="panel-head">
        <span className="label">Zone details</span>
        <span className="ml-auto text-[11px] text-dim">Trend over 5 s. Turbulence and counter-flow on a 0 to 100 scale; the tick marks the alert level.</span>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-panel">
            <tr className="label border-b border-line-strong text-left">
              {['Zone', 'People', 'Level', 'Trend', 'Critical in', 'Turbulence', 'Counter-flow', 'Moving', 'Nearest exit'].map((h) => (
                <th key={h} className="px-3 py-1.5 font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line whitespace-nowrap">
            {snap.zones.map((z, i) => {
              const l = snap.levels[i]
              const lvl = LEVELS[l]
              const tr = TREND[snap.trends[i]]
              const dir = direction(snap.motion?.[i])
              return (
                <tr key={z.id} style={l ? { background: `color-mix(in srgb, ${lvl.color} 12%, var(--color-panel))` } : undefined}>
                  <td className="num px-3 py-1.5 font-bold">{z.name}</td>
                  <td className="num px-3 py-1.5 text-[16px] font-bold" style={{ color: l ? lvl.color : undefined }}>
                    {snap.counts[i]}
                  </td>
                  <td className="num px-3 py-1.5 font-bold" style={{ color: lvl.color }}>
                    {lvl.label}
                    {snap.surges[i] && <span className="ml-1.5 text-[10px] text-warn">SURGE</span>}
                  </td>
                  <td className={`num px-3 py-1.5 ${tr.cls}`} title={tr.label}>
                    {tr.sym} {tr.label}
                  </td>
                  <td className="num px-3 py-1.5 font-bold text-crit">{snap.forecast?.[i] != null ? `~${snap.forecast[i]}s` : <span className="font-normal text-dim">-</span>}</td>
                  <td className="px-3 py-1.5">
                    <Bar value={snap.turbulence?.[i] ?? 0} threshold={settings.turbulence} />
                  </td>
                  <td className="px-3 py-1.5">
                    <Bar value={snap.counterIdx?.[i] ?? 0} threshold={settings.counterFlow} />
                  </td>
                  <td className="num px-3 py-1.5 text-[15px]" title={dir.label}>
                    {snap.counterFlow?.[i] ? <span className="text-[12px] font-bold text-crit">BOTH WAYS</span> : dir.sym}
                  </td>
                  <td className="px-3 py-1.5 text-[12px]">{configured ? zoneLinks(z, site).exit ?? '-' : <span className="text-dim">Not configured</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
