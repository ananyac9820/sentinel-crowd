// Minimum s-t cut from a finished max flow (max-flow min-cut theorem).
// After Edmonds-Karp stops, the nodes still reachable from the source in the residual graph form
// side S. Every original edge from S to the other side is saturated, and their capacities add up
// to exactly the maximum flow. Those edges are the evacuation bottleneck: no plan can push more
// people per minute through the station unless one of them gets more capacity.
//
// Also returned: CLOSED edges crossing the cut (capacity 0, e.g. a locked gate). Opening one adds
// capacity straight across the bottleneck, which is why the intervention engine considers it.
//
// Time O(V + E): one BFS over the residual graph plus one pass over the edges.
import { Queue } from '../dataStructures/Queue.js'

export function minCut(graph, flowResult) {
  const res = flowResult.residual
  if (!res) return { sourceSide: new Set(), cutEdges: [], closedCrossing: [], capacity: 0 }

  const s = res.index.get(flowResult.source)
  const seen = new Array(res.ids.length).fill(false)
  seen[s] = true
  const queue = new Queue()
  queue.enqueue(s)
  while (!queue.isEmpty()) {
    const u = queue.dequeue()
    for (const a of res.head[u]) {
      const v = res.to[a]
      if (!seen[v] && res.cap[a] > 0) {
        seen[v] = true
        queue.enqueue(v)
      }
    }
  }

  const sourceSide = new Set(res.ids.filter((_, i) => seen[i]))
  const crossing = graph.edges().filter((e) => sourceSide.has(e.from) && !sourceSide.has(e.to))
  const cutEdges = crossing.filter((e) => e.capacity > 0)
  const closedCrossing = crossing.filter((e) => e.capacity <= 0)
  const capacity = cutEdges.reduce((sum, e) => sum + e.capacity, 0)
  return { sourceSide, cutEdges, closedCrossing, capacity }
}
