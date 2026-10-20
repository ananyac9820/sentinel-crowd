// Depth-first search over the crowd graph.
//
// Data structure: an explicit Stack (LIFO). Recursion would be shorter to write but the depth
// would be bounded by the JavaScript call stack; an explicit stack keeps it bounded by heap.
//
// Time : O(V + E), same accounting as BFS: each node pushed once, each edge examined once.
// Space: O(V).
//
// Why DFS for Sentinel, when BFS already explores the same nodes: DFS is the right tool when
// the question is about CONNECTEDNESS rather than distance.
//   1. dangerRegions() -- a crush does not stay inside one zone. Several adjacent congested
//      zones form one dangerous region that has to be treated as a single body of people.
//      Finding those regions is exactly "find the connected components of the subgraph induced
//      by the congested zones", which is the textbook DFS application.
//   2. disconnectsExits() -- "if we close this corridor, does any zone lose every route out?"
//      Closing an edge and re-running reachability from each zone answers it. An edge whose
//      removal strands a zone is a bridge in the reachability sense, and no intervention is
//      allowed to create one.

import Stack from '../dataStructures/Stack.js'

/**
 * @param {Graph} graph
 * @param {string} source
 * @param {object} options { allowed?: (nodeId) => boolean, blocked?: (edge) => boolean }
 * @returns {{ order: string[], parent: Map, reached: Set<string>, stats: object }}
 */
export function dfs(graph, source, { allowed, blocked } = {}) {
  const order = []
  const parent = new Map()
  const visited = new Set()
  const stats = { visited: 0, edgesExamined: 0, maxStackSize: 0 }

  if (!graph?.hasNode(source) || (allowed && !allowed(source))) return { order, parent, reached: visited, stats }

  const stack = new Stack()
  stack.push({ id: source, from: null })

  while (!stack.isEmpty()) {
    stats.maxStackSize = Math.max(stats.maxStackSize, stack.size)
    const { id: u, from } = stack.pop()
    // A node can be pushed more than once before it is popped, so the visited check happens
    // here rather than at push time. This is the standard iterative-DFS detail.
    if (visited.has(u)) continue
    visited.add(u)
    parent.set(u, from)
    order.push(u)
    stats.visited++
    const out = graph.neighbours(u)
    // Pushed in reverse so the first neighbour is explored first, matching recursive DFS order.
    for (let i = out.length - 1; i >= 0; i--) {
      const edge = out[i]
      stats.edgesExamined++
      if (blocked?.(edge)) continue
      if (allowed && !allowed(edge.to)) continue
      if (!visited.has(edge.to)) stack.push({ id: edge.to, from: u })
    }
  }

  return { order, parent, reached: visited, stats }
}

/**
 * Connected components of the subgraph of nodes satisfying `isDangerous`.
 * Each component is one contiguous body of congested crowd.
 * Time O(V + E): the outer loop skips nodes an earlier DFS already claimed.
 */
export function dangerRegions(graph, isDangerous) {
  const seen = new Set()
  const regions = []
  const stats = { visited: 0, edgesExamined: 0, components: 0 }

  for (const node of graph.nodeList()) {
    if (seen.has(node.id) || !isDangerous(node)) continue
    const run = dfs(graph, node.id, { allowed: (id) => isDangerous(graph.getNode(id)) })
    run.reached.forEach((id) => seen.add(id))
    stats.visited += run.stats.visited
    stats.edgesExamined += run.stats.edgesExamined
    stats.components++
    const members = run.order.map((id) => graph.getNode(id))
    regions.push({
      nodes: run.order,
      names: members.map((n) => n.name),
      order: run.order,
      people: members.reduce((a, n) => a + (n.people ?? 0), 0),
      worstLevel: Math.max(0, ...members.map((n) => n.level ?? 0)),
    })
  }
  // Biggest body of people first: that is the one that has to be solved.
  regions.sort((a, b) => b.people - a.people)
  return { regions, stats }
}

/**
 * Would closing these edges strand any zone (leave it with no route to any exit)?
 * Runs one DFS per zone on the reduced graph, so O(V * (V + E)).
 */
export function disconnectsExits(graph, closeEdge) {
  const reduced = graph.withoutEdges(closeEdge)
  const exitIds = new Set(reduced.nodesOfKind('exit').map((n) => n.id))
  const stranded = []
  for (const node of reduced.nodesOfKind('zone')) {
    const { reached } = dfs(reduced, node.id)
    if (![...reached].some((id) => exitIds.has(id))) stranded.push(node.name)
  }
  return { safe: stranded.length === 0, stranded }
}

export default dfs
