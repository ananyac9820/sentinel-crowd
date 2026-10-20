// Dijkstra's single-source shortest-path algorithm over the crowd graph.
//
// WHY DIJKSTRA HERE: every edge cost in the crowd graph is a non-negative combination of
// distance, congestion and risk. Non-negative weights are exactly Dijkstra's precondition, and
// they are what makes the greedy "settle the cheapest unsettled node" step sound: once a node
// is popped from the heap, no later path can improve it, because extending any path only ever
// adds cost. (With negative edges that argument collapses and Bellman-Ford is needed; with
// uniform weights BFS is enough and cheaper. Neither applies here.)
//
// Data structure: a binary MinHeap as the priority queue. See MinHeap.js for why.
//
// Time : O((V + E) log V). Each node is settled once, costing one O(log V) pop; each edge can
//        cause one O(log V) push. This implementation uses "lazy deletion" -- instead of
//        decreasing a key inside the heap it pushes a second, cheaper entry and ignores stale
//        pops. The heap can then hold up to E entries, so the bound is usually written
//        O(E log V), which for a sparse station graph (E = O(V)) is O(V log V).
// Space: O(V + E).
//
// What the result means for Sentinel: the cheapest path is the SAFEST route, not the shortest
// one. Because congestion and risk are part of the cost, a longer walk through calm zones can
// beat a short walk through a crush. Running the same algorithm with a distance-only weight
// (see `compareRoutes`) produces the physically shortest route, and showing the two side by
// side is the clearest demonstration that this is a real optimisation and not a map lookup.

import MinHeap from '../dataStructures/MinHeap.js'

const INF = Infinity

/**
 * @param {Graph} graph
 * @param {string} source
 * @param {object} options
 *   weight   (edge) => non-negative number. Defaults to the edge's precomputed `cost`.
 *   targets  optional Set/array of node ids; the search stops once all are settled.
 *   blocked  (edge) => boolean, edges treated as closed.
 * @returns {{ dist: Map, parent: Map, settledOrder: string[], stats: object }}
 */
export function dijkstra(graph, source, { weight = (e) => e.cost, targets, blocked } = {}) {
  const dist = new Map()
  const parent = new Map()
  const settled = new Set()
  const settledOrder = [] // the order nodes were finalised: the "exploration" the UI animates
  const stats = { settled: 0, edgesRelaxed: 0, improvements: 0, stalePops: 0, heap: null }

  if (!graph?.hasNode(source)) return { dist, parent, settledOrder, stats, reachable: settled }

  const remaining = new Set(targets ? [...targets].filter((t) => graph.hasNode(t)) : [])
  const heap = new MinHeap()
  dist.set(source, 0)
  parent.set(source, null)
  heap.push(source, 0)

  while (!heap.isEmpty()) {
    const { key: u, priority: d } = heap.pop()
    // Lazy deletion: a node can sit in the heap several times with different priorities.
    // Only the first (cheapest) pop counts; the rest are stale copies.
    if (settled.has(u)) {
      stats.stalePops++
      continue
    }
    if (d > (dist.get(u) ?? INF)) {
      stats.stalePops++
      continue
    }
    settled.add(u)
    settledOrder.push(u)
    stats.settled++
    remaining.delete(u)
    if (targets && remaining.size === 0) break // every target finalised: no need to finish

    for (const edge of graph.neighbours(u)) {
      if (blocked?.(edge)) continue
      stats.edgesRelaxed++
      const w = weight(edge)
      if (w < 0) throw new Error(`dijkstra: negative weight on ${edge.id}; use Bellman-Ford for that`)
      const alt = d + w
      if (alt < (dist.get(edge.to) ?? INF)) {
        // Relaxation: a cheaper way into edge.to has been found.
        dist.set(edge.to, alt)
        parent.set(edge.to, u)
        heap.push(edge.to, alt)
        stats.improvements++
      }
    }
  }

  stats.heap = { ...heap.stats }
  return { dist, parent, settledOrder, stats, reachable: settled }
}

/** Rebuilds the node path to `target` from the parent map. O(path length). */
export function shortestPath(parent, target) {
  if (!parent.has(target)) return null
  const path = []
  for (let at = target; at != null; at = parent.get(at)) path.unshift(at)
  return path
}

/** Adds up the real quantities along a path so the UI can explain the cost, not just print it. */
export function describePath(graph, path, weight = (e) => e.cost) {
  if (!path || path.length < 2) return { cost: 0, distance: 0, walkTime: 0, congestion: 0, risk: 0, minCapacity: 0, edges: [] }
  const edges = []
  let cost = 0
  let distance = 0
  let walkTime = 0
  let congestion = 0
  let risk = 0
  let minCapacity = INF
  for (let i = 0; i < path.length - 1; i++) {
    const e = graph.getEdge(path[i], path[i + 1])
    if (!e) continue
    edges.push(e)
    cost += weight(e)
    distance += e.distance
    walkTime += e.walkTime
    congestion = Math.max(congestion, e.congestion) // the worst link is what stalls the route
    risk = Math.max(risk, e.risk)
    minCapacity = Math.min(minCapacity, e.capacity)
  }
  return { cost, distance, walkTime, congestion, risk, minCapacity: minCapacity === INF ? 0 : minCapacity, edges }
}

/**
 * The safest route to the cheapest reachable exit, plus the physically shortest route to
 * compare it against. Both come from the same Dijkstra implementation with different weights,
 * which is the point: the algorithm is unchanged, only the cost model differs.
 */
export function safestRoute(graph, source, options = {}) {
  const exits = graph.nodesOfKind('exit').map((n) => n.id)
  if (!exits.length) return null
  const safeWeight = options.weight ?? ((e) => e.cost)
  const distWeight = (e) => e.distance

  const safe = dijkstra(graph, source, { ...options, weight: safeWeight, targets: exits })
  const pick = (run) =>
    exits
      .filter((id) => run.dist.has(id))
      .reduce((best, id) => (best === null || run.dist.get(id) < run.dist.get(best) ? id : best), null)

  const safeExit = pick(safe)
  if (safeExit === null) return { reachable: false, settledOrder: safe.settledOrder, stats: safe.stats }

  const short = dijkstra(graph, source, { ...options, weight: distWeight, targets: exits })
  const shortExit = pick(short)

  const safePath = shortestPath(safe.parent, safeExit)
  const shortPath = shortExit === null ? null : shortestPath(short.parent, shortExit)

  // Rank every reachable exit by safest cost so the UI can list alternatives.
  const alternatives = exits
    .filter((id) => safe.dist.has(id))
    .map((id) => {
      const path = shortestPath(safe.parent, id)
      return { id, name: graph.getNode(id).name, cost: safe.dist.get(id), ...describePath(graph, path, safeWeight), path }
    })
    .sort((a, b) => a.cost - b.cost)

  return {
    reachable: true,
    safest: { id: safeExit, name: graph.getNode(safeExit).name, path: safePath, ...describePath(graph, safePath, safeWeight) },
    shortest:
      shortPath === null
        ? null
        : {
            id: shortExit,
            name: graph.getNode(shortExit).name,
            path: shortPath,
            // Measured with the SAFE cost model, so the two routes are compared on one scale.
            ...describePath(graph, shortPath, safeWeight),
            distanceOnly: short.dist.get(shortExit),
          },
    differs: shortPath !== null && shortPath.join('>') !== safePath.join('>'),
    alternatives,
    settledOrder: safe.settledOrder,
    stats: safe.stats,
  }
}

export default dijkstra
