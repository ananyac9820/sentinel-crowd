import { LEVELS, zoneName } from '../lib/risk.js'

const FILL = ['00', '33', '47', '5c'] // hex alpha per level

// Semi-transparent 4x3 density overlay drawn on top of the camera feed.
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
            style={{ background: `${color}${FILL[l]}`, borderColor: l ? `${color}aa` : '#00000026' }}
          >
            <span
              className="num absolute bottom-1 left-1 flex items-center gap-1.5 whitespace-nowrap px-1.5 py-px text-[11px] font-bold"
              style={{ background: '#f6f5f1ee', color: l ? color : '#111111', borderRadius: 2 }}
            >
              {zoneName(i)} <span className="font-bold">{c}</span>
              {snap.surges[i] && <span className="text-[9px] font-bold tracking-wider text-warn">SURGE</span>}
              {snap.forecast?.[i] != null && <span className="text-[10px] font-bold text-crit">CRIT ~{snap.forecast[i]}s</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
