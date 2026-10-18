// Small benchmark: observed runtime vs input size for algorithms where that comparison makes sense.
// Inputs are SYNTHETIC (seeded random arrays and grid graphs), so runs are repeatable.
// Measured with performance.now() via timeIt (repeated runs, averaged). Observed times show the
// trend; they do not prove the Big-O bound.
import { Graph } from '../algorithms/graph/Graph.js'
import { bfs } from '../algorithms/graph/bfs.js'
import { dijkstra } from '../algorithms/graph/dijkstra.js'
import { maxFlow } from '../algorithms/flow/maxFlow.js'
import { mergeSort } from '../algorithms/sorting/mergeSort.js'
import { timeIt } from './timing.js'

export const BENCH_SIZES = [10, 50, 100, 500, 1000]

function seeded(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

// Grid graph with about n nodes, like a large venue split into n zones; edges both ways.
export function gridGraph(n, rnd) {
  const cols = Math.max(1, Math.round(Math.sqrt(n)))
  const g = new Graph()
  for (let i = 0; i < n; i++) g.addNode(i)
  const link = (a, b) => {
    const cost = 1 + Math.floor(rnd() * 20)
    const capacity = 1 + Math.floor(rnd() * 20)
    g.addEdge(a, b, { cost, capacity })
    g.addEdge(b, a, { cost, capacity })
  }
  for (let i = 0; i < n; i++) {
    if ((i + 1) % cols !== 0 && i + 1 < n) link(i, i + 1)
    if (i + cols < n) link(i, i + cols)
  }
  return g
}

export function runBenchmark(sizes = BENCH_SIZES) {
  return sizes.map((n) => {
    const rnd = seeded(n * 31 + 7)
    const arr = Array.from({ length: n }, () => Math.floor(rnd() * 1000))
    const g = gridGraph(n, rnd)
    return {
      n,
      edges: g.E,
      mergeSort: timeIt(() => mergeSort(arr), { minMs: 8 }).ms,
      bfs: timeIt(() => bfs(g, 0), { minMs: 8 }).ms,
      dijkstra: timeIt(() => dijkstra(g, 0), { minMs: 8 }).ms,
      maxFlow: timeIt(() => maxFlow(g, 0, n - 1), { minMs: 8 }).ms,
    }
  })
}
