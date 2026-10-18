// Converts Sentinel's crowd state into a weighted graph.
//
// INPUT  (all from the running app, never invented here):
//   snap       CrowdEngine snapshot for the main camera: zones, counts, levels, turbulence, counter-flow
//   settings   alert thresholds (to turn counts into % of crush density)
//   site       configured exits and entries (site.js)
//   sideSnaps  snapshots of the other station cameras (footbridge, concourse, Platform 3)
//   applied    intervention ids currently in force (e.g. ['gate2'])
// OUTPUT: a Graph (adjacency list) with nodes = zones, exits, stairs, areas, and one SAFE sink.
//
// The same graph is used by BFS, DFS, Dijkstra, max flow and min cut.
import { Graph } from '../algorithms/graph/Graph.js'
import { GRID_CELLS } from '../lib/zones.js'
import { CAPACITY, COST_WEIGHTS, COUNTER_FLOW_LOSS, CROWD_FLOW, DISTANCE, PLATFORM_M, STATION_AREAS, STATION_EXITS } from './stationModel.js'

export const SAFE = 'SAFE'
export const SOURCE = 'CROWD' // super-source used only by max flow

// Layout box for drawing (viewBox 1000 x 600). Zones keep their camera positions.
const FRAME = { x: 120, y: 40, w: 560, h: 330 }
const toPx = (x, y) => ({ px: FRAME.x + x * FRAME.w, py: FRAME.y + y * FRAME.h })

export function edgeCost({ distance, congestion, risk }) {
  return COST_WEIGHTS.distance * distance + COST_WEIGHTS.congestion * congestion + COST_WEIGHTS.risk * risk
}

// Flow slows down in dense crowds: 1.0 when calm, down to CROWD_FLOW.jammedFactor at crush density.
export function crowdFactor(densityPct) {
  const { freeUntil, jammedAt, jammedFactor } = CROWD_FLOW
  if (densityPct <= freeUntil) return 1
  if (densityPct >= jammedAt) return jammedFactor
  return 1 - ((densityPct - freeUntil) / (jammedAt - freeUntil)) * (1 - jammedFactor)
}

// % of the CRITICAL (crush) threshold, scaled to the zone's size exactly like risk.js does.
export function zoneDensityPct(zone, count, settings) {
  const areaFactor = Math.max(0.15, zone.w * zone.h * GRID_CELLS)
  return (count / (settings.critical * areaFactor)) * 100
}

const round1 = (v) => Math.round(v * 10) / 10

export function buildCrowdGraph({ snap, settings, site, sideSnaps = {}, applied = [] }) {
  const g = new Graph()
  const on = new Set(applied)
  const zones = snap.zones

  // ---- Zone nodes (from the camera) ----
  zones.forEach((z, i) => {
    const people = snap.counts[i] ?? 0
    const density = zoneDensityPct(z, people, settings)
    const level = snap.levels[i] ?? 0
    // Risk index: worst of alert level, turbulence and counter-flow, each 0..100.
    const risk = Math.max((level / 3) * 100, snap.turbulence?.[i] ?? 0, snap.counterIdx?.[i] ?? 0)
    g.addNode(z.id, {
      kind: 'zone',
      label: z.name,
      people,
      density: round1(density),
      risk: Math.round(risk),
      level,
      counterFlow: snap.counterIdx?.[i] ?? 0,
      ...toPx(z.x + z.w / 2, z.y + z.h / 2),
      cx: z.x + z.w / 2,
      cy: z.y + z.h / 2,
    })
  })

  // ---- Zone-to-zone walking edges (both directions) ----
  zones.forEach((z, i) => {
    for (const j of z.neighbours ?? []) {
      if (j <= i) continue // add each pair once, as two directed edges
      const a = g.getNode(z.id)
      const b = g.getNode(zones[j].id)
      const distance = Math.hypot((a.cx - b.cx) * PLATFORM_M.length, (a.cy - b.cy) * PLATFORM_M.depth)
      // A connection is as slow as its most crowded end.
      const capacity = Math.round(CAPACITY.floor * crowdFactor(Math.max(a.density, b.density)))
      g.addEdge(a.id, b.id, walkEdge(distance, capacity, b))
      g.addEdge(b.id, a.id, walkEdge(distance, capacity, a))
    }
  })

  g.addNode(SAFE, { kind: 'safe', label: 'Safe area (street)', people: 0, density: 0, risk: 0, px: 400, py: 560 })

  const exits = (site?.points ?? []).filter((p) => p.kind === 'exit')
  const station = site?.type === 'station'
  const nearestZone = (p) =>
    zones.reduce((best, z) => {
      const d = Math.hypot(z.x + z.w / 2 - p.x, z.y + z.h / 2 - p.y)
      return !best || d < best.d ? { z, d } : best
    }, null)?.z

  // ---- Exit nodes (from the site configuration) ----
  for (const p of exits) {
    const spec = (station && STATION_EXITS[p.name]) || { capacity: CAPACITY.gate, passage: 30 }
    const closed = spec.opensWith && !on.has(spec.opensWith)
    const z = nearestZone(p)
    if (!z) continue
    const id = `EXIT:${p.name}`
    g.addNode(id, { kind: 'exit', label: p.name, closed, people: 0, density: 0, risk: 0, ...exitPx(p) })
    g.addEdge(z.id, id, { distance: DISTANCE.zoneToExit, capacity: closed ? 0 : spec.capacity, congestion: 0, risk: 0, cost: edgeCost({ distance: DISTANCE.zoneToExit, congestion: 0, risk: 0 }), kind: 'exit' })
    g.addEdge(id, SAFE, { distance: spec.passage, capacity: Infinity, congestion: 0, risk: 0, cost: edgeCost({ distance: spec.passage, congestion: 0, risk: 0 }), kind: 'passage' })
  }

  // ---- Station infrastructure seen by the other cameras ----
  if (station) addStationInfrastructure(g, { site, sideSnaps, on, nearestZone })

  // Final cost for every edge (kept on the edge so the UI can show the breakdown).
  for (const e of g.edges()) e.cost = round1(edgeCost(e))
  return g
}

function walkEdge(distance, capacity, dest) {
  return { distance: round1(distance), capacity, congestion: dest.density, risk: dest.risk, kind: 'walk' }
}

function exitPx(p) {
  // Push exits just outside the platform outline so they never sit on top of a zone.
  const { px, py } = toPx(p.x, p.y)
  if (p.y >= 0.85) return { px, py: FRAME.y + FRAME.h + 70 }
  if (p.y <= 0.15) return { px, py: FRAME.y - 25 }
  if (p.x <= 0.15) return { px: FRAME.x - 45, py }
  return { px: FRAME.x + FRAME.w + 45, py }
}

function areaNode(g, key, sideSnaps, px, py) {
  const spec = STATION_AREAS[key]
  const people = sideSnaps[spec.camera]?.people ?? 0
  const density = round1((people / spec.hold) * 100)
  const level = sideSnaps[spec.camera]?.overall ?? 0
  return g.addNode(key.toUpperCase(), { kind: 'area', label: spec.label, camera: spec.camera, people, density, risk: Math.round((level / 3) * 100), level, px, py })
}

function addStationInfrastructure(g, { site, sideSnaps, on, nearestZone }) {
  const stairsPoint = site.points.find((p) => p.kind === 'entry' && /stair/i.test(p.name))
  const footbridge = areaNode(g, 'footbridge', sideSnaps, 880, 250)
  const concourse = areaNode(g, 'concourse', sideSnaps, 880, 420)
  const platform3 = areaNode(g, 'platform3', sideSnaps, 880, 80)

  if (stairsPoint) {
    const foot = nearestZone(stairsPoint)
    const footNode = g.getNode(foot.id)
    // Counter-flow measured by the camera at the foot of the stairs cuts their capacity,
    // unless entry is paused (then nobody is coming down).
    const counter = on.has('pauseEntry') ? 0 : footNode.counterFlow
    const capacity = Math.round(CAPACITY.stairs * (1 - (COUNTER_FLOW_LOSS * counter) / 100) * crowdFactor(footbridge.density))
    g.addNode('STAIRS', { kind: 'stairs', label: stairsPoint.name, people: 0, density: footbridge.density, risk: counter, counterFlow: counter, ...exitPx(stairsPoint) })
    g.addEdge(foot.id, 'STAIRS', { distance: DISTANCE.zoneToExit, capacity, congestion: footbridge.density, risk: counter, kind: 'stairs' })
    g.addEdge('STAIRS', footbridge.id, { distance: DISTANCE.stairsClimb, capacity: Infinity, congestion: footbridge.density, risk: footbridge.risk, kind: 'stairs' })
  }

  g.addEdge(footbridge.id, concourse.id, {
    distance: DISTANCE.footbridgeToConcourse,
    capacity: Math.round(CAPACITY.footbridgeToConcourse * crowdFactor(concourse.density)),
    congestion: concourse.density,
    risk: concourse.risk,
    kind: 'walk',
  })
  g.addEdge(concourse.id, SAFE, { distance: DISTANCE.concourseToStreet, capacity: CAPACITY.concourseToStreet, congestion: 0, risk: 0, kind: 'passage' })

  // Platform 3 is a refuge only when people are redirected there.
  const redirect = on.has('redirect')
  g.addEdge(footbridge.id, platform3.id, {
    distance: DISTANCE.footbridgeToPlatform3,
    capacity: redirect ? CAPACITY.footbridgeToPlatform3 : 0,
    congestion: platform3.density,
    risk: platform3.risk,
    kind: 'walk',
  })
  g.addEdge(platform3.id, SAFE, { distance: 0, capacity: CAPACITY.platform3Hold, congestion: 0, risk: 0, kind: 'refuge' })

  // Platform-end emergency door, west end of Platform 2 (normally locked).
  const westZone = nearestZone({ x: 0, y: 0.5 })
  const emergencyOpen = on.has('emergencyExit')
  g.addNode('EMERGENCY', { kind: 'exit', label: 'Emergency exit', closed: !emergencyOpen, people: 0, density: 0, risk: 0, px: 52, py: FRAME.y + FRAME.h / 2 })
  g.addEdge(westZone.id, 'EMERGENCY', { distance: DISTANCE.zoneToExit, capacity: emergencyOpen ? CAPACITY.emergencyExit : 0, congestion: 0, risk: 0, kind: 'exit' })
  g.addEdge('EMERGENCY', SAFE, { distance: DISTANCE.emergencyPassage, capacity: Infinity, congestion: 0, risk: 0, kind: 'passage' })
}

// Max flow needs one source: CROWD -> every occupied zone with unlimited capacity, so the answer is
// limited only by the station's corridors, stairs and exits.
export function withCrowdSource(graph) {
  const flowGraph = new Graph()
  for (const [id, node] of graph.nodes) flowGraph.addNode(id, node)
  for (const e of graph.edges()) flowGraph.addEdge(e.from, e.to, e)
  flowGraph.addNode(SOURCE, { kind: 'source', label: 'Crowd' })
  for (const node of graph.nodes.values()) {
    if (node.kind === 'zone' && node.people > 0) flowGraph.addEdge(SOURCE, node.id, { capacity: Infinity, distance: 0, kind: 'source' })
  }
  return flowGraph
}
