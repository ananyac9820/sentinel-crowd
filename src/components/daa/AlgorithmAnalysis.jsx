import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ALGORITHMS } from '../../algorithms/catalog.js'
import { BENCH_SIZES, runBenchmark } from '../../engine/benchmark.js'

const AXIS = { fill: '#3d3c38', fontSize: 11, fontWeight: 600, fontFamily: 'IBM Plex Mono' }
const ORDER = ['mergeSort', 'binarySearch', 'graph', 'bfs', 'dfs', 'dijkstra', 'maxFlow', 'minCut', 'greedy', 'backtracking']
const SERIES = [
  { key: 'mergeSort', label: 'Merge sort', color: '#6b6963' },
  { key: 'bfs', label: 'BFS', color: '#2f7a45' },
  { key: 'dijkstra', label: 'Dijkstra', color: '#111111' },
  { key: 'maxFlow', label: 'Edmonds-Karp', color: '#b02a22' },
]

// Observed runtime, with sensible precision for sub-millisecond values.
export function Ms({ timing }) {
  if (!timing) return <span className="text-dim">not run yet</span>
  const ms = timing.ms
  return (
    <span title={`Average of ${timing.runs} runs`}>
      {ms < 0.01 ? `${(ms * 1000).toFixed(1)} µs` : ms < 1 ? `${ms.toFixed(3)} ms` : `${ms.toFixed(2)} ms`}
    </span>
  )
}

// Complexity card shown under each step of the DAA Engine tab.
export function ComplexityBox({ algoKey, timing }) {
  const a = ALGORITHMS[algoKey]
  return (
    <div className="border-t border-line-strong bg-bg px-3 py-2 text-[12px]">
      <p className="label mb-1">{a.name}</p>
      <dl className="num grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-dim">Time</dt>
        <dd>{a.time}</dd>
        <dt className="text-dim">Space</dt>
        <dd>{a.space}</dd>
        <dt className="text-dim">Data structure</dt>
        <dd>{a.structure}</dd>
        <dt className="text-dim">Observed</dt>
        <dd>
          <Ms timing={timing} /> <span className="font-sans text-[11px] text-dim">(this run, this machine)</span>
        </dd>
      </dl>
      <p className="mt-1 text-[11.5px] leading-snug text-muted">{a.viva}</p>
    </div>
  )
}

export default function AlgorithmAnalysis({ analysis }) {
  const timings = analysis?.timings ?? {}
  const g = analysis?.graph
  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0 lg:overflow-y-auto scroll-thin">
      <section className="panel">
        <div className="panel-head">
          <span className="label">Algorithm analysis</span>
          <span className="text-[12px] text-muted">
            {g ? `Last DAA analysis: V = ${g.V}, E = ${g.E}, ${analysis.candidates?.length ?? 0} candidate actions` : 'Run the DAA analysis to fill in observed runtimes'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[12.5px]">
            <thead>
              <tr className="label border-b border-line-strong text-left">
                <th className="px-3 py-1.5">Algorithm</th>
                <th className="px-3 py-1.5">Sentinel use</th>
                <th className="px-3 py-1.5">Data structure</th>
                <th className="px-3 py-1.5">Time (theory)</th>
                <th className="px-3 py-1.5">Space</th>
                <th className="px-3 py-1.5">Observed runtime</th>
                <th className="px-3 py-1.5">Source</th>
              </tr>
            </thead>
            <tbody>
              {ORDER.map((k) => {
                const a = ALGORITHMS[k]
                return (
                  <tr key={k} className="border-t border-line align-top">
                    <td className="px-3 py-1.5 font-bold">{a.name}</td>
                    <td className="px-3 py-1.5">{a.purpose}</td>
                    <td className="px-3 py-1.5 text-muted">{a.structure}</td>
                    <td className="num px-3 py-1.5">{a.time}</td>
                    <td className="num px-3 py-1.5">{a.space}</td>
                    <td className="num px-3 py-1.5">
                      <Ms timing={timings[k]} />
                    </td>
                    <td className="num px-3 py-1.5 text-[11px] text-dim">{a.file}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-3 py-1.5 text-[11px] leading-snug text-dim">
          Theoretical complexity is the worst-case bound of the implementation. Observed runtime is the average over repeated runs on this machine (browser timers are coarse, so a single run would read 0). Observed times
          cannot prove a Big-O bound; they only show the trend. Greedy and backtracking times include every max-flow run they trigger.
        </p>
      </section>

      <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Benchmark />
        <section className="panel">
          <div className="panel-head">
            <span className="label">Why these algorithms</span>
          </div>
          <ul className="space-y-2 px-3 py-2 text-[12.5px] leading-snug">
            {ORDER.map((k) => (
              <li key={k}>
                <b>{ALGORITHMS[k].name}.</b> <span className="text-muted">{ALGORITHMS[k].viva}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Benchmark() {
  const [rows, setRows] = useState(null)
  const [running, setRunning] = useState(false)
  const run = () => {
    setRunning(true)
    // Let the button repaint before the (synchronous) benchmark blocks the page for a moment.
    setTimeout(() => {
      setRows(runBenchmark())
      setRunning(false)
    }, 30)
  }
  return (
    <section className="panel flex flex-col">
      <div className="panel-head">
        <span className="label">Benchmark mode</span>
        <span className="text-[12px] text-muted">Input sizes {BENCH_SIZES.join(', ')}</span>
        <button className="btn btn-primary ml-auto" onClick={run} disabled={running}>
          {running ? 'Running…' : rows ? 'Run again' : 'Run benchmark'}
        </button>
      </div>
      {rows ? (
        <>
          <div className="h-[260px] px-1 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#d6d4cd" vertical={false} />
                {/* Numeric (not categorical) x axis, so the curve's shape reflects real growth. */}
                <XAxis dataKey="n" type="number" domain={[0, BENCH_SIZES.at(-1)]} ticks={BENCH_SIZES} tick={AXIS} axisLine={{ stroke: '#111111' }} tickLine={false} label={{ value: 'n (array items / graph nodes)', position: 'insideBottom', offset: -2, style: AXIS }} height={36} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `${v.toFixed(2)}`} label={{ value: 'ms', angle: -90, position: 'insideLeft', style: AXIS }} />
                <Tooltip
                  contentStyle={{ background: '#fbfaf7', border: '1.5px solid #111111', borderRadius: 2, fontSize: 12, fontFamily: 'IBM Plex Mono' }}
                  formatter={(v, name) => [`${v.toFixed(4)} ms`, SERIES.find((s) => s.key === name)?.label ?? name]}
                  labelFormatter={(n) => `n = ${n}`}
                />
                <Legend verticalAlign="top" formatter={(key) => SERIES.find((s) => s.key === key)?.label} wrapperStyle={{ fontSize: 12, paddingBottom: 4 }} />
                {SERIES.map((s) => (
                  <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="num w-full text-[12px]">
            <thead>
              <tr className="label border-y border-line text-right">
                <th className="px-3 py-1 text-left">n</th>
                <th className="px-3 py-1">E</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="px-3 py-1">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.n} className="text-right">
                  <td className="px-3 py-0.5 text-left">{r.n}</td>
                  <td className="px-3 py-0.5">{r.edges}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="px-3 py-0.5">
                      {r[s.key].toFixed(4)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="px-3 py-6 text-center text-[13px] text-muted">Measures real runtimes with performance.now() on seeded synthetic inputs: random arrays for merge sort, grid graphs for BFS, Dijkstra and Edmonds-Karp.</p>
      )}
      <p className="border-t border-line px-3 py-1.5 text-[11px] leading-snug text-dim">
        Expected trend: merge sort ~ n log n, BFS ~ V + E, Dijkstra ~ (V + E) log V. Edmonds-Karp’s O(V·E²) is a worst-case bound; on these grids the number of augmenting paths stays small, so it grows much more slowly. Times are in ms per run, averaged.
      </p>
    </section>
  )
}
