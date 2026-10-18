// Depth-first search with an explicit stack (no recursion, so a large graph cannot overflow the call stack).
// Sentinel use: "Which connected areas are affected by the dangerous zone?"
// `canEnter(node, edge)` limits the search, e.g. only into zones that are already at WATCH or above,
// so the result is the connected danger cluster around the critical zone.
//
// Time O(V + E): each node is expanded once and each of its edges is looked at once.
// Space O(V): visited set; the stack holds at most O(E) pending entries.
import { Stack } from '../dataStructures/Stack.js'
import { isOpenEdge } from './Graph.js'

export function dfs(graph, start, { canEnter = () => true, canTraverse = isOpenEdge } = {}) {
  const order = []
  const visited = new Set()
  const parent = new Map()
  const steps = []
  if (!graph.hasNode(start)) return { order, visited, parent, steps }

  const stack = new Stack()
  stack.push({ node: start, from: null })

  while (!stack.isEmpty()) {
    const { node: u, from } = stack.pop()
    if (visited.has(u)) continue
    visited.add(u)
    parent.set(u, from)
    order.push(u)
    // Push neighbours in reverse so they are expanded in their listed order.
    const next = graph.neighbours(u).filter((e) => canTraverse(e) && !visited.has(e.to) && canEnter(graph.getNode(e.to), e))
    for (let i = next.length - 1; i >= 0; i--) stack.push({ node: next[i].to, from: u })
    steps.push({ node: u, stack: stack.toArray().map((s) => s.node) })
  }
  return { order, visited, parent, steps }
}
