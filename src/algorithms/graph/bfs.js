// Breadth-first search. Visits nodes in order of hop count from the start using a FIFO queue.
// Sentinel use: "Which exits can people in the critical zone still reach?"
// Closed edges (locked gates) are skipped, so a closed exit shows up as unreachable.
//
// Time O(V + E): each node is enqueued at most once and each edge is checked once.
// Space O(V): the queue, visited set and parent map.
import { Queue } from '../dataStructures/Queue.js'
import { isOpenEdge } from './Graph.js'

export function bfs(graph, start, { canTraverse = isOpenEdge } = {}) {
  const order = []
  const hops = new Map()
  const parent = new Map()
  if (!graph.hasNode(start)) return { order, hops, parent, steps: [] }

  const queue = new Queue()
  const steps = [] // snapshot per dequeue, for the step-by-step visual
  queue.enqueue(start)
  hops.set(start, 0)
  parent.set(start, null)

  while (!queue.isEmpty()) {
    const u = queue.dequeue()
    order.push(u)
    const discovered = []
    for (const edge of graph.neighbours(u)) {
      if (!canTraverse(edge) || hops.has(edge.to)) continue
      hops.set(edge.to, hops.get(u) + 1)
      parent.set(edge.to, u)
      queue.enqueue(edge.to)
      discovered.push(edge.to)
    }
    steps.push({ node: u, hop: hops.get(u), discovered, queue: queue.items.slice(queue.head) })
  }
  return { order, hops, parent, steps }
}
