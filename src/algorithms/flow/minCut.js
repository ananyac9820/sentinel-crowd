// Minimum cut, read straight off a maximum flow.
//
// MAX-FLOW MIN-CUT THEOREM: the value of a maximum S-T flow equals the capacity of a minimum
// S-T cut. The proof also tells you how to FIND that cut, which is what makes this useful:
//
//   1. Run max flow until no augmenting path remains.
//   2. BFS from S in the residual network. Let A be the set it reaches, B the rest.
//      T is not in A -- if it were, there would still be an augmenting path.
//   3. The cut edges are the original edges that go from A to B. Every one of them must be
//      saturated (flow == capacity), or BFS would have crossed it; and every edge from B back
//      into A must carry zero flow, or its reverse edge would have let BFS cross. So the total
//      capacity of those A->B edges equals the flow.
//
// WHAT IT MEANS FOR SENTINEL: the cut is the set of links that is physically limiting
// evacuation. Not merely "the most congested corridor" -- a congested corridor with a parallel
// alternative is not a bottleneck at all, because flow reroutes around it. The cut is the
// smallest set of links whose combined capacity the whole site is stuck behind, so widening
// anything NOT in the cut cannot increase throughput. That is a much stronger statement than
// a density ranking can make, and it is why "open an alternative staircase" is a conclusion
// rather than a guess.
//
// Time : O(V + E) on top of the flow (one BFS).
// Space: O(V).

import Queue from '../dataStructures/Queue.js'

const TOLERANCE = 1e-9

/**
 * @param {FlowNetwork} network  a network whose flow is already maximum
 * @param {string} sourceId
 * @returns {{ sourceSide, sinkSide, cutEdges, capacity, stats }}
 */
export function minCut(network, sourceId) {
  const stats = { visited: 0, edgesExamined: 0 }
  if (!network || !network.index.has(sourceId)) return { sourceSide: [], sinkSide: [], cutEdges: [], capacity: 0, stats }

  const s = network.node(sourceId)
  const reached = new Array(network.size).fill(false)
  const queue = new Queue()
  queue.enqueue(s)
  reached[s] = true

  // Step 2: residual reachability. An edge is crossable if it still has spare capacity --
  // which includes reverse edges carrying undoable flow.
  while (!queue.isEmpty()) {
    const u = queue.dequeue()
    stats.visited++
    for (const edge of network.graph[u]) {
      stats.edgesExamined++
      if (reached[edge.to] || network.residual(edge) <= TOLERANCE) continue
      reached[edge.to] = true
      queue.enqueue(edge.to)
    }
  }

  // Step 3: forward edges crossing from the source side to the sink side.
  const cutEdges = network.edgeList
    .filter((e) => reached[e.from] && !reached[e.to] && e.capacity > TOLERANCE)
    .map((e) => ({
      from: network.names[e.from],
      to: network.names[e.to],
      capacity: e.capacity,
      flow: e.flow,
      saturated: Math.abs(e.capacity - e.flow) <= Math.max(TOLERANCE, e.capacity * 1e-6),
      label: e.label,
    }))

  return {
    sourceSide: network.names.filter((_, i) => reached[i]),
    sinkSide: network.names.filter((_, i) => !reached[i]),
    cutEdges,
    capacity: cutEdges.reduce((a, e) => a + e.capacity, 0),
    stats,
  }
}

/**
 * The cut turned into a ranked bottleneck report. Unbounded book-keeping edges (the super
 * source's) are dropped, because "the crowd exists" is not something staff can widen.
 */
export function bottlenecks(cut) {
  return cut.cutEdges
    .filter((e) => !e.label?.unbounded)
    .map((e) => ({
      id: `${e.from}->${e.to}`,
      from: e.from,
      to: e.to,
      capacity: Math.round(e.capacity),
      label: e.label?.text ?? `${e.from} to ${e.to}`,
      kind: e.label?.kind ?? 'link',
      zoneId: e.label?.zoneId ?? null,
    }))
    .sort((a, b) => a.capacity - b.capacity) // tightest link first
}

export default minCut
