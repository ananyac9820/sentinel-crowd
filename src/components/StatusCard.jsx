import { Users, MapPin, Gauge, Zap } from 'lucide-react'
import { LEVELS } from '../lib/risk.js'

const ADVICE = [
  'All zones within safe density.',
  'Crowd building — keep watching.',
  'Congestion — divert flow now.',
  'Crush risk — open exits, halt entry.',
]

export default function StatusCard({ snap }) {
  const lvl = LEVELS[snap.overall]
  const top = LEVELS[snap.topZone.level]

  return (
    <section className="card px-3.5 py-3 transition-colors duration-700" style={{ borderColor: `${lvl.color}55` }}>
      <div className="flex items-center justify-between">
        <span className="label">Overall risk</span>
        {snap.surgingZones.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">
            <Zap size={12} /> Surge in {snap.surgingZones.join(', ')}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-4">
        <div
          className="rounded-xl px-4 py-2 text-3xl xl:text-4xl font-black tracking-tight transition-all duration-700"
          style={{ background: `${lvl.color}1f`, color: lvl.color, boxShadow: `0 0 0 1px ${lvl.color}55, 0 0 28px -6px ${lvl.color}` }}
        >
          {lvl.label}
        </div>
        <p className="text-sm text-slate-400 leading-snug">{ADVICE[snap.overall]}</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat icon={Users} label="People" value={snap.people} />
        <Stat
          icon={MapPin}
          label="Busiest zone"
          value={snap.topZone.name}
          sub={`${snap.topZone.count} ppl`}
          color={snap.topZone.count ? top.color : undefined}
        />
        <Stat icon={Gauge} label="Risk score" value={snap.score} sub="/100" color={snap.score >= 75 ? LEVELS[3].color : undefined} />
      </div>
    </section>
  )
}

function Stat({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="rounded-lg bg-ink-850 border border-white/5 px-3 py-1.5">
      <div className="flex items-center gap-1 text-[11px] text-slate-500">
        <Icon size={12} /> {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="num text-2xl font-bold transition-colors duration-500" style={{ color }}>
          {value}
        </span>
        {sub && <span className="text-xs text-slate-500">{sub}</span>}
      </div>
    </div>
  )
}
