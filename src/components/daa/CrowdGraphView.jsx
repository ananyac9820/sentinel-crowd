import { LEVELS } from '../../lib/risk.js'
import { SOURCE } from '../../engine/crowdGraphBuilder.js'

// Draws the crowd graph exactly as the algorithms see it. This component computes nothing:
// the parent passes `nodeDeco` / `edgeDeco` built from an algorithm's result.
//   nodeDeco[id] = { ring, badge, note, dim }
//   edgeDeco[edgeId] = { color, width, dash, label, arrow }
// Edge ids are directed ("B3->C3"). Two-way platform connections are drawn as one line.

const INK = '#111111'
const MUTED = '#6b6963'
const FRAME = { x: 120, y: 40, w: 560, h: 330 }
const SIZE = {
  zone: { r: 23 },
  exit: { w: 100, h: 30 },
  stairs: { w: 92, h: 30 },
  area: { w: 118, h: 42 },
  safe: { w: 200, h: 34 },
}

// Distance from a node's centre to its outline along direction (dx, dy), so lines stop at the edge.
function reach(node, dx, dy) {
  const s = SIZE[node.kind] ?? SIZE.exit
  if (s.r) return s.r + 2
  const len = Math.hypot(dx, dy) || 1
  const ux = Math.abs(dx / len)
  const uy = Math.abs(dy / len)
  return Math.min(ux ? s.w / 2 / ux : Infinity, uy ? s.h / 2 / uy : Infinity) + 2
}

function congestionColor(c) {
  if (c >= 80) return '#b02a22'
  if (c >= 50) return '#b4561a'
  return '#9c9a93'
}

export default function CrowdGraphView({ graph, nodeDeco = {}, edgeDeco = {}, className = '' }) {
  if (!graph) return null
  const nodes = [...graph.nodes.values()].filter((n) => n.id !== SOURCE && n.px != null)

  // Merge each two-way pair into one segment.
  const segments = new Map()
  for (const e of graph.edges()) {
    if (e.from === SOURCE || e.to === SOURCE) continue
    const twoWay = e.kind === 'walk' && graph.neighbours(e.to).some((r) => r.to === e.from)
    const key = twoWay ? [e.from, e.to].sort().join('|') : e.id
    const seg = segments.get(key) ?? { edges: [], twoWay }
    seg.edges.push(e)
    segments.set(key, seg)
  }

  return (
    <svg viewBox="0 0 1000 600" className={`h-full w-full ${className}`} role="img" aria-label="Crowd graph: zones, exits and connections">
      <defs>
        {['ink', 'muted', 'crit', 'safe', 'warn'].map((k) => (
          <marker key={k} id={`arrow-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L8 4 L0 8 z" fill={{ ink: INK, muted: '#9c9a93', crit: '#b02a22', safe: '#2f7a45', warn: '#b4561a' }[k]} />
          </marker>
        ))}
      </defs>

      {/* Platform outline: the area CAM-03 sees */}
      <rect x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} fill="#f6f5f1" stroke={INK} strokeWidth="1.5" />
      <text x={FRAME.x + 6} y={FRAME.y - 8} fontSize="13" fontWeight="700" fill={INK}>
        Platform 2 (CAM-03): zones from the camera
      </text>
      {graph.hasNode('FOOTBRIDGE') && (
        <text x={880} y={22} fontSize="13" fontWeight="700" fill={INK} textAnchor="middle">
          Other station cameras
        </text>
      )}

      {[...segments.values()].map((seg) => {
        const decorated = seg.edges.find((e) => edgeDeco[e.id])
        const e = decorated ?? seg.edges[0]
        const deco = decorated ? edgeDeco[e.id] : null
        const a = graph.getNode(e.from)
        const b = graph.getNode(e.to)
        const dx = b.px - a.px
        const dy = b.py - a.py
        const len = Math.hypot(dx, dy) || 1
        const ra = reach(a, dx, dy)
        const rb = reach(b, -dx, -dy)
        const x1 = a.px + (dx / len) * ra
        const y1 = a.py + (dy / len) * ra
        const x2 = b.px - (dx / len) * rb
        const y2 = b.py - (dy / len) * rb
        const closed = seg.edges.every((x) => x.capacity <= 0)
        const congestion = Math.max(...seg.edges.map((x) => x.congestion))
        const cap = Math.max(...seg.edges.map((x) => x.capacity))
        const color = deco?.color ?? (closed ? '#9c9a93' : congestionColor(congestion))
        const width = deco?.width ?? (closed ? 1.5 : cap === Infinity ? 1.8 : 1 + Math.min(cap, 120) / 30)
        const dash = deco?.dash ?? (closed ? '5 5' : undefined)
        const markerKey = { [INK]: 'ink', '#b02a22': 'crit', '#2f7a45': 'safe', '#b4561a': 'warn' }[color] ?? 'muted'
        const arrow = deco?.arrow ?? !seg.twoWay
        const tip = seg.edges
          .map((x) => `${graph.getNode(x.from).label} → ${graph.getNode(x.to).label}: ${x.distance} m, capacity ${x.capacity === Infinity ? '∞' : x.capacity}/min, congestion ${Math.round(x.congestion)}%, risk ${Math.round(x.risk)}, cost ${x.cost}`)
          .join('\n')
        return (
          <g key={seg.edges[0].id} opacity={deco?.dim ? 0.25 : 1}>
            <title>{tip}</title>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeDasharray={dash} markerEnd={arrow ? `url(#arrow-${markerKey})` : undefined} />
            {deco?.label && (
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 4}
                fontSize="12"
                fontWeight="700"
                fontFamily="IBM Plex Mono"
                textAnchor="middle"
                fill={color}
                stroke="#f6f5f1"
                strokeWidth="4"
                paintOrder="stroke"
              >
                {deco.label}
              </text>
            )}
          </g>
        )
      })}

      {nodes.map((n) => (
        <Node key={n.id} node={n} deco={nodeDeco[n.id]} />
      ))}
    </svg>
  )
}

function Node({ node: n, deco }) {
  const opacity = deco?.dim ? 0.3 : 1
  const tip = `${n.label}${n.people ? `: ${n.people} people` : ''}${n.kind === 'zone' || n.kind === 'area' ? `, ${Math.round(n.density)}% of crush density, risk ${n.risk}` : ''}${n.closed ? ' (closed)' : ''}`

  if (n.kind === 'zone') {
    const lvl = LEVELS[n.level ?? 0]
    return (
      <g opacity={opacity}>
        <title>{tip}</title>
        {deco?.ring && <circle cx={n.px} cy={n.py} r={SIZE.zone.r + 6} fill="none" stroke={deco.ring} strokeWidth="3.5" />}
        <circle cx={n.px} cy={n.py} r={SIZE.zone.r} fill={n.level ? `${lvl.color}33` : '#fbfaf7'} stroke={n.level ? lvl.color : INK} strokeWidth={n.level >= 2 ? 2.5 : 1.5} />
        <text x={n.px} y={n.py - 2} textAnchor="middle" fontSize="14" fontWeight="700" fill={INK}>
          {n.label}
        </text>
        <text x={n.px} y={n.py + 13} textAnchor="middle" fontSize="11" fontFamily="IBM Plex Mono" fill={n.level ? lvl.color : MUTED} fontWeight="700">
          {n.people}
        </text>
        <Badge deco={deco} x={n.px + 20} y={n.py - 20} />
        <Note deco={deco} x={n.px} y={n.py + SIZE.zone.r + 15} />
      </g>
    )
  }

  const s = SIZE[n.kind] ?? SIZE.exit
  const safe = n.kind === 'safe'
  const sub = n.kind === 'area' ? `${n.people} people · ${Math.round(n.density)}%` : n.closed ? 'closed' : n.kind === 'stairs' && n.counterFlow ? `counter-flow ${n.counterFlow}` : null
  return (
    <g opacity={opacity}>
      <title>{tip}</title>
      {deco?.ring && <rect x={n.px - s.w / 2 - 5} y={n.py - s.h / 2 - 5} width={s.w + 10} height={s.h + 10} fill="none" stroke={deco.ring} strokeWidth="3.5" />}
      <rect
        x={n.px - s.w / 2}
        y={n.py - s.h / 2}
        width={s.w}
        height={s.h}
        fill={safe ? INK : n.closed ? '#e7e6e0' : '#fbfaf7'}
        stroke={n.closed ? '#9c9a93' : INK}
        strokeWidth="1.5"
        strokeDasharray={n.closed ? '5 4' : undefined}
      />
      <text x={n.px} y={n.py + (sub ? -2 : 4)} textAnchor="middle" fontSize="12.5" fontWeight="700" fill={safe ? '#f6f5f1' : n.closed ? MUTED : INK}>
        {safe ? 'SAFE AREA (street)' : n.label}
      </text>
      {sub && (
        <text x={n.px} y={n.py + 11} textAnchor="middle" fontSize="10" fontFamily="IBM Plex Mono" fill={n.closed ? MUTED : '#3d3c38'}>
          {sub}
        </text>
      )}
      <Badge deco={deco} x={n.px + s.w / 2} y={n.py - s.h / 2} />
      <Note deco={deco} x={n.px} y={n.py + s.h / 2 + 14} />
    </g>
  )
}

function Badge({ deco, x, y }) {
  if (deco?.badge == null) return null
  const text = String(deco.badge)
  const w = Math.max(18, text.length * 7.5 + 8)
  return (
    <g>
      <rect x={x - w / 2} y={y - 9} width={w} height={18} rx="9" fill={deco.badgeColor ?? INK} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono" fill="#f6f5f1">
        {text}
      </text>
    </g>
  )
}

function Note({ deco, x, y }) {
  if (!deco?.note) return null
  return (
    <text x={x} y={y} textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono" fill={deco.noteColor ?? INK} stroke="#f6f5f1" strokeWidth="3" paintOrder="stroke">
      {deco.note}
    </text>
  )
}
