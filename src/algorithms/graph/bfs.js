// Breadth-first search over the crowd graph.
//
// Data structure: a FIFO Queue. That single choice is what makes the search breadth-first --
// swap the queue for a stack and the same loop becomes a depth-first search.
//
// Time : O(V + E). Every node is enqueued at most once (the `seen` set guarantees it) and each
//        of its outgoing edges is examined exactly once when it is dequeued.
// Space: O(V) for the queue, the seen set and the parent map.
//
// Why BFS for Sentinel: on an unweighted view of the graph, the first time BFS reaches a node
// it has reached it by a path with the fewest edges. "Fewest edges" means fewest zone
// transitions, which is the honest answer to "how many areas must these people move through
// to get out?" -- a different and more useful question than Dijkstra's weighted cost, because
// each extra transition is an extra chance for the crowd to stall. BFS also answers
// reachability: a zone BFS never reaches has no route to any exit at all, which is an
// emergency in itself.

import Queue from '../dataStructures/Queue.js'

/**
 * @param {Graph} graph
 * @param {string} source
 * @param {object} options  { blocked?: (edge) => boolean } edges to treat as closed
 * @returns {{
 *   order: string[],              nodes in the order they were first reached
 *   hops: Map<string, number>,    edges on the fewest-edge path from source
 *   parent: Map<string, string|null>,
 *   reached: Set<string>,
 *   levels: string[][],           nodes grouped by hop count (the BFS "frontier" layers)
 *   stats: { visited, edgesExamined, maxQueueSize }
 * }}
 */
export function bfs(graph, source, { blocked } = {}) {
  const order = []
  const hops = new Map()
  const parent = new Map()
  const seen = new Set()
  const stats = { visited: 0, edgesExamined: 0, maxQueueSize: 0 }

  if (!graph?.hasNode(source)) return { order, hops, parent, reached: seen, levels: [], stats }

  const queue = new Queue()
  queue.enqueue(source)
  seen.add(source)
  hops.set(source, 0)
  parent.set(source, null)

  while (!queue.isEmpty()) {
    stats.maxQueueSize = Math.max(stats.maxQueueSize, queue.size)
    const u = queue.dequeue()
    order.push(u)
    stats.visited++
    for (const edge of graph.neighbours(u)) {
      stats.edgesExamined++
      if (blocked?.(edge)) continue
      if (seen.has(edge.to)) continue // already reached by an equal-or-shorter path
      seen.add(edge.to)
      hops.set(edge.to, hops.get(u) + 1)
      parent.set(edge.to, u)
      queue.enqueue(edge.to)
    }
  }

  const depth = Math.max(0, ...hops.values())
  const levels = Array.from({ length: depth + 1 }, () => [])
  for (const [id, h] of hops) levels[h].push(id)

  return { order, hops, parent, reached: seen, levels, stats }
}

/** Walks the parent map back from `target` to rebuild the fewest-edge path. O(path length). */
export function bfsPath(parent, target) {
  if (!parent.has(target)) return null
  const path = []
  for (let at = target; at != null; at = parent.get(at)) path.unshift(at)
  return path
}

/**
 * Which exits a zone can actually reach, and how many zone transitions away each one is.
 * Sorted by hop count, nearest first.
 */
export function reachableExits(graph, source, options) {
  const { hops, parent, stats, order } = bfs(graph, source, options)
  const exits = graph
    .nodesOfKind('exit')
    .filter((n) => hops.has(n.id))
    .map((n) => ({ id: n.id, name: n.name, hops: hops.get(n.id), path: bfsPath(parent, n.id) }))
    .sort((a, b) => a.hops - b.hops)
  const unreachable = graph.nodesOfKind('exit').filter((n) => !hops.has(n.id)).map((n) => n.name)
  return { exits, unreachable, visitedOrder: order, stats }
}

export default bfs
