// Turns one algorithm's real output into graph highlights for CrowdGraphView.
// `cursor` is how many steps of the algorithm to show (for the step-by-step replay).
import { SAFE, SOURCE } from '../../engine/crowdGraphBuilder.js'

const INK = '#111111'
const CRIT = '#b02a22'
const SAFE_GREEN = '#2f7a45'
const WARN = '#b4561a'

const fmt = (v) => (v === Infinity ? '∞' : Math.round(v * 10) / 10)

// Number of replay steps for each view.
export function stepCount(view, a) {
  if (!a || a.status !== 'ok') return 0
  if (view === 'bfs') return a.reach.order.length
  if (view === 'dfs') return a.cluster.order.length
  if (view === 'dijkstra') return a.route.safest.settled.length
  if (view === 'flow') return a.capacity.flow.augmentingPaths.length
  return 0
}

export function decorate(view, a, cursor) {
  if (!a || a.status !== 'ok') return { graph: a?.graph, nodeDeco: {}, edgeDeco: {} }
  switch (view) {
    case 'state':
      return rankDeco(a)
    case 'graph':
      return { graph: a.graph, nodeDeco: { [a.critical.id]: { ring: CRIT } }, edgeDeco: {} }
    case 'bfs':
      return bfsDeco(a, cursor)
    case 'dfs':
      return dfsDeco(a, cursor)
    case 'dijkstra':
      return dijkstraDeco(a, cursor)
    case 'flow':
      return flowDeco(a, cursor)
    case 'greedy':
      return greedyDeco(a)
    case 'result':
      return resultDeco(a)
    default:
      return { graph: a.graph, nodeDeco: {}, edgeDeco: {} }
  }
}

function rankDeco(a) {
  const nodeDeco = {}
  a.ranking.ranked.forEach((z, i) => {
    nodeDeco[z.id] = { badge: i + 1, badgeColor: i === 0 ? CRIT : INK, ring: i === 0 ? CRIT : undefined }
  })
  return { graph: a.graph, nodeDeco, edgeDeco: {} }
}

function bfsDeco(a, cursor) {
  const { order, parent, hops, blockedExits } = a.reach
  const shown = order.slice(0, cursor)
  const nodeDeco = {}
  const edgeDeco = {}
  shown.forEach((id, i) => {
    nodeDeco[id] = { badge: i + 1, ring: i === shown.length - 1 && cursor < order.length ? CRIT : undefined, note: id === a.critical.id ? 'start' : `${hops.get(id)} hop${hops.get(id) === 1 ? '' : 's'}` }
    const p = parent.get(id)
    if (p) edgeDeco[`${p}->${id}`] = { color: INK, width: 3, arrow: true }
  })
  if (cursor >= order.length) {
    for (const id of blockedExits) nodeDeco[id] = { ring: CRIT, note: 'unreachable', noteColor: CRIT }
  }
  return { graph: a.graph, nodeDeco, edgeDeco }
}

function dfsDeco(a, cursor) {
  const { order, parent } = a.cluster
  const nodeDeco = {}
  const edgeDeco = {}
  order.slice(0, cursor).forEach((id, i) => {
    nodeDeco[id] = { badge: i + 1, badgeColor: CRIT, ring: CRIT }
    const p = parent.get(id)
    if (p) edgeDeco[`${p}->${id}`] = { color: CRIT, width: 3.5, arrow: true }
  })
  return { graph: a.graph, nodeDeco, edgeDeco }
}

function dijkstraDeco(a, cursor) {
  const { safest, shortest } = a.route
  const nodeDeco = {}
  const edgeDeco = {}
  safest.settled.slice(0, cursor).forEach(({ node, dist }, i) => {
    nodeDeco[node] = { badge: i + 1, note: `d=${fmt(dist)}`, ring: i === cursor - 1 && cursor < safest.settled.length ? CRIT : undefined }
  })
  if (cursor >= safest.settled.length) {
    for (const e of shortest.edges) edgeDeco[e.id] = { color: CRIT, width: 2.5, dash: '7 5', arrow: true, label: `${e.distance} m` }
    for (const e of safest.edges) edgeDeco[e.id] = { color: INK, width: 5, arrow: true, label: `${e.cost}` }
    nodeDeco[a.critical.id] = { ...nodeDeco[a.critical.id], ring: CRIT }
    nodeDeco[SAFE] = { ...nodeDeco[SAFE], ring: INK }
  }
  return { graph: a.graph, nodeDeco, edgeDeco }
}

function flowDeco(a, cursor) {
  const { flow, cut } = a.capacity
  const paths = flow.augmentingPaths
  const nodeDeco = {}
  const edgeDeco = {}
  const done = cursor >= paths.length
  if (done) {
    // Final flow on every edge that carries people, then the min cut on top.
    for (const e of a.graph.edges()) {
      const f = flow.edgeFlow.get(e.id) ?? 0
      if (f > 0) edgeDeco[e.id] = { color: INK, width: 2 + f / 15, arrow: true, label: `${fmt(f)}/${fmt(e.capacity)}` }
    }
    for (const e of cut.cutEdges) edgeDeco[e.id] = { color: CRIT, width: 5, arrow: true, label: `cut ${fmt(e.capacity)}/min` }
    for (const e of cut.closedCrossing) edgeDeco[e.id] = { color: WARN, width: 2.5, dash: '5 4', arrow: true, label: 'closed' }
  } else if (cursor > 0) {
    // Earlier paths in grey, the newest augmenting path in red.
    paths.slice(0, cursor).forEach((p, k) => {
      const latest = k === cursor - 1
      for (let i = 0; i < p.path.length - 1; i++) {
        if (p.path[i] === SOURCE) continue
        const id = `${p.path[i]}->${p.path[i + 1]}`
        edgeDeco[id] = { color: latest ? CRIT : INK, width: latest ? 5 : 3, arrow: true, label: latest ? `+${fmt(p.bottleneck)}` : undefined }
      }
    })
  }
  return { graph: a.graph, nodeDeco, edgeDeco }
}

// Edges whose capacity went up because of the plan (opened gates, stairs without counter-flow...).
function changedEdges(a) {
  const before = new Map(a.graph.edges().map((e) => [e.id, e.capacity]))
  return a.after.graph.edges().filter((e) => e.capacity > (before.get(e.id) ?? 0))
}

function greedyDeco(a) {
  const edgeDeco = {}
  const nodeDeco = {}
  for (const e of a.after.capacity.cut.cutEdges) edgeDeco[e.id] = { color: CRIT, width: 4, arrow: true, label: `cut ${fmt(e.capacity)}` }
  for (const e of changedEdges(a)) {
    const old = a.graph.edges().find((x) => x.id === e.id)?.capacity ?? 0
    edgeDeco[e.id] = { color: SAFE_GREEN, width: 5, arrow: true, label: `${fmt(old)}→${fmt(e.capacity)}` }
    nodeDeco[e.to] = { ring: SAFE_GREEN }
  }
  return { graph: a.after.graph, nodeDeco, edgeDeco }
}

function resultDeco(a) {
  const { nodeDeco, edgeDeco } = greedyDeco(a)
  for (const id of Object.keys(edgeDeco)) if (edgeDeco[id].color === CRIT) delete edgeDeco[id]
  for (const e of a.after.route.edges) edgeDeco[e.id] = { color: INK, width: 5, arrow: true }
  nodeDeco[a.critical.id] = { ring: CRIT, note: 'critical', noteColor: CRIT }
  return { graph: a.after.graph, nodeDeco, edgeDeco }
}
