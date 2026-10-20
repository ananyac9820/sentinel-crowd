// Empirical timing for the algorithms, plus the synthetic inputs they are timed on.
//
// HOW TO READ THE NUMBERS -- and what they do NOT show:
//   A measured runtime is evidence about this machine, this browser's JIT, this garbage
//   collector and this input. It cannot prove an asymptotic bound: Big-O is a statement about
//   growth as n goes to infinity, ignoring constants, and no finite set of measurements can
//   establish it. What the measurements CAN do is show whether the observed growth is
//   consistent with the analysis, and expose constant factors that the analysis deliberately
//   discards (which is why quick sort usually beats merge sort despite the same average bound).
//   The UI therefore always labels theory and measurement separately.
//
// The ratio column is the honest way to read growth: for an O(n log n) algorithm, doubling n
// should multiply time by about 2 * (log 2n / log n), slightly more than 2. For O(n^2) it should
// quadruple. Comparing successive ratios says more than any single timing.

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

/**
 * Times `fn(input)` and returns the median of several runs.
 * The median is used rather than the mean because a single garbage-collection pause can add
 * milliseconds to one run and would drag a mean well off the typical cost.
 */
export function timeIt(fn, input, { runs = 5, warmup = 1 } = {}) {
  for (let i = 0; i < warmup; i++) fn(input) // let the JIT compile the hot path first
  const samples = []
  let result
  for (let i = 0; i < runs; i++) {
    const t0 = now()
    result = fn(input)
    samples.push(now() - t0)
  }
  samples.sort((a, b) => a - b)
  return {
    ms: samples[Math.floor(samples.length / 2)],
    min: samples[0],
    max: samples[samples.length - 1],
    runs,
    result,
  }
}

const OPERATION_KEYS = ['comparisons', 'swaps', 'writes', 'edgesRelaxed', 'edgesExamined', 'transitions', 'augmentations']

/** Total counted operations, or null when the algorithm reports no counters. */
function countOperations(stats) {
  if (!stats) return null
  const keys = OPERATION_KEYS.filter((k) => Number.isFinite(stats[k]))
  if (!keys.length) return null
  return keys.reduce((a, k) => a + stats[k], 0)
}

/**
 * Runs one algorithm across several input sizes.
 * @param makeInput (n) => input
 * @param fn        (input) => result, optionally returning { stats }
 * @returns rows of { n, ms, ratio, operations }
 */
export function sweep(makeInput, fn, sizes, options = {}) {
  const rows = []
  for (const n of sizes) {
    const input = makeInput(n)
    const { ms, min, max, result } = timeIt(fn, input, options)
    const stats = result?.stats ?? null
    rows.push({
      n,
      ms,
      min,
      max,
      // Operation counts come from the algorithms' own counters, so they are exact and
      // machine independent -- unlike the timings, they ARE evidence about the algorithm.
      operations: countOperations(stats),
      stats,
      ratio: rows.length ? ms / (rows[rows.length - 1].ms || 1e-6) : null,
    })
  }
  return rows
}

/** Compares several algorithms over the same sizes. Returns one row per size for charting. */
export function compare(entries, sizes, options = {}) {
  const perAlgorithm = entries.map(({ key, label, makeInput, fn }) => ({ key, label, rows: sweep(makeInput, fn, sizes, options) }))
  const chart = sizes.map((n, i) => {
    const row = { n }
    for (const a of perAlgorithm) row[a.key] = Number(a.rows[i].ms.toFixed(4))
    return row
  })
  return { perAlgorithm, chart }
}

// ---------- Synthetic inputs ----------

// A deterministic generator, so a benchmark run is repeatable and two algorithms are always
// compared on byte-identical input. Math.random() would make the comparison unfair.
export function makeRandom(seed = 12345) {
  let s = seed >>> 0
  return () => {
    // xorshift32
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

/** n zone-like records with random danger scores: the input the live ranking really sorts. */
export function randomZoneScores(n, seed = 7) {
  const rand = makeRandom(seed)
  return Array.from({ length: n }, (_, i) => ({ id: `Z${i}`, name: `Z${i}`, score: Math.round(rand() * 1000) / 10 }))
}

/** Already-sorted input: quick sort's worst case when the pivot is taken from the end. */
export function sortedZoneScores(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `Z${i}`, name: `Z${i}`, score: i }))
}

/**
 * A grid graph that looks like a station: each cell connects to its four neighbours, and the
 * bottom row connects to exits. Sparse, so E is about 4V -- the same shape as the real graph.
 */
export function randomStationGraph(n, seed = 11, GraphClass) {
  const rand = makeRandom(seed)
  const side = Math.max(2, Math.round(Math.sqrt(n)))
  const g = new GraphClass({ directed: true })
  const id = (r, c) => `Z${r}-${c}`
  for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) g.addNode({ id: id(r, c), kind: 'zone', name: id(r, c), x: c / side, y: r / side })
  const exitCount = Math.max(2, Math.round(side / 2))
  for (let e = 0; e < exitCount; e++) g.addNode({ id: `X${e}`, kind: 'exit', name: `Exit ${e}`, x: (e + 0.5) / exitCount, y: 1 })
  const link = (a, b) => {
    const distance = 5 + rand() * 20
    const congestion = rand()
    const risk = rand()
    g.addEdge(a, b, { distance, congestion, risk, capacity: 20 + Math.round(rand() * 80), walkTime: distance / 1.2, cost: distance / 100 + congestion + risk })
  }
  for (let r = 0; r < side; r++)
    for (let c = 0; c < side; c++) {
      if (c + 1 < side) {
        link(id(r, c), id(r, c + 1))
        link(id(r, c + 1), id(r, c))
      }
      if (r + 1 < side) {
        link(id(r, c), id(r + 1, c))
        link(id(r + 1, c), id(r, c))
      }
    }
  for (let e = 0; e < exitCount; e++) {
    const c = Math.min(side - 1, Math.round((e + 0.5) * (side / exitCount)))
    link(id(side - 1, c), `X${e}`)
  }
  return g
}

export const BENCHMARK_SIZES = [100, 500, 1000, 5000, 10000]
