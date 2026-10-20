import { useId } from 'react'
import { LEVELS } from '../lib/risk.js'

// Draws the crowd graph in camera coordinates, so a node sits where that zone or gate actually
// is. Every overlay it can show comes from a real algorithm result:
//   route        the node path Dijkstra returned
//   altRoute     the distance-only path, for the "shortest is not safest" comparison
//   cutEdges     edge ids in the minimum cut
//   visited      traversal order from BFS or DFS, drawn as numbered badges
//   flowEdges    map of edge id to people/min, from the max-flow result
//   regions      quadtree rectangles from the divide-and-conquer partition
//
// Nothing here computes anything; it only renders what it is given.

const W = 160
const H = 90
const PAD_X = 8
const PAD_Y = 7

const NODE_COLORS = {
  exit: '#2f7a45',
  entry: '#9a7410',
}

export default function GraphView({
  graph,
  route = null,
  altRoute = null,
  cutEdges = [],
  visited = null,
  flowEdges = null,
  regions = null,
  focusId = null,
  highlightNodes = [],
  showCapacities = false,
  className = '',
}) {
  const uid = useId().replace(/:/g, '')
  if (!graph || !graph.nodeCount) {
    return (
      <div className={`flex items-center justify-center border border-line bg-[#f6f5f1] text-[12px] text-dim ${className}`} style={{ aspectRatio: '16 / 9' }}>
        No zones configured, so there is no graph to draw.
      </div>
    )
  }

  const cut = new Set(cutEdges)
  const routeEdges = pathEdgeIds(route)
  const altEdges = pathEdgeIds(altRoute)
  const visitIndex = new Map((visited ?? []).map((id, i) => [id, i + 1]))
  const highlight = new Set(highlightNodes)
  const nodes = graph.nodeList()
  // Camera coordinates run 0..1 and exits often sit right on an edge (a gate at y = 0.97), so the
  // drawing is inset far enough that a node and its label stay inside the frame.
  const pos = (n) => ({ x: PAD_X + n.x * (W - 2 * PAD_X), y: PAD_Y + n.y * (H - 2 * PAD_Y) })

  // One edge per unordered pair for drawing: a two-way corridor is one line, not two on top of
  // each other. The attributes shown are the worst of the two directions.
  const drawn = new Map()
  for (const e of graph.edges) {
    const key = [e.from, e.to].sort().join('~')
    const prior = drawn.get(key)
    if (!prior) drawn.set(key, { ...e, pair: [e.from, e.to], ids: [e.id], twoWay: false })
    else {
      prior.twoWay = true
      prior.ids.push(e.id)
      prior.capacity = Math.min(prior.capacity, e.capacity)
      prior.congestion = Math.max(prior.congestion, e.congestion)
    }
  }

  return (
    <div className={`relative border border-line bg-[#f6f5f1] ${className}`} style={{ aspectRatio: '16 / 9' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" role="img" aria-label="Crowd graph">
        <defs>
          <marker id={`arrow${uid}`} viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="3.2" markerHeight="3.2" orient="auto">
            <path d="M0 0 L6 3 L0 6 z" fill="#111111" />
          </marker>
          <marker id={`route${uid}`} viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="3.6" markerHeight="3.6" orient="auto">
            <path d="M0 0 L6 3 L0 6 z" fill="#b02a22" />
          </marker>
        </defs>

        {/* Quadtree regions from the divide-and-conquer partition */}
        {regions?.map((r, i) => (
          <rect
            key={`r${i}`}
            x={PAD_X + r.rect.x * (W - 2 * PAD_X)}
            y={PAD_Y + r.rect.y * (H - 2 * PAD_Y)}
            width={r.rect.w * (W - 2 * PAD_X)}
            height={r.rect.h * (H - 2 * PAD_Y)}
            fill={r.hot ? '#b02a2218' : 'none'}
            stroke={r.hot ? '#b02a22' : '#6b6963'}
            strokeWidth={r.hot ? 0.8 : 0.3}
            strokeDasharray={r.hot ? undefined : '1.5 1.5'}
          />
        ))}

        {/* Edges */}
        {[...drawn.values()].map((e) => {
          const a = pos(graph.getNode(e.pair[0]))
          const b = pos(graph.getNode(e.pair[1]))
          const inCut = e.ids.some((id) => cut.has(id))
          const onRoute = e.ids.some((id) => routeEdges.has(id))
          const onAlt = !onRoute && e.ids.some((id) => altEdges.has(id))
          const flow = flowEdges ? Math.max(...e.ids.map((id) => flowEdges.get(id) ?? 0)) : 0
          const stroke = inCut ? '#b02a22' : onRoute ? '#b02a22' : onAlt ? '#9a7410' : '#6b6963'
          // Line thickness shows capacity, so a narrow link looks narrow.
          const width = inCut ? 1.6 : onRoute ? 1.5 : 0.35 + Math.min(1, e.capacity / 200) * 0.9
          return (
            <g key={e.ids.join('|')}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={stroke}
                strokeWidth={width}
                strokeOpacity={inCut || onRoute || onAlt ? 0.95 : 0.4}
                strokeDasharray={inCut ? '2 1.2' : onAlt ? '2.5 1.5' : undefined}
              />
              {flow > 0 && (
                // Flow drawn as a second, thinner line on top: how much of the width is used.
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2f7a45" strokeWidth={Math.min(1.4, 0.2 + (flow / 200) * 1.2)} strokeOpacity="0.8" />
              )}
              {showCapacities && (
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 0.6} textAnchor="middle" fontSize="2.1" fill={inCut ? '#b02a22' : '#3d3c38'} fontWeight={inCut ? 700 : 500}>
                  {Math.round(e.capacity)}
                </text>
              )}
            </g>
          )
        })}

        {/* Route direction arrows, drawn after the edges so they sit on top */}
        {route && route.length > 1 && (
          <g>
            {route.slice(0, -1).map((id, i) => {
              const a = pos(graph.getNode(id))
              const b = pos(graph.getNode(route[i + 1]))
              return <line key={id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b02a22" strokeWidth="0.1" markerEnd={`url(#${`route${uid}`})`} />
            })}
          </g>
        )}

        {/* Nodes */}
        {nodes.map((n) => {
          const p = pos(n)
          const isZone = n.kind === 'zone'
          const level = n.level ?? 0
          const fill = isZone ? (level ? LEVELS[level].color : '#e7e6e0') : NODE_COLORS[n.kind] ?? '#6b6963'
          const r = isZone ? 2.4 + Math.min(2.6, (n.load ?? 0) * 2.2) : 2.2
          const focused = n.id === focusId
          const marked = highlight.has(n.id)
          return (
            <g key={n.id}>
              {(focused || marked) && <circle cx={p.x} cy={p.y} r={r + 1.6} fill="none" stroke="#b02a22" strokeWidth={focused ? 0.8 : 0.5} strokeDasharray={focused ? undefined : '1 1'} />}
              {n.kind === 'exit' ? (
                <rect x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} fill={fill} stroke="#111111" strokeWidth="0.35" />
              ) : (
                <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke="#111111" strokeWidth="0.35" />
              )}
              {visitIndex.has(n.id) && (
                <text x={p.x} y={p.y + 0.9} textAnchor="middle" fontSize="2.6" fontWeight="700" fill={isZone && level ? '#fbfaf7' : '#111111'}>
                  {visitIndex.get(n.id)}
                </text>
              )}
              <text x={p.x} y={p.y - r - 1} textAnchor="middle" fontSize="2.6" fill="#111111" fontWeight={focused ? 700 : 500}>
                {n.name}
              </text>
              {isZone && n.people > 0 && !visitIndex.has(n.id) && (
                <text x={p.x} y={p.y + 0.9} textAnchor="middle" fontSize="2.4" fontWeight="700" fill={level >= 2 ? '#fbfaf7' : '#111111'}>
                  {n.people}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Edge ids along a node path, in both orientations so the drawing matches either direction. */
function pathEdgeIds(path) {
  const ids = new Set()
  if (!path) return ids
  for (let i = 0; i < path.length - 1; i++) ids.add(`${path[i]}->${path[i + 1]}`)
  return ids
}

export function GraphLegend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-1.5 text-[11px] text-muted">
      {items.map(({ color, label, dashed, square }) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block"
            style={square ? { width: 8, height: 8, background: color, border: '1px solid #111' } : { width: 14, height: 0, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }}
          />
          {label}
        </li>
      ))}
    </ul>
  )
}
