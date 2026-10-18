// Dijkstra's shortest path with a binary min-heap (lazy deletion: stale heap entries are skipped).
// Sentinel use: the safest evacuation route. Edge weights are crowd-aware costs, which are never
// negative, so Dijkstra's greedy "settle the closest node" rule is correct.
//
// Time O((V + E) log V): every edge relaxation may push one heap entry (O(log E) = O(log V) since E <= V^2),
// and every node is settled once. Space O(V + E): distances, parents and up to E heap entries.
import { MinHeap } from '../dataStructures/MinHeap.js'
import { isOpenEdge } from './Graph.js'

export function dijkstra(graph, source, { target = null, weight = (e) => e.cost, canTraverse = isOpenEdge } = {}) {
  const dist = new Map()
  const prev = new Map() // node -> edge used to reach it
  const settled = []
  const steps = []
  if (!graph.hasNode(source)) return { dist, prev, settled, steps, path: [], edges: [], total: Infinity }

  for (const id of graph.nodeIds()) dist.set(id, Infinity)
  dist.set(source, 0)
  const heap = new MinHeap()
  heap.push(source, 0)
  const done = new Set()

  while (!heap.isEmpty()) {
    const { value: u, priority: d } = heap.pop()
    if (done.has(u)) continue // stale entry: u was already settled with a smaller distance
    done.add(u)
    settled.push({ node: u, dist: d })
    const relaxed = []
    for (const edge of graph.neighbours(u)) {
      if (!canTraverse(edge)) continue
      const w = weight(edge)
      if (w < 0) throw new Error(`Dijkstra needs non-negative weights; edge ${edge.id} has ${w}`)
      const nd = d + w
      if (nd < dist.get(edge.to)) {
        dist.set(edge.to, nd)
        prev.set(edge.to, edge)
        heap.push(edge.to, nd)
        relaxed.push({ to: edge.to, dist: nd })
      }
    }
    steps.push({ node: u, dist: d, relaxed })
    if (u === target) break // the target's distance is final once it is settled
  }

  const { path, edges } = target === null ? { path: [], edges: [] } : pathTo(prev, source, target)
  return { dist, prev, settled, steps, path, edges, total: target === null ? null : dist.get(target) ?? Infinity }
}

// Walk the parent edges back from target to source.
export function pathTo(prev, source, target) {
  if (source === target) return { path: [source], edges: [] }
  if (!prev.has(target)) return { path: [], edges: [] }
  const edges = []
  let node = target
  while (node !== source) {
    const e = prev.get(node)
    edges.push(e)
    node = e.from
  }
  edges.reverse()
  return { path: [source, ...edges.map((e) => e.to)], edges }
}
