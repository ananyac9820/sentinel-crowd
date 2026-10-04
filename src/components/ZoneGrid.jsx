import { useId } from 'react'
import { LEVELS } from '../lib/risk.js'

const FILL = ['00', '33', '47', '5c'] // hex alpha per level

// Semi-transparent zone overlay drawn on top of the camera feed: density tint, count, tags,
// and an arrow showing which way people in the zone are moving.
export default function ZoneGrid({ snap, aspect = 16 / 9, showFlow = true }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {showFlow && <FlowArrows snap={snap} aspect={aspect} />}
      {snap.zones.map((z, i) => {
        const l = snap.levels[i]
        const color = LEVELS[l].color
        const tag =
          snap.forecast?.[i] != null ? (
            <span className="text-[10px] font-bold text-crit">CRIT ~{snap.forecast[i]}s</span>
          ) : snap.turbulent?.[i] ? (
            <span className="text-[9px] font-bold tracking-wider text-crit">TURB {snap.turbulence[i]}</span>
          ) : snap.surges[i] ? (
            <span className="text-[9px] font-bold tracking-wider text-warn">SURGE</span>
          ) : null
        return (
          <div
            key={z.id}
            className="absolute border transition-colors duration-700"
            style={{
              left: `${z.x * 100}%`,
              top: `${z.y * 100}%`,
              width: `${z.w * 100}%`,
              height: `${z.h * 100}%`,
              background: `${color}${FILL[l]}`,
              borderColor: l ? `${color}aa` : '#00000026',
            }}
          >
            <span
              className="num absolute bottom-1 left-1 flex max-w-[calc(100%-8px)] items-center gap-1.5 overflow-hidden whitespace-nowrap px-1.5 py-px text-[11px] font-bold"
              style={{ background: '#f6f5f1ee', color: l ? color : '#111111', borderRadius: 2 }}
            >
              <span className={z.name.length > 4 ? 'truncate' : 'shrink-0'}>{z.name}</span> <span>{snap.counts[i]}</span>
              {tag}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// One SVG layer for all arrows so they share a coordinate system. Arrow length follows speed.
function FlowArrows({ snap, aspect }) {
  // Unique marker ids: the Monitor tab stays mounted (hidden) while other tabs show their own maps.
  const uid = useId().replace(/:/g, '')
  const ah = `ah${uid}`
  const ahc = `ahc${uid}`
  const H = 100
  const W = H * aspect
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <marker id={ah} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 L6 3 L0 6 z" fill="#111111" />
        </marker>
        <marker id={ahc} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 L6 3 L0 6 z" fill="#b02a22" />
        </marker>
      </defs>
      {snap.zones.map((z, i) => {
        const m = snap.motion?.[i]
        if (!m) return null
        const speed = Math.hypot(m.vx, m.vy)
        if (speed < 0.004 && !snap.counterFlow?.[i]) return null
        const cx = (z.x + z.w / 2) * W
        const cy = (z.y + z.h / 2) * H
        const len = Math.min(z.w * W, z.h * H) * 0.32 * Math.min(1, 0.45 + speed / 0.03)
        const ux = speed ? m.vx / speed : 0
        const uy = speed ? m.vy / speed : 1
        if (snap.counterFlow?.[i]) {
          // Two opposing streams, offset sideways.
          const ox = -uy * len * 0.22
          const oy = ux * len * 0.22
          return (
            <g key={z.id} stroke="#b02a22" strokeWidth="0.9" strokeLinecap="square">
              <line x1={cx - ux * len * 0.5 + ox} y1={cy - uy * len * 0.5 + oy} x2={cx + ux * len * 0.5 + ox} y2={cy + uy * len * 0.5 + oy} markerEnd={`url(#${ahc})`} />
              <line x1={cx + ux * len * 0.5 - ox} y1={cy + uy * len * 0.5 - oy} x2={cx - ux * len * 0.5 - ox} y2={cy - uy * len * 0.5 - oy} markerEnd={`url(#${ahc})`} />
            </g>
          )
        }
        return (
          <line
            key={z.id}
            x1={cx - ux * len * 0.5}
            y1={cy - uy * len * 0.5}
            x2={cx + ux * len * 0.5}
            y2={cy + uy * len * 0.5}
            stroke="#111111"
            strokeOpacity="0.55"
            strokeWidth="0.7"
            markerEnd={`url(#${ah})`}
          />
        )
      })}
    </svg>
  )
}
