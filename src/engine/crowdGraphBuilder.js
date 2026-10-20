// Turns a live crowd snapshot into the weighted directed graph every algorithm runs on.
//
// This is the join between the two halves of Sentinel. Everything above it is measurement --
// the detector or the simulation says how many people are where and which way they are moving.
// Everything below it is algorithmic -- traversal, shortest path, flow, optimisation. The graph
// is the only thing they share, so the modelling assumptions all live here, in one place, where
// they can be argued with.
//
// NODES
//   zone   one per configured zone, carrying its people count, density and risk level
//   exit   one per configured exit point (a gate, staircase or dispersal route)
//   entry  one per configured entry point; people arrive here, so it is a source of inflow
//   Zones with no site configuration still get zones; with no exits the graph simply has none,
//   and the algorithms report "no reachable exit" rather than inventing one.
//
// EDGES (directed; a two-way corridor is two edges, because congestion differs by direction)
//   zone -> zone   between zones that physically touch
//   zone -> exit   from each zone whose area contains or adjoins an exit point
//
// EDGE QUANTITIES
//   distance   metres, from the normalised camera coordinates scaled by SITE_WIDTH_M
//   walkTime   seconds, distance / speed, where speed falls as the destination fills up. This
//              is the standard speed-density relation: a dense crowd walks slower, and below a
//              jam density it barely moves at all.
//   capacity   people per minute, = effective width (m) x specific flow (people/min/m), then
//              reduced by congestion. 82 people/min/m at optimal density is Fruin's figure for
//              level walkways; a jammed link falls well below it.
//   congestion 0..1, how full the DESTINATION zone is relative to its CRITICAL density. The
//              destination, not the origin, because moving INTO a full zone is what stalls.
//   risk       0..1, from the destination's level, turbulence and counter-flow.
//   cost       the weighted sum used by Dijkstra. Non-negative by construction, which is what
//              makes Dijkstra applicable at all.

import Graph from '../algorithms/graph/Graph.js'
import { isConfigured } from '../lib/site.js'
import { GRID_CELLS } from '../lib/zones.js'

// ---- Physical assumptions, all in one block so they can be challenged in a viva ----
export const MODEL = {
  SITE_WIDTH_M: 40, // the camera's field of view is assumed to span 40 m
  FREE_SPEED_MS: 1.34, // unobstructed walking speed, m/s (Weidmann)
  MIN_SPEED_MS: 0.2, // a jammed crowd still shuffles
  SPECIFIC_FLOW: 82, // people per minute per metre of width at optimal density (Fruin)
  MIN_LINK_WIDTH_M: 1.0, // narrowest link modelled
  MIN_CAPACITY: 4, // people/min; a link never drops to literally zero while it is open
  EXIT_WIDTH_M: 2.0, // assumed clear width of a configured exit
  // Dijkstra cost weights. Distance is normalised by SITE_WIDTH_M so all three terms are 0..1-ish
  // and the weights are directly comparable.
  W_DISTANCE: 1.0,
  W_CONGESTION: 2.5, // congestion matters more than metres: a short jammed route is a bad route
  W_RISK: 4.0, // and danger matters most of all
}

/** People per unit normalised area at which a zone counts as CRITICAL. */
export const criticalDensity = (settings) => settings.critical * GRID_CELLS

/**
 * @param {object} snap       engine snapshot: zones, counts, levels, turbulence, counterFlow, motion
 * @param {object} settings   current mode thresholds (watch/warning/critical...)
 * @param {object} site       site profile with exit/entry points
 * @param {object} options    { closedLinks: Set<string>, extraExitCapacity: Map<id, people/min> }
 */
export function buildCrowdGraph(snap, settings, site, { closedLinks, extraExitCapacity, openedExits } = {}) {
  const graph = new Graph({ directed: true })
  const zones = snap.zones ?? []
  const counts = snap.counts ?? []
  const crit = criticalDensity(settings)

  // ---- Zone nodes ----
  zones.forEach((z, i) => {
    const area = Math.max(0.02, z.w * z.h) // guard against a degenerate hand-drawn zone
    const people = counts[i] ?? 0
    const density = people / area
    graph.addNode({
      id: `Z:${z.id}`,
      kind: 'zone',
      name: z.name,
      zoneIndex: i,
      x: z.x + z.w / 2,
      y: z.y + z.h / 2,
      w: z.w,
      h: z.h,
      area,
      people,
      density,
      // 0 = empty, 1 = at the CRITICAL density. Can exceed 1, and the model keeps it honest.
      load: crit > 0 ? density / crit : 0,
      level: snap.levels?.[i] ?? 0,
      turbulence: snap.turbulence?.[i] ?? 0,
      counterFlow: Boolean(snap.counterFlow?.[i]),
      surge: Boolean(snap.surges?.[i]),
    })
  })

  // ---- Exit and entry nodes from the site configuration ----
  const configured = isConfigured(site)
  const points = configured ? site.points : []
  for (const p of points) {
    if (p.kind !== 'exit' && p.kind !== 'entry') continue
    graph.addNode({
      id: `${p.kind === 'exit' ? 'X' : 'E'}:${p.id}`,
      kind: p.kind,
      name: p.name,
      x: p.x,
      y: p.y,
      pointId: p.id,
      // A configured exit is assumed open unless an intervention has yet to open it.
      opened: openedExits ? openedExits.has(p.id) : true,
    })
  }

  const closed = closedLinks ?? new Set()

  // ---- Zone to zone edges ----
  zones.forEach((z, i) => {
    const from = graph.getNode(`Z:${z.id}`)
    for (const j of z.neighbours ?? []) {
      const other = zones[j]
      if (!other) continue
      const to = graph.getNode(`Z:${other.id}`)
      const id = `Z:${z.id}->Z:${other.id}`
      if (closed.has(id)) continue
      graph.addEdge(from.id, to.id, linkAttributes(from, to, sharedWidth(z, other), MODEL))
    }
  })

  // ---- Zone to exit edges ----
  // An exit is attached to the zone whose rectangle contains it, and to any zone whose centre is
  // within REACH of it, so an exit sitting on a boundary serves both sides.
  const REACH = 0.22
  for (const node of graph.nodesOfKind('exit')) {
    const added = new Set()
    const attach = (zoneNode) => {
      if (!zoneNode || added.has(zoneNode.id)) return
      const id = `${zoneNode.id}->${node.id}`
      if (closed.has(id)) return
      added.add(zoneNode.id)
      const extra = extraExitCapacity?.get(node.pointId) ?? 0
      // The approach to a gate is a real walkway, and the queue for the gate stands in the zone
      // itself, so this link is throttled by the ORIGIN zone's congestion rather than the
      // destination's: a jammed platform cannot feed its gate at the gate's full width. The
      // gate's own throughput (the exit-to-sink edge in the flow network) is separate and is set
      // by the gate's width alone.
      const attrs = linkAttributes(zoneNode, node, MODEL.EXIT_WIDTH_M, MODEL, zoneNode)
      graph.addEdge(zoneNode.id, node.id, {
        ...attrs,
        kind: 'exit-link',
        capacity: node.opened === false ? 0 : attrs.capacity + extra,
        baseCapacity: attrs.capacity,
        addedCapacity: extra,
      })
    }
    for (const z of zones) {
      const inside = node.x >= z.x && node.x <= z.x + z.w && node.y >= z.y && node.y <= z.y + z.h
      const near = Math.hypot(z.x + z.w / 2 - node.x, z.y + z.h / 2 - node.y) <= REACH
      if (inside || near) attach(graph.getNode(`Z:${z.id}`))
    }
    // An exit the geometry left isolated is still an exit: join it to the nearest zone.
    if (!added.size && zones.length) {
      const nearest = zones.reduce((best, z) => {
        const d = Math.hypot(z.x + z.w / 2 - node.x, z.y + z.h / 2 - node.y)
        return !best || d < best.d ? { z, d } : best
      }, null)
      attach(graph.getNode(`Z:${nearest.z.id}`))
    }
  }

  // ---- Entry edges: an entry pushes people INTO the nearest zone ----
  for (const node of graph.nodesOfKind('entry')) {
    const nearest = zones.reduce((best, z) => {
      const d = Math.hypot(z.x + z.w / 2 - node.x, z.y + z.h / 2 - node.y)
      return !best || d < best.d ? { z, d } : best
    }, null)
    if (!nearest) continue
    const target = graph.getNode(`Z:${nearest.z.id}`)
    graph.addEdge(node.id, target.id, { ...linkAttributes(node, target, MODEL.EXIT_WIDTH_M, MODEL), kind: 'entry-link' })
  }

  return graph
}

/** Length of the boundary two zones share, in metres: how wide the link between them is. */
function sharedWidth(a, b, model = MODEL) {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  // Zones side by side share a vertical boundary (overlapY is its length) and vice versa.
  const shared = Math.max(overlapX > 0 ? overlapY : 0, overlapY > 0 ? overlapX : 0)
  return Math.max(model.MIN_LINK_WIDTH_M, shared * model.SITE_WIDTH_M)
}

/**
 * All the physical quantities for one directed link, plus the derived Dijkstra cost.
 * `throttle` is the node whose crowd limits this link -- the destination for a corridor
 * (moving INTO a full zone is what stalls), the origin for a gate approach (the queue for the
 * gate stands in the zone it leaves from).
 */
function linkAttributes(from, to, widthM, model, throttle = to) {
  const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y) * model.SITE_WIDTH_M)

  const load = Math.max(0, throttle.load ?? 0)
  const congestion = Math.min(1, load)
  const risk = Math.min(1, (throttle.level ?? 0) / 3 * 0.6 + (throttle.turbulence ?? 0) / 100 * 0.3 + (throttle.counterFlow ? 0.1 : 0))

  // Speed-density relation: free speed when empty, falling towards a shuffle as the destination
  // approaches and passes its critical density.
  const speed = Math.max(model.MIN_SPEED_MS, model.FREE_SPEED_MS * (1 - Math.min(1, load) * 0.85))
  const walkTime = distance / speed

  // Capacity: width x specific flow, cut by congestion. A jammed link passes far fewer people
  // per minute than its width suggests, which is what makes the max flow a live number.
  const capacity = Math.max(model.MIN_CAPACITY, widthM * model.SPECIFIC_FLOW * (1 - Math.min(0.9, load * 0.7)))

  const cost =
    model.W_DISTANCE * (distance / model.SITE_WIDTH_M) + // normalised so the weights compare
    model.W_CONGESTION * congestion +
    model.W_RISK * risk

  return { distance, walkTime, capacity, congestion, risk, cost, width: widthM, kind: 'corridor' }
}

/** Human-readable explanation of one edge's cost, for the route breakdown in the UI. */
export function explainCost(edge, model = MODEL) {
  const d = model.W_DISTANCE * (edge.distance / model.SITE_WIDTH_M)
  const c = model.W_CONGESTION * edge.congestion
  const r = model.W_RISK * edge.risk
  return {
    total: edge.cost,
    parts: [
      { label: 'distance', value: d, detail: `${edge.distance.toFixed(0)} m` },
      { label: 'congestion', value: c, detail: `${Math.round(edge.congestion * 100)}% of critical density` },
      { label: 'risk', value: r, detail: `${Math.round(edge.risk * 100)}/100` },
    ],
  }
}

export default buildCrowdGraph
