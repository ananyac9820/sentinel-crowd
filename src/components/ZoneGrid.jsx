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
            style={{ background: `${color}${FILL[l]}`, borderColor: l ? `${color}aa` : '#ffffff1f' }}
          >
            <span
              className="num absolute bottom-1 left-1 flex items-center gap-1.5 px-1.5 py-px text-[11px] font-medium"
              style={{ background: '#1b1e22e6', color: l ? color : '#d9dde1', borderRadius: 2 }}
            >
              {zoneName(i)} <span className="font-semibold">{c}</span>
              {snap.surges[i] && <span className="text-[9px] font-semibold tracking-wider text-warn">SURGE</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
