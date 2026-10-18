// Edmonds-Karp maximum flow: Ford-Fulkerson where each augmenting path is the SHORTEST one
// (fewest edges), found with BFS on the residual graph.
// Sentinel use: edge capacity = people per minute that can safely pass a connection, so the
// maximum flow from the crowd to the safe area is the station's evacuation capacity (people/min).
//
// Residual graph: every edge u->v with capacity c becomes a forward arc (residual c - flow)
// and a paired reverse arc v->u (residual = flow), which lets later paths undo earlier choices.
// Arcs are stored in flat arrays; arc i and arc i^1 are always a forward/reverse pair.
//
// Time O(V * E^2): BFS is O(E) and Edmonds-Karp needs at most O(V * E) augmentations.
// Space O(V + E): the residual graph.
import { Queue } from '../dataStructures/Queue.js'

export function buildResidual(graph, capacityOf = (e) => e.capacity) {
  const ids = graph.nodeIds()
  const index = new Map(ids.map((id, i) => [id, i]))
  const res = { ids, index, head: ids.map(() => []), to: [], cap: [], edgeOf: [] }
  for (const e of graph.edges()) {
    const c = Math.max(0, capacityOf(e))
    const u = index.get(e.from)
    const v = index.get(e.to)
    // forward arc
    res.head[u].push(res.to.length)
    res.to.push(v)
    res.cap.push(c)
    res.edgeOf.push(e)
    // reverse arc, starts with zero residual capacity
    res.head[v].push(res.to.length)
    res.to.push(u)
    res.cap.push(0)
    res.edgeOf.push(null)
  }
  return res
}

export function maxFlow(graph, source, sink, { capacityOf } = {}) {
  const empty = { maxFlow: 0, augmentingPaths: [], edgeFlow: new Map(), residual: null, source, sink }
  if (!graph.hasNode(source) || !graph.hasNode(sink) || source === sink) return empty

  const res = buildResidual(graph, capacityOf)
  const s = res.index.get(source)
  const t = res.index.get(sink)
  const augmentingPaths = []
  let total = 0

  while (true) {
    // BFS for the shortest path with spare residual capacity.
    const parentArc = new Array(res.ids.length).fill(-1)
    const seen = new Array(res.ids.length).fill(false)
    seen[s] = true
    const queue = new Queue()
    queue.enqueue(s)
    while (!queue.isEmpty() && !seen[t]) {
      const u = queue.dequeue()
      for (const a of res.head[u]) {
        const v = res.to[a]
        if (!seen[v] && res.cap[a] > 0) {
          seen[v] = true
          parentArc[v] = a
          queue.enqueue(v)
        }
      }
    }
    if (!seen[t]) break // no augmenting path left: the flow is maximum

    // Bottleneck = smallest residual capacity along the path.
    let bottleneck = Infinity
    const arcs = []
    for (let v = t; v !== s; v = res.to[parentArc[v] ^ 1]) {
      arcs.push(parentArc[v])
      bottleneck = Math.min(bottleneck, res.cap[parentArc[v]])
    }
    if (bottleneck === Infinity) throw new Error('Unbounded flow: a source-to-sink path has no finite capacity')
    arcs.reverse()
    for (const a of arcs) {
      res.cap[a] -= bottleneck
      res.cap[a ^ 1] += bottleneck
    }
    total += bottleneck
    augmentingPaths.push({ path: [source, ...arcs.map((a) => res.ids[res.to[a]])], bottleneck, total })
  }

  // Flow on each original edge = residual capacity of its reverse arc (it started at 0 and grew
  // by exactly the flow pushed forward). This also works for edges with infinite capacity.
  const edgeFlow = new Map()
  for (let a = 0; a < res.to.length; a += 2) edgeFlow.set(res.edgeOf[a].id, res.cap[a + 1])
  return { maxFlow: total, augmentingPaths, edgeFlow, residual: res, source, sink }
}
