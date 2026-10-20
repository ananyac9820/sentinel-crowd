// Edmonds-Karp maximum flow: Ford-Fulkerson with BFS choosing the augmenting path.
//
// THE IDEA: repeatedly find any path from source to sink along which every edge still has
// spare (residual) capacity, push as much flow as its tightest edge allows, and repeat until
// no such path exists. When none exists, the flow is maximum -- that is the max-flow min-cut
// theorem, and the proof is constructive: the nodes still reachable from S in the residual
// network form one side of a cut whose capacity equals the flow.
//
// WHY BFS FOR THE PATH (Edmonds-Karp) rather than any path (plain Ford-Fulkerson):
//   * BFS takes a path with the fewest edges. That shortest-augmenting-path rule can be shown
//     to make the distance from S to T non-decreasing, which bounds the number of
//     augmentations at O(VE) regardless of the capacity values.
//   * Plain Ford-Fulkerson with an unlucky DFS order can augment once per unit of capacity. On
//     irrational capacities it need not even terminate. Sentinel's capacities are
//     people/minute and can be large, so this matters in practice, not just in theory.
//
// Time : O(V * E^2). O(VE) augmentations, each costing one O(E) BFS.
// Space: O(V + E) for the residual network.
//
// Sentinel reads the result as the station's evacuation throughput in people per minute, and
// the min cut (minCut.js) as the set of links that physically limits it.

import Queue from '../dataStructures/Queue.js'

/**
 * @param {FlowNetwork} network
 * @param {string} sourceId
 * @param {string} sinkId
 * @param {object} options { recordPaths?: boolean } keep each augmenting path for the UI
 * @returns {{ maxFlow: number, augmentingPaths: Array, stats: object }}
 */
export function edmondsKarp(network, sourceId, sinkId, { recordPaths = true, maxAugmentations = 10000 } = {}) {
  const stats = { augmentations: 0, bfsRuns: 0, edgesExamined: 0, nodesVisited: 0 }
  const augmentingPaths = []
  if (!network || !network.index.has(sourceId) || !network.index.has(sinkId)) return { maxFlow: 0, augmentingPaths, stats }

  const s = network.node(sourceId)
  const t = network.node(sinkId)
  if (s === t) return { maxFlow: 0, augmentingPaths, stats }

  let maxFlow = 0
  for (;;) {
    // ---- BFS over edges with spare capacity, recording the edge used to reach each node ----
    stats.bfsRuns++
    const cameBy = new Array(network.size).fill(null)
    const seen = new Array(network.size).fill(false)
    const queue = new Queue()
    queue.enqueue(s)
    seen[s] = true
    while (!queue.isEmpty() && !seen[t]) {
      const u = queue.dequeue()
      stats.nodesVisited++
      for (const edge of network.graph[u]) {
        stats.edgesExamined++
        if (seen[edge.to] || network.residual(edge) <= 0) continue
        seen[edge.to] = true
        cameBy[edge.to] = edge
        queue.enqueue(edge.to)
      }
    }
    if (!seen[t]) break // no augmenting path left: the flow is maximum

    // ---- Bottleneck of this path = the smallest residual capacity along it ----
    let bottleneck = Infinity
    let limitedBy = null
    for (let v = t; v !== s; v = cameBy[v].from) {
      const spare = network.residual(cameBy[v])
      if (spare < bottleneck) {
        bottleneck = spare
        limitedBy = cameBy[v] // the link that caps this path: the first thing staff would widen
      }
    }

    // ---- Push that much, updating partners so the flow can be undone later ----
    const nodes = [network.names[t]]
    const edges = []
    for (let v = t; v !== s; v = cameBy[v].from) {
      const edge = cameBy[v]
      network.push(edge, bottleneck)
      edges.unshift(edge)
      nodes.unshift(network.names[edge.from])
    }
    maxFlow += bottleneck
    stats.augmentations++
    if (recordPaths)
      augmentingPaths.push({
        step: stats.augmentations,
        nodes,
        pushed: bottleneck,
        totalAfter: maxFlow,
        hops: edges.length,
        limitedBy: limitedBy?.label ?? null,
      })
    if (stats.augmentations >= maxAugmentations) break // safety valve; never reached on real sizes
  }

  return { maxFlow, augmentingPaths, stats }
}

export default edmondsKarp
