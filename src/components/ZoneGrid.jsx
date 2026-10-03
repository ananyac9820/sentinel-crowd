import { Zap } from 'lucide-react'
import { LEVELS, zoneName } from '../lib/risk.js'

const FILL = ['14', '30', '42', '55'] // hex alpha per level

// Semi-transparent 4×3 density overlay drawn on top of the camera feed.
export default function ZoneGrid({ snap }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid grid-cols-4 grid-rows-3">
      {snap.counts.map((c, i) => {
        const l = snap.levels[i]
        const color = LEVELS[l].color
        return (
          <div
            key={i}
            className="relative border transition-colors duration-700"
            style={{ background: `${color}${FILL[l]}`, borderColor: `${color}${l ? '88' : '33'}` }}
          >
            <span
              className="absolute left-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold backdrop-blur-sm transition-colors duration-700"
              style={{ background: '#07090ecc', color: l ? color : '#cbd5e1' }}
            >
              {zoneName(i)} <span className="num font-mono">{c}</span>
              {snap.surges[i] && <Zap size={11} className="text-warn blink" />}
            </span>
          </div>
        )
      })}
    </div>
  )
}
