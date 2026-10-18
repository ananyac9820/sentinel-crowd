// Unit tests for the DAA algorithms. Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Queue } from '../src/algorithms/dataStructures/Queue.js'
import { Stack } from '../src/algorithms/dataStructures/Stack.js'
import { MinHeap } from '../src/algorithms/dataStructures/MinHeap.js'
import { Graph } from '../src/algorithms/graph/Graph.js'
import { bfs } from '../src/algorithms/graph/bfs.js'
import { dfs } from '../src/algorithms/graph/dfs.js'
import { dijkstra } from '../src/algorithms/graph/dijkstra.js'
import { maxFlow } from '../src/algorithms/flow/maxFlow.js'
import { minCut } from '../src/algorithms/flow/minCut.js'
import { greedySelect } from '../src/algorithms/optimization/greedyIntervention.js'
import { backtrackBest } from '../src/algorithms/optimization/backtrackingPlanner.js'
import { mergeSort } from '../src/algorithms/sorting/mergeSort.js'
import { binarySearch, findBand } from '../src/algorithms/searching/binarySearch.js'

// Small helper: build a graph from [from, to, attrs] triples.
function graphOf(edges, extraNodes = []) {
  const g = new Graph()
  extraNodes.forEach((id) => g.addNode(id))
  for (const [a, b, attrs = {}] of edges) g.addEdge(a, b, { cost: 1, capacity: 1, ...attrs })
  return g
}

// ---------- Data structures ----------
test('Queue is FIFO and handles empty dequeue', () => {
  const q = new Queue()
  assert.equal(q.dequeue(), undefined)
  for (let i = 0; i < 200; i++) q.enqueue(i)
  for (let i = 0; i < 200; i++) assert.equal(q.dequeue(), i)
  assert.ok(q.isEmpty())
})

test('Stack is LIFO', () => {
  const s = new Stack()
  s.push(1)
  s.push(2)
  assert.equal(s.pop(), 2)
  assert.equal(s.pop(), 1)
  assert.equal(s.pop(), undefined)
})

test('MinHeap pops in priority order', () => {
  const h = new MinHeap()
  ;[5, 1, 9, 3, 7, 2, 8].forEach((p) => h.push(`v${p}`, p))
  const out = []
  while (!h.isEmpty()) out.push(h.pop().priority)
  assert.deepEqual(out, [1, 2, 3, 5, 7, 8, 9])
  assert.equal(h.pop(), undefined)
})

// ---------- Merge sort ----------
test('mergeSort sorts numbers and does not change the input', () => {
  const input = [43, 81, 62, 95, 10, 62]
  assert.deepEqual(mergeSort(input), [10, 43, 62, 62, 81, 95])
  assert.deepEqual(input, [43, 81, 62, 95, 10, 62])
})

test('mergeSort: empty, single item, descending comparator', () => {
  assert.deepEqual(mergeSort([]), [])
  assert.deepEqual(mergeSort([7]), [7])
  assert.deepEqual(mergeSort([1, 3, 2], (a, b) => b - a), [3, 2, 1])
})

test('mergeSort is stable (ties keep their original order)', () => {
  const zones = [
    { id: 'Z1', risk: 50 },
    { id: 'Z2', risk: 80 },
    { id: 'Z3', risk: 50 },
    { id: 'Z4', risk: 80 },
  ]
  assert.deepEqual(mergeSort(zones, (a, b) => b.risk - a.risk).map((z) => z.id), ['Z2', 'Z4', 'Z1', 'Z3'])
})

test('mergeSort matches a reference sort on many random arrays', () => {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let n = 0; n < 60; n++) {
    const arr = Array.from({ length: n }, () => Math.floor(rnd() * 100))
    assert.deepEqual(mergeSort(arr), [...arr].sort((a, b) => a - b))
  }
})

test('mergeSort trace records divide and merge steps', () => {
  const trace = []
  mergeSort([4, 3, 2, 1], (a, b) => a - b, trace)
  assert.equal(trace.filter((t) => t.type === 'merge').length, 3) // n - 1 merges
  assert.deepEqual(trace.at(-1).merged, [1, 2, 3, 4])
})

// ---------- Binary search ----------
test('binarySearch finds present items and returns -1 for missing ones', () => {
  const a = [2, 5, 8, 13, 21, 34]
  a.forEach((v, i) => assert.equal(binarySearch(a, v), i))
  assert.equal(binarySearch(a, 9), -1)
  assert.equal(binarySearch([], 1), -1)
  assert.equal(binarySearch([4], 4), 0)
})

test('findBand returns the risk band for a value', () => {
  const bands = [
    { min: 0, label: 'SAFE' },
    { min: 8, label: 'WATCH' },
    { min: 13, label: 'WARNING' },
    { min: 18, label: 'CRITICAL' },
  ]
  assert.equal(findBand(bands, 0).band.label, 'SAFE')
  assert.equal(findBand(bands, 7).band.label, 'SAFE')
  assert.equal(findBand(bands, 8).band.label, 'WATCH')
  assert.equal(findBand(bands, 17).band.label, 'WARNING')
  assert.equal(findBand(bands, 99).band.label, 'CRITICAL')
  assert.equal(findBand(bands, -1).band, null)
  assert.equal(findBand([], 5).band, null)
  assert.ok(findBand(bands, 15).probes.length <= Math.ceil(Math.log2(bands.length)) + 1)
})

// ---------- BFS ----------
test('BFS visits in hop order and records hop counts', () => {
  const g = graphOf([['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E']])
  const r = bfs(g, 'A')
  assert.deepEqual(r.order, ['A', 'B', 'C', 'D', 'E'])
  assert.equal(r.hops.get('E'), 3)
})

test('BFS: single node, missing start, disconnected and closed edges', () => {
  assert.deepEqual(bfs(graphOf([], ['A']), 'A').order, ['A'])
  assert.deepEqual(bfs(graphOf([], ['A']), 'Z').order, [])
  const g = graphOf([['A', 'B'], ['B', 'Gate', { capacity: 0 }], ['X', 'Y']])
  const r = bfs(g, 'A')
  assert.deepEqual(r.order, ['A', 'B'])
  assert.equal(r.hops.has('Gate'), false) // closed gate is unreachable
  assert.equal(r.hops.has('Y'), false) // other component
})

// ---------- DFS ----------
test('DFS goes deep first', () => {
  const g = graphOf([['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'E']])
  assert.deepEqual(dfs(g, 'A').order, ['A', 'B', 'D', 'C', 'E'])
})

test('DFS respects canEnter (only dangerous zones) and handles cycles', () => {
  const g = new Graph()
  ;[['A', 3], ['B', 2], ['C', 0], ['D', 1]].forEach(([id, level]) => g.addNode(id, { level }))
  for (const [a, b] of [['A', 'B'], ['B', 'A'], ['A', 'C'], ['C', 'D'], ['B', 'D'], ['D', 'B']]) g.addEdge(a, b, { capacity: 1 })
  const r = dfs(g, 'A', { canEnter: (n) => n.level >= 1 })
  assert.deepEqual(r.order, ['A', 'B', 'D'])
  assert.equal(r.visited.has('C'), false)
})

test('DFS: missing start and single node', () => {
  assert.deepEqual(dfs(new Graph(), 'A').order, [])
  assert.deepEqual(dfs(graphOf([], ['A']), 'A').order, ['A'])
})

// ---------- Dijkstra ----------
test('Dijkstra picks the cheaper route, not the one with fewer hops', () => {
  const g = graphOf([
    ['Z4', 'Gate', { cost: 10 }],
    ['Z4', 'Corridor', { cost: 2 }],
    ['Corridor', 'Gate', { cost: 3 }],
  ])
  const r = dijkstra(g, 'Z4', { target: 'Gate' })
  assert.deepEqual(r.path, ['Z4', 'Corridor', 'Gate'])
  assert.equal(r.total, 5)
})

test('Dijkstra with a different weight gives the shortest-distance route', () => {
  const g = graphOf([
    ['Z', 'Stairs', { cost: 50, distance: 5 }],
    ['Stairs', 'Exit', { cost: 50, distance: 5 }],
    ['Z', 'Gate', { cost: 10, distance: 30 }],
    ['Gate', 'Exit', { cost: 10, distance: 30 }],
  ])
  assert.deepEqual(dijkstra(g, 'Z', { target: 'Exit' }).path, ['Z', 'Gate', 'Exit'])
  assert.deepEqual(dijkstra(g, 'Z', { target: 'Exit', weight: (e) => e.distance }).path, ['Z', 'Stairs', 'Exit'])
})

test('Dijkstra: unreachable target, closed edge, single node, missing source', () => {
  const g = graphOf([['A', 'B', { cost: 1 }], ['B', 'C', { cost: 1, capacity: 0 }]], ['D'])
  const r = dijkstra(g, 'A', { target: 'C' })
  assert.deepEqual(r.path, [])
  assert.equal(r.total, Infinity)
  assert.equal(dijkstra(g, 'A', { target: 'D' }).total, Infinity)
  assert.deepEqual(dijkstra(g, 'A', { target: 'A' }).path, ['A'])
  assert.deepEqual(dijkstra(g, 'Nope', { target: 'A' }).path, [])
})

test('Dijkstra rejects negative weights', () => {
  const g = graphOf([['A', 'B', { cost: -1 }]])
  assert.throws(() => dijkstra(g, 'A', { target: 'B' }))
})

test('Dijkstra agrees with brute force on random graphs', () => {
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let trial = 0; trial < 30; trial++) {
    const n = 7
    const g = new Graph()
    for (let i = 0; i < n; i++) g.addNode(i)
    const w = Array.from({ length: n }, () => Array(n).fill(Infinity))
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (i !== j && rnd() < 0.35) {
          const c = Math.floor(rnd() * 20)
          g.addEdge(i, j, { cost: c, capacity: 1 })
          w[i][j] = c
        }
    // Floyd-Warshall as the reference answer.
    const d = w.map((row, i) => row.map((v, j) => (i === j ? 0 : v)))
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) d[i][j] = Math.min(d[i][j], d[i][k] + d[k][j])
    const r = dijkstra(g, 0)
    for (let j = 0; j < n; j++) assert.equal(r.dist.get(j), d[0][j])
  }
})

// ---------- Max flow / min cut ----------
test('Edmonds-Karp on the textbook CLRS network gives 23', () => {
  const g = graphOf([
    ['s', 'v1', { capacity: 16 }],
    ['s', 'v2', { capacity: 13 }],
    ['v2', 'v1', { capacity: 4 }],
    ['v1', 'v3', { capacity: 12 }],
    ['v3', 'v2', { capacity: 9 }],
    ['v2', 'v4', { capacity: 14 }],
    ['v4', 'v3', { capacity: 7 }],
    ['v3', 't', { capacity: 20 }],
    ['v4', 't', { capacity: 4 }],
  ])
  const flow = maxFlow(g, 's', 't')
  assert.equal(flow.maxFlow, 23)
  const cut = minCut(g, flow)
  assert.equal(cut.capacity, 23) // max-flow min-cut theorem
})

test('Max flow: multiple exits add up, bottleneck corridor limits them', () => {
  const g = graphOf([
    ['crowd', 'corridor', { capacity: 25 }],
    ['corridor', 'gateA', { capacity: 40 }],
    ['corridor', 'gateB', { capacity: 40 }],
    ['crowd', 'stairs', { capacity: 30 }],
    ['gateA', 'safe', { capacity: Infinity }],
    ['gateB', 'safe', { capacity: Infinity }],
    ['stairs', 'safe', { capacity: 30 }],
  ])
  const flow = maxFlow(g, 'crowd', 'safe')
  assert.equal(flow.maxFlow, 55)
  const cut = minCut(g, flow)
  assert.deepEqual(cut.cutEdges.map((e) => e.id).sort(), ['crowd->corridor', 'crowd->stairs'].sort())
  // Flow conservation at the corridor.
  assert.equal(flow.edgeFlow.get('corridor->gateA') + flow.edgeFlow.get('corridor->gateB'), flow.edgeFlow.get('crowd->corridor'))
})

test('Max flow: zero-capacity edge carries nothing and is reported as a closed crossing', () => {
  const g = graphOf([
    ['s', 'a', { capacity: Infinity }],
    ['a', 'gate', { capacity: 0 }],
    ['a', 'b', { capacity: 10 }],
    ['gate', 't', { capacity: Infinity }],
    ['b', 't', { capacity: 10 }],
  ])
  const flow = maxFlow(g, 's', 't')
  assert.equal(flow.maxFlow, 10)
  assert.equal(flow.edgeFlow.get('a->gate'), 0)
  const cut = minCut(g, flow)
  assert.deepEqual(cut.closedCrossing.map((e) => e.id), ['a->gate'])
})

test('Max flow: disconnected, same node, missing nodes, single node', () => {
  const g = graphOf([['s', 'a', { capacity: 5 }]], ['t'])
  assert.equal(maxFlow(g, 's', 't').maxFlow, 0)
  assert.equal(maxFlow(g, 's', 's').maxFlow, 0)
  assert.equal(maxFlow(g, 's', 'nope').maxFlow, 0)
  assert.equal(maxFlow(graphOf([], ['s']), 's', 's').maxFlow, 0)
})

test('Max flow uses reverse (residual) edges to fix a bad first path', () => {
  // The first BFS path s-a-b-t blocks a-t and s-b; the reverse edge b->a lets the algorithm undo it.
  const g = graphOf([
    ['s', 'a', { capacity: 1 }],
    ['s', 'b', { capacity: 1 }],
    ['a', 'b', { capacity: 1 }],
    ['a', 't', { capacity: 1 }],
    ['b', 't', { capacity: 1 }],
  ])
  assert.equal(maxFlow(g, 's', 't').maxFlow, 2)
})

test('Max flow throws on an all-infinite path instead of looping forever', () => {
  const g = graphOf([['s', 't', { capacity: Infinity }]])
  assert.throws(() => maxFlow(g, 's', 't'))
})

// ---------- Greedy and backtracking ----------
// Toy objective: evacuation time = 100 / (base capacity + sum of chosen capacity gains).
const actions = [
  { id: 'openGateB', cost: 2, gain: 40 },
  { id: 'redirectZ4', cost: 1, gain: 15 },
  { id: 'emergencyExit', cost: 4, gain: 50 },
]
const evacTime = (chosen) => 100 / (50 + chosen.reduce((s, c) => s + c.gain, 0))

test('Greedy picks by best benefit / cost each step', () => {
  const r = greedySelect({ candidates: actions, objective: evacTime })
  assert.deepEqual(r.selected.map((c) => c.id), ['redirectZ4', 'openGateB', 'emergencyExit'])
  assert.ok(r.final < r.initial)
})

test('Greedy respects the budget and the goal', () => {
  const r = greedySelect({ candidates: actions, objective: evacTime, budget: 3 })
  assert.deepEqual(r.selected.map((c) => c.id), ['redirectZ4', 'openGateB'])
  assert.ok(r.spent <= 3)
  const g = greedySelect({ candidates: actions, objective: evacTime, isGoodEnough: (v) => v < 1.6 })
  assert.equal(g.selected.length, 1)
  assert.equal(g.stopReason, 'Goal reached')
})

test('Greedy: empty candidate list and useless candidates', () => {
  assert.deepEqual(greedySelect({ candidates: [], objective: evacTime }).selected, [])
  const useless = [{ id: 'x', cost: 1, gain: 0 }]
  assert.deepEqual(greedySelect({ candidates: useless, objective: evacTime }).selected, [])
})

test('Greedy is not always optimal; backtracking finds the true best', () => {
  // Budget 4: greedy grabs the cheap high-ratio action first and can no longer afford the big one.
  const items = [
    { id: 'cheap', cost: 1, gain: 12 },
    { id: 'big', cost: 4, gain: 40 },
  ]
  const greedy = greedySelect({ candidates: items, objective: evacTime, budget: 4 })
  const best = backtrackBest({ candidates: items, objective: evacTime, budget: 4 })
  assert.deepEqual(greedy.selected.map((c) => c.id), ['cheap'])
  assert.deepEqual(best.selected.map((c) => c.id), ['big'])
  assert.ok(best.value < greedy.final)
})

test('Backtracking explores every subset within budget and counts pruning', () => {
  const r = backtrackBest({ candidates: actions, objective: evacTime, budget: Infinity })
  assert.equal(r.explored, 8) // 2^3
  assert.equal(r.pruned, 0)
  assert.deepEqual(r.selected.map((c) => c.id).sort(), ['emergencyExit', 'openGateB', 'redirectZ4'])
  const tight = backtrackBest({ candidates: actions, objective: evacTime, budget: 3 })
  assert.ok(tight.pruned > 0)
  assert.ok(tight.cost <= 3)
  assert.deepEqual(backtrackBest({ candidates: [], objective: evacTime }).selected, [])
})
