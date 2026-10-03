import { ArrowUp, ArrowDown, ArrowRight, Zap } from 'lucide-react'
import { LEVELS, zoneName } from '../lib/risk.js'

const TREND = {
  1: { Icon: ArrowUp, cls: 'text-slate-200', label: 'rising' },
  0: { Icon: ArrowRight, cls: 'text-slate-500', label: 'steady' },
  '-1': { Icon: ArrowDown, cls: 'text-slate-400', label: 'falling' },
}

// Compact mini-map: same 4×3 layout as the camera grid.
export default function ZoneTable({ snap }) {
  return (
    <section className="card px-3.5 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="label">Zones</span>
        <span className="text-[11px] text-slate-500">people · trend (5s)</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {snap.counts.map((c, i) => {
          const lvl = LEVELS[snap.levels[i]]
          const { Icon, cls, label } = TREND[snap.trends[i]]
          return (
            <div
              key={i}
              title={`Zone ${zoneName(i)}: ${c} people, ${lvl.label}, ${label}`}
              className="rounded-lg border px-2 py-1 transition-colors duration-500"
              style={{ background: `${lvl.color}${snap.levels[i] ? '24' : '10'}`, borderColor: `${lvl.color}${snap.levels[i] ? '66' : '22'}` }}
            >
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                {zoneName(i)}
                {snap.surges[i] && <Zap size={11} className="text-warn" />}
              </div>
              <div className="flex items-center justify-between">
                <span className="num text-base font-bold leading-5" style={{ color: snap.levels[i] ? lvl.color : '#e2e8f0' }}>
                  {c}
                </span>
                <Icon size={14} className={cls} aria-label={label} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
