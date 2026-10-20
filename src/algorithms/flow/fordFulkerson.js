// Ford-Fulkerson with a DFS search for augmenting paths: the same method as Edmonds-Karp but
// without the shortest-path rule. Kept so the Algorithm Lab can run both on the same station
// network and show that they agree on the maximum flow while differing in how many
// augmentations they need.
//
// Time : O(E * maxFlow) with integer capacities -- each augmentation pushes at least one unit,
//        so the count depends on the CAPACITY VALUES, not just on the graph size. That is the
//        weakness Edmonds-Karp fixes: on the classic "two fat parallel paths joined by a thin
//        cross link" graph, a bad DFS order augments one unit at a time.
// Space: O(V + E), plus O(V) recursion depth.
//
// Both are correct, because correctness comes from the residual-network argument, not from how
// the path is chosen. Only the running time differs.

/**
 * @param {FlowNetwork} network
 * @returns {{ maxFlow: number, augmentingPaths: Array, stats: object }}
 */
export function fordFulkerson(network, sourceId, sinkId, { recordPaths = true, maxAugmentations = 20000 } = {}) {
  const stats = { augmentations: 0, dfsRuns: 0, edgesExamined: 0 }
  const augmentingPaths = []
  if (!network || !network.index.has(sourceId) || !network.index.has(sinkId)) return { maxFlow: 0, augmentingPaths, stats }

  const s = network.node(sourceId)
  const t = network.node(sinkId)
  let maxFlow = 0

  // Depth-first search for any path with spare capacity; returns how much it managed to push.
  const findPath = (u, pushed, visited) => {
    if (u === t) return pushed
    visited[u] = true
    for (const edge of network.graph[u]) {
      stats.edgesExamined++
      if (visited[edge.to] || network.residual(edge) <= 0) continue
      const got = findPath(edge.to, Math.min(pushed, network.residual(edge)), visited)
      if (got > 0) {
        // The push happens as the recursion unwinds, so every edge on the path is updated once.
        network.push(edge, got)
        return got
      }
    }
    return 0
  }

  for (;;) {
    stats.dfsRuns++
    const visited = new Array(network.size).fill(false)
    const before = maxFlow
    const got = findPath(s, Infinity, visited)
    if (got <= 0) break
    maxFlow += got
    stats.augmentations++
    if (recordPaths) augmentingPaths.push({ step: stats.augmentations, pushed: got, totalAfter: maxFlow, from: before })
    if (stats.augmentations >= maxAugmentations) break
  }

  return { maxFlow, augmentingPaths, stats }
}

export default fordFulkerson
