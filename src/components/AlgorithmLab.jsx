import { useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import GraphView, { GraphLegend } from './GraphView.jsx'
import { ALGORITHMS, SECTIONS, algorithmInfo, mappingTable } from '../algorithms/analysis/complexity.js'
import { BENCHMARK_SIZES, compare, randomStationGraph, randomZoneScores, sortedZoneScores } from '../algorithms/analysis/benchmark.js'
import { mergeSort } from '../algorithms/sorting/mergeSort.js'
import { quickSort } from '../algorithms/sorting/quickSort.js'
import { bandOf, binarySearch } from '../algorithms/searching/binarySearch.js'
import { bfs } from '../algorithms/graph/bfs.js'
import { dfs } from '../algorithms/graph/dfs.js'
import { dijkstra, safestRoute } from '../algorithms/graph/dijkstra.js'
import Graph from '../algorithms/graph/Graph.js'
import { compareSorts, densityThresholds } from '../engine/riskEngine.js'
import { mmss } from '../engine/crowdDecisionEngine.js'
import { regionsAtDepth } from '../algorithms/divideAndConquer/spatialPartition.js'
import { explainCost } from '../engine/crowdGraphBuilder.js'

const AXIS = { fill: '#3d3c38', fontSize: 11, fontWeight: 600, fontFamily: 'IBM Plex Mono' }
const SERIES = { merge: '#111111', quick: '#b02a22', bfs: '#2f7a45', dijkstra: '#9a7410' }

// The Algorithm Lab. Every section runs on the LIVE crowd graph from the decision engine, so the
// demonstrations are of the real system rather than of toy data. The benchmark section is the one
// exception, and it says so: it needs inputs far larger than a station layout to show growth.

export default function AlgorithmLab({ decision, settings }) {
  const [section, setSection] = useState('sorting')
  if (!decision) return <div className="panel p-4 text-[13px] text-muted">Waiting for the first crowd reading.</div>

  return (
    <div className="grid gap-3 [&>*]:min-w-0 lg:h-full lg:min-h-0 lg:grid-cols-[210px_minmax(0,1fr)]">
      <nav className="panel self-start lg:max-h-full lg:overflow-y-auto scroll-thin" aria-label="Algorithm sections">
        <div className="panel-head">
          <span className="label">Algorithm Lab</span>
        </div>
        <ul>
          {SECTIONS.map((s) => (
            <li key={s.key}>
              <button
                onClick={() => setSection(s.key)}
                aria-current={section === s.key}
                className={`w-full border-b border-line px-3 py-2 text-left transition-colors ${section === s.key ? 'bg-accent text-[#f6f5f1]' : 'hover:bg-raised'}`}
              >
                <span className="block text-[13px] font-bold">{s.title}</span>
                <span className={`block text-[11px] leading-snug ${section === s.key ? 'text-[#f6f5f1b3]' : 'text-dim'}`}>{s.blurb}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              onClick={() => setSection('benchmark')}
              aria-current={section === 'benchmark'}
              className={`w-full px-3 py-2 text-left transition-colors ${section === 'benchmark' ? 'bg-accent text-[#f6f5f1]' : 'hover:bg-raised'}`}
            >
              <span className="block text-[13px] font-bold">Performance experiment</span>
              <span className={`block text-[11px] leading-snug ${section === 'benchmark' ? 'text-[#f6f5f1b3]' : 'text-dim'}`}>Measured runtime vs input size</span>
            </button>
          </li>
        </ul>
      </nav>

      <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto scroll-thin">
        {section === 'sorting' && <SortingSection decision={decision} />}
        {section === 'searching' && <SearchingSection decision={decision} settings={settings} />}
        {section === 'divide' && <DivideSection decision={decision} />}
        {section === 'traversal' && <TraversalSection decision={decision} />}
        {section === 'shortest' && <ShortestSection decision={decision} />}
        {section === 'flow' && <FlowSection decision={decision} />}
        {section === 'greedy' && <GreedySection decision={decision} />}
        {section === 'dp' && <DpSection decision={decision} />}
        {section === 'backtracking' && <BacktrackingSection decision={decision} />}
        {section === 'structures' && <StructuresSection decision={decision} />}
        {section === 'benchmark' && <BenchmarkSection />}
        <ComplexityTable />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- sorting

function SortingSection({ decision }) {
  const [algorithm, setAlgorithm] = useState('merge')
  const both = useMemo(() => compareSorts(decision.graph), [decision])
  const run = algorithm === 'merge' ? both.merge : both.quick
  const other = algorithm === 'merge' ? both.quick : both.merge

  return (
    <>
      <Panel
        id={algorithm === 'merge' ? 'mergeSort' : 'quickSort'}
        head={
          <div className="ml-auto flex border border-line-strong" role="group" aria-label="Sorting algorithm" style={{ borderRadius: 2 }}>
            {[['merge', 'Merge sort'], ['quick', 'Quick sort']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setAlgorithm(key)}
                aria-pressed={algorithm === key}
                className={`h-6 px-2.5 text-[11px] font-bold ${algorithm === key ? 'bg-accent text-[#f6f5f1]' : 'bg-raised text-muted hover:text-fg'}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <p className="text-[12.5px] leading-snug text-muted">
          The danger score is a heuristic combining density load, turbulence, counter-flow and the forecast. What the
          algorithm contributes is the ORDER, which the zone table, the alerts and the route search all depend on.
        </p>
        <div className="overflow-x-auto scroll-thin">
          <table className="num mt-2 w-full text-[12.5px]">
            <thead>
              <tr className="label border-b border-line-strong text-left">
                {['Rank', 'Zone', 'Score', 'People', 'Load', 'Turbulence'].map((h) => (
                  <th key={h} className="py-1 pr-3 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {run.ranked.map((z) => (
                <tr key={z.id} className={z.rank === 1 ? 'font-bold text-crit' : ''}>
                  <td className="py-1 pr-3">{z.rank}</td>
                  <td className="py-1 pr-3">{z.name}</td>
                  <td className="py-1 pr-3">{z.score}</td>
                  <td className="py-1 pr-3">{z.people}</td>
                  <td className="py-1 pr-3">{Math.round(z.load * 100)}%</td>
                  <td className="py-1 pr-3">{z.turbulence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="panel">
        <div className="panel-head">
          <span className="label">Measured on this zone data</span>
          <span className="ml-auto text-[11px] text-dim">n = {run.ranked.length} zones</span>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="num w-full text-[12.5px]">
            <thead>
              <tr className="label border-b border-line-strong text-left">
                {['', 'Comparisons', 'Data moves', 'Recursion depth', 'Worst case', 'Stable'].map((h) => (
                  <th key={h} className="px-3 py-1 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td className="px-3 py-1 font-bold">Merge sort</td>
                <td className="px-3 py-1">{both.merge.stats.comparisons}</td>
                <td className="px-3 py-1">{both.merge.stats.writes} writes</td>
                <td className="px-3 py-1">{both.merge.stats.depth}</td>
                <td className="px-3 py-1">O(n log n)</td>
                <td className="px-3 py-1">yes</td>
              </tr>
              <tr>
                <td className="px-3 py-1 font-bold">Quick sort</td>
                <td className="px-3 py-1">{both.quick.stats.comparisons}</td>
                <td className="px-3 py-1">{both.quick.stats.swaps} swaps</td>
                <td className="px-3 py-1">{both.quick.stats.depth}</td>
                <td className="px-3 py-1 text-crit">O(n&sup2;)</td>
                <td className="px-3 py-1">no</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-3 py-2 text-[12px] leading-snug text-muted">
          Both sorts produced {both.agree ? 'the identical order' : 'DIFFERENT orders, which means the comparator is not a total order'}.
          Quick sort moves far less data because it sorts in place, but it carries no worst-case guarantee, and its worst case
          is near-sorted input &mdash; exactly what consecutive camera frames produce. Sentinel therefore uses merge sort for
          the live ranking. Currently {algorithm === 'merge' ? 'merge' : 'quick'} sort is selected, which used{' '}
          {run.stats.comparisons} comparisons against {other.stats.comparisons} for the other.
        </p>
      </section>
    </>
  )
}

// ---------------------------------------------------------------- searching

function SearchingSection({ decision, settings }) {
  const thresholds = densityThresholds(settings)
  const [probe, setProbe] = useState(() => Math.round(decision.focus?.density ?? thresholds[1]))
  const result = bandOf(thresholds, probe)
  const exact = binarySearch(thresholds.map((t) => Math.round(t)), probe)

  return (
    <>
      <Panel id="binarySearch">
        <label className="flex flex-wrap items-center gap-2 text-[13px]">
          Density to classify
          <input
            type="range"
            min={0}
            max={Math.round(thresholds[2] * 1.6)}
            value={probe}
            onChange={(e) => setProbe(Number(e.target.value))}
            className="h-1 flex-1 accent-[#111111]"
          />
          <span className="num w-14 text-right font-bold">{probe}</span>
        </label>
        <div className="mt-2 flex">
          {['SAFE', 'WATCH', 'WARNING', 'CRITICAL'].map((name, i) => (
            <div
              key={name}
              className="flex-1 border px-2 py-1.5 text-center"
              style={{
                borderColor: result.band === i ? '#b02a22' : 'var(--color-line)',
                background: result.band === i ? '#b02a2218' : 'var(--color-panel)',
                borderWidth: result.band === i ? 1.5 : 1,
              }}
            >
              <div className="label">{name}</div>
              <div className="num text-[11px] text-dim">{i === 0 ? `< ${Math.round(thresholds[0])}` : i === 3 ? `>= ${Math.round(thresholds[2])}` : `${Math.round(thresholds[i - 1])} to ${Math.round(thresholds[i]) - 1}`}</div>
            </div>
          ))}
        </div>
        <p className="num mt-2 text-[13px]">
          Band {result.band} found in {result.stats.steps} halving steps, {result.stats.comparisons} comparisons over{' '}
          {thresholds.length} thresholds. Exact-match search for {probe}:{' '}
          {exact.index >= 0 ? `found at index ${exact.index}` : 'not a threshold value, so -1'}.
        </p>
        <p className="mt-1 text-[12px] leading-snug text-dim">
          With four bands a linear scan is just as fast. The reason to write it as a search is that the lower-bound variant
          returns an insertion point rather than -1, which is what bucketing needs, and the same routine drives the capacity
          question below, where the answer space is 2000 values wide.
        </p>
      </Panel>

      <Panel id="capacitySearch">
        <p className="text-[12.5px] leading-snug text-muted">
          How much extra exit capacity would bring clearance under {decision.limits.targetClearanceSeconds} s? There is no
          array to search here &mdash; only a monotone predicate, because more capacity can never make evacuation slower.
        </p>
        <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
          <Pair k="Clearance now" v={mmss(decision.clearanceNow)} />
          <Pair k="Target" v={`${decision.limits.targetClearanceSeconds} s`} />
          <Pair
            k="Extra capacity needed"
            v={decision.capacityNeeded.already ? 'none, already inside the target' : decision.capacityNeeded.needed == null ? 'unreachable by exit capacity alone' : `${Math.round(decision.capacityNeeded.needed)} people/min`}
          />
          <Pair k="Max-flow evaluations" v={decision.capacityNeeded.stats.evaluations} />
          <Pair k="Linear scan would need" v="up to 2000" />
          <Pair k="Search range" v="0 to 2000 people/min" />
        </dl>
      </Panel>
    </>
  )
}

// ---------------------------------------------------------------- divide and conquer

function DivideSection({ decision }) {
  const [depth, setDepth] = useState(1)
  const regions = regionsAtDepth(decision.partition.root, depth)
  const hot = decision.partition.region

  return (
    <Panel id="spatialPartition">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px]">Partition depth</span>
        {[0, 1, 2, 3].map((d) => (
          <button key={d} onClick={() => setDepth(d)} aria-pressed={depth === d} className={`btn h-6 px-2 text-[11px] ${depth === d ? 'btn-primary' : ''}`}>
            {d}
          </button>
        ))}
        <span className="num ml-auto text-[11px] text-dim">
          {decision.partition.stats.regions} regions, {decision.partition.stats.leaves} leaves, {decision.partition.stats.combines} combine steps
        </span>
      </div>
      <div className="mt-2">
        <GraphView
          graph={decision.graph}
          regions={regions.map((r) => ({ rect: r.rect, hot: hot && r.rect.x === hot.rect.x && r.rect.y === hot.rect.y && r.rect.w === hot.rect.w }))}
          focusId={decision.focus?.id}
        />
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="num mt-2 w-full text-[12.5px]">
          <thead>
            <tr className="label border-b border-line-strong text-left">
              {['Region', 'Zones', 'People', 'Region density', 'Load', 'Worst level', 'Pressure'].map((h) => (
                <th key={h} className="py-1 pr-3 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {regions.map((r, i) => {
              const isHot = hot && r.rect.x === hot.rect.x && r.rect.y === hot.rect.y && r.rect.w === hot.rect.w
              return (
                <tr key={i} className={isHot ? 'font-bold text-crit' : ''}>
                  <td className="py-1 pr-3">
                    {i + 1}
                    {isHot && <span className="ml-1 text-[10px]">HOTTEST</span>}
                  </td>
                  <td className="py-1 pr-3">{r.zoneNames.join(' ')}</td>
                  <td className="py-1 pr-3">{r.people}</td>
                  <td className="py-1 pr-3">{r.density.toFixed(0)}</td>
                  <td className="py-1 pr-3">{Math.round(r.load * 100)}%</td>
                  <td className="py-1 pr-3">{['SAFE', 'WATCH', 'WARNING', 'CRITICAL'][r.worstLevel]}</td>
                  <td className="py-1 pr-3">{r.pressure.toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] leading-snug text-muted">
        <b>Divide</b> into four quadrants, <b>conquer</b> each independently down to a single zone, <b>combine</b> by adding
        the children&apos;s people and computing the region&apos;s OWN density. The combine step is what earns the recursion: a
        region can be over the safe density even when none of its zones is. The hottest region selects the zone the route
        search starts from, which is{' '}
        <span className="num font-bold">{decision.focus?.name ?? 'none'}</span>.
      </p>
    </Panel>
  )
}

// ---------------------------------------------------------------- traversal

function TraversalSection({ decision }) {
  const zoneNodes = decision.graph.nodesOfKind('zone')
  const [source, setSource] = useState(decision.focus?.id ?? zoneNodes[0]?.id)
  const [which, setWhich] = useState('bfs')
  const src = decision.graph.hasNode(source) ? source : zoneNodes[0]?.id
  const run = useMemo(() => (which === 'bfs' ? bfs(decision.graph, src) : dfs(decision.graph, src)), [decision, src, which])
  const info = algorithmInfo(which)

  return (
    <>
      <Panel
        id={which}
        head={
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[11px]">
              From
              <select value={src} onChange={(e) => setSource(e.target.value)} className="num border border-line-strong bg-bg px-1 py-0.5 text-[11px]" style={{ borderRadius: 2 }}>
                {zoneNodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </label>
            <div className="flex border border-line-strong" role="group" style={{ borderRadius: 2 }}>
              {[['bfs', 'BFS'], ['dfs', 'DFS']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setWhich(key)}
                  aria-pressed={which === key}
                  className={`h-6 px-2.5 text-[11px] font-bold ${which === key ? 'bg-accent text-[#f6f5f1]' : 'bg-raised text-muted hover:text-fg'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="mb-2">
          <GraphView graph={decision.graph} visited={run.order} focusId={src} />
        </div>
        <GraphLegend items={[{ color: '#6b6963', label: 'Numbers show the order nodes were reached' }]} />
        <p className="num text-[12.5px] leading-snug">
          Order: {run.order.map((id) => decision.graph.getNode(id).name).join(' -> ')}
        </p>
        <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12.5px] sm:grid-cols-3">
          <Pair k="Nodes visited" v={run.stats.visited} />
          <Pair k="Edges examined" v={run.stats.edgesExamined} />
          <Pair k={which === 'bfs' ? 'Peak queue size' : 'Peak stack size'} v={which === 'bfs' ? run.stats.maxQueueSize : run.stats.maxStackSize} />
          <Pair k="Structure" v={which === 'bfs' ? 'FIFO queue' : 'LIFO stack'} />
          <Pair k="Complexity" v="O(V + E)" />
          <Pair k="Unreached nodes" v={decision.graph.nodeCount - run.stats.visited} />
        </dl>
        <p className="mt-2 text-[12px] leading-snug text-muted">{info.why}</p>
      </Panel>

      {which === 'bfs' ? (
        <section className="panel">
          <div className="panel-head">
            <span className="label">Frontier layers and reachable exits</span>
          </div>
          <div className="px-3 py-2">
            <ol className="num space-y-0.5 text-[12.5px]">
              {run.levels.map((layer, h) => (
                <li key={h}>
                  <span className="font-bold">{h} transitions:</span> {layer.map((id) => decision.graph.getNode(id).name).join(', ')}
                </li>
              ))}
            </ol>
            <p className="num mt-2 text-[12.5px]">
              Exits reachable from {decision.graph.getNode(src).name}:{' '}
              {decision.reach.exits.length ? decision.reach.exits.map((e) => `${e.name} in ${e.hops}`).join(', ') : 'none'}
              {decision.reach.unreachable.length ? ` | unreachable: ${decision.reach.unreachable.join(', ')}` : ''}
            </p>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <span className="label">Connected dangerous regions</span>
            <span className="ml-auto text-[11px] text-dim">{decision.danger.stats.components} components</span>
          </div>
          <div className="px-3 py-2 text-[12.5px]">
            {decision.danger.regions.length ? (
              <ul className="num space-y-1">
                {decision.danger.regions.map((g, i) => (
                  <li key={i}>
                    <span className="font-bold">Region {i + 1}:</span> {g.names.join(', ')} &mdash; {g.people} people, worst level{' '}
                    {['SAFE', 'WATCH', 'WARNING', 'CRITICAL'][g.worstLevel]}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No congested zones touch each other, so there is no contiguous dangerous region.</p>
            )}
            {decision.closureCheck && (
              <p className="mt-2 text-muted">
                Closure check: closing the tightest corridor would{' '}
                {decision.closureCheck.safe ? 'strand nobody, so it is a permitted action.' : <span className="font-bold text-crit">strand {decision.closureCheck.stranded.join(', ')}, so it is forbidden.</span>}
              </p>
            )}
          </div>
        </section>
      )}
    </>
  )
}

// ---------------------------------------------------------------- shortest path

function ShortestSection({ decision }) {
  const zoneNodes = decision.graph.nodesOfKind('zone')
  const [source, setSource] = useState(decision.focus?.id ?? zoneNodes[0]?.id)
  const src = decision.graph.hasNode(source) ? source : zoneNodes[0]?.id
  const route = useMemo(() => safestRoute(decision.graph, src), [decision, src])
  const run = useMemo(() => dijkstra(decision.graph, src), [decision, src])
  const nameOf = (id) => decision.graph.getNode(id)?.name ?? id

  if (!route) return <Panel id="dijkstra"><p className="text-[13px] text-muted">No exit is configured, so there is no route to compute. Configure exits on the Setup tab.</p></Panel>

  return (
    <>
      <Panel
        id="dijkstra"
        head={
          <label className="ml-auto flex items-center gap-1 text-[11px]">
            From
            <select value={src} onChange={(e) => setSource(e.target.value)} className="num border border-line-strong bg-bg px-1 py-0.5 text-[11px]" style={{ borderRadius: 2 }}>
              {zoneNodes.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </label>
        }
      >
        <div className="mb-2">
          <GraphView
            graph={decision.graph}
            route={route.reachable ? route.safest.path : null}
            altRoute={route.differs ? route.shortest.path : null}
            visited={run.settledOrder}
            focusId={src}
          />
        </div>
        <GraphLegend
          items={[
            { color: '#b02a22', label: 'Safest route (lowest cost)' },
            { color: '#9a7410', label: 'Shortest by distance only', dashed: true },
            { color: '#6b6963', label: 'Numbers show the order nodes were settled' },
          ]}
        />
        {!route.reachable ? (
          <p className="text-[13px] font-bold text-crit">No exit is reachable from {nameOf(src)}. That is an emergency in itself.</p>
        ) : (
          <>
            <div className="overflow-x-auto scroll-thin">
              <table className="num w-full text-[12.5px]">
                <thead>
                  <tr className="label border-b border-line-strong text-left">
                    {['', 'Route', 'Cost', 'Distance', 'Walk time', 'Worst congestion', 'Worst risk'].map((h) => (
                      <th key={h} className="py-1 pr-3 font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr className="font-bold">
                    <td className="py-1 pr-3 text-crit">Safest</td>
                    <td className="py-1 pr-3">{route.safest.path.map(nameOf).join(' -> ')}</td>
                    <td className="py-1 pr-3">{route.safest.cost.toFixed(2)}</td>
                    <td className="py-1 pr-3">{Math.round(route.safest.distance)} m</td>
                    <td className="py-1 pr-3">{Math.round(route.safest.walkTime)} s</td>
                    <td className="py-1 pr-3">{Math.round(route.safest.congestion * 100)}%</td>
                    <td className="py-1 pr-3">{Math.round(route.safest.risk * 100)}</td>
                  </tr>
                  {route.shortest && (
                    <tr className={route.differs ? 'text-muted' : 'text-dim'}>
                      <td className="py-1 pr-3" style={{ color: route.differs ? '#9a7410' : undefined }}>Shortest</td>
                      <td className="py-1 pr-3">{route.shortest.path.map(nameOf).join(' -> ')}</td>
                      <td className="py-1 pr-3">{route.shortest.cost.toFixed(2)}</td>
                      <td className="py-1 pr-3">{Math.round(route.shortest.distance)} m</td>
                      <td className="py-1 pr-3">{Math.round(route.shortest.walkTime)} s</td>
                      <td className="py-1 pr-3">{Math.round(route.shortest.congestion * 100)}%</td>
                      <td className="py-1 pr-3">{Math.round(route.shortest.risk * 100)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] leading-snug text-muted">
              {route.differs ? (
                <>
                  The two routes differ. The shortest one is {Math.round(route.safest.distance - route.shortest.distance)} m
                  shorter but costs {(route.shortest.cost - route.safest.cost).toFixed(2)} more once congestion and risk are
                  counted, so Dijkstra rejects it. <b>The shortest physical route is not the safest route.</b>
                </>
              ) : (
                <>
                  Here the safest and shortest routes coincide, because the direct way out is not congested. Pick a zone next
                  to a congested one to see them separate.
                </>
              )}
            </p>
          </>
        )}
        <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12.5px] sm:grid-cols-3">
          <Pair k="Nodes settled" v={run.stats.settled} />
          <Pair k="Edges relaxed" v={run.stats.edgesRelaxed} />
          <Pair k="Improvements" v={run.stats.improvements} />
          <Pair k="Heap pushes" v={run.stats.heap?.pushes ?? 0} />
          <Pair k="Heap comparisons" v={run.stats.heap?.comparisons ?? 0} />
          <Pair k="Stale entries skipped" v={run.stats.stalePops} />
        </dl>
      </Panel>

      {route.reachable && (
        <section className="panel">
          <div className="panel-head">
            <span className="label">Cost breakdown of the chosen route</span>
            <span className="ml-auto text-[11px] text-dim">cost = 1.0 x distance/40m + 2.5 x congestion + 4.0 x risk</span>
          </div>
          <div className="overflow-x-auto scroll-thin">
            <table className="num w-full text-[12.5px]">
              <thead>
                <tr className="label border-b border-line-strong text-left">
                  {['Link', 'Distance', 'Congestion', 'Risk', 'Edge cost', 'Capacity'].map((h) => (
                    <th key={h} className="px-3 py-1 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {route.safest.edges.map((e) => {
                  const parts = explainCost(e)
                  return (
                    <tr key={e.id}>
                      <td className="px-3 py-1">{nameOf(e.from)} &rarr; {nameOf(e.to)}</td>
                      {parts.parts.map((p) => (
                        <td key={p.label} className="px-3 py-1">
                          {p.value.toFixed(2)} <span className="text-dim">({p.detail})</span>
                        </td>
                      ))}
                      <td className="px-3 py-1 font-bold">{e.cost.toFixed(2)}</td>
                      <td className="px-3 py-1">{Math.round(e.capacity)}/min</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

// ---------------------------------------------------------------- flow

function FlowSection({ decision }) {
  const f = decision.flow
  const cutIds = f.cut.cutEdges.map((e) => e.label?.edgeId).filter(Boolean)
  const flowEdges = new Map(f.network.usedEdges().map((e) => [e.label?.edgeId, e.flow]).filter(([id]) => id))

  return (
    <>
      <Panel id="edmondsKarp">
        <div className="mb-2">
          <GraphView graph={decision.graph} cutEdges={cutIds} flowEdges={flowEdges} focusId={decision.focus?.id} showCapacities />
        </div>
        <GraphLegend
          items={[
            { color: '#b02a22', label: 'Minimum cut: the links that limit the site', dashed: true },
            { color: '#2f7a45', label: 'Flow actually in use' },
            { color: '#6b6963', label: 'Numbers are capacity in people per minute' },
          ]}
        />
        <dl className="num grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-3">
          <Pair k="Maximum flow" v={`${Math.round(f.maxFlow)} people/min`} />
          <Pair k="People to move" v={decision.people} />
          <Pair k="Queue time" v={mmss(f.evacSeconds)} />
          <Pair k="Walk time" v={mmss(decision.walkSeconds)} />
          <Pair k="Total clearance" v={mmss(decision.clearanceNow)} />
          <Pair k="Augmenting paths" v={f.stats.flow.augmentations} />
        </dl>
        <p className="mt-2 text-[12px] leading-snug text-muted">
          The network sends a super source into every occupied zone, corridors and gate approaches carry people per minute, and
          each gate feeds a super sink at its own throughput. The source edges are left unbounded on purpose: capping them by
          occupancy would put the cut on the zones themselves, which staff cannot widen.
        </p>
        <div className="mt-2 border-t border-line pt-2">
          <p className="label">Augmenting paths, in the order BFS found them</p>
          <ol className="num mt-1 max-h-[200px] space-y-0.5 overflow-y-auto scroll-thin text-[11.5px]">
            {f.augmentingPaths.map((p) => (
              <li key={p.step}>
                <span className="font-bold">{p.step}.</span> {p.nodes.map((id) => decision.graph.getNode(id)?.name ?? id.replace('SUPER:', '')).join(' -> ')} &mdash; pushed{' '}
                {Math.round(p.pushed)}/min, total {Math.round(p.totalAfter)}
              </li>
            ))}
          </ol>
          <p className="mt-1 text-[11.5px] leading-snug text-dim">
            Path lengths never decrease, which is the property that bounds Edmonds-Karp at O(VE) augmentations no matter how
            large the capacities are.
          </p>
        </div>
      </Panel>

      <Panel id="minCut">
        <div className="overflow-x-auto scroll-thin">
          <table className="num w-full text-[12.5px]">
            <thead>
              <tr className="label border-b border-line-strong text-left">
                {['Bottleneck link', 'Kind', 'Capacity', 'Saturated'].map((h) => (
                  <th key={h} className="py-1 pr-3 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {f.bottlenecks.map((b, i) => (
                <tr key={b.id} className={i === 0 ? 'font-bold text-crit' : ''}>
                  <td className="py-1 pr-3">{b.label}</td>
                  <td className="py-1 pr-3">{b.kind}</td>
                  <td className="py-1 pr-3">{b.capacity}/min</td>
                  <td className="py-1 pr-3">yes</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="num mt-2 text-[12.5px]">
          Cut capacity {Math.round(f.cut.capacity)} = maximum flow {Math.round(f.maxFlow)}. Source side holds{' '}
          {f.cut.sourceSide.length} nodes, sink side {f.cut.sinkSide.length}.
        </p>
        <p className="mt-1 text-[12px] leading-snug text-muted">{algorithmInfo('minCut').why}</p>
      </Panel>
    </>
  )
}

// ---------------------------------------------------------------- greedy vs DP

function GreedySection({ decision }) {
  const g = decision.greedy
  const o = decision.optimal
  if (!decision.candidates.length)
    return (
      <Panel id="greedyIntervention">
        <p className="text-[13px] text-muted">
          No intervention is warranted: every zone is below the WATCH density and the site clears inside the target time, so
          the catalogue is empty. Let the simulation run to about 1:00 to see the optimiser work.
        </p>
      </Panel>
    )

  return (
    <>
      <Panel id="greedyIntervention">
        <div className="overflow-x-auto scroll-thin">
          <table className="num w-full text-[12.5px]">
            <thead>
              <tr className="label border-b border-line-strong text-left">
                {['Step', 'Action', 'Reduction', 'Cost', 'Ratio', 'Taken'].map((h) => (
                  <th key={h} className="py-1 pr-3 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {g.steps.map((s) => (
                <tr key={s.step} className={s.taken ? '' : 'text-dim'}>
                  <td className="py-1 pr-3">{s.step}</td>
                  <td className="py-1 pr-3">{s.label}</td>
                  <td className="py-1 pr-3">{s.reduction ?? '-'}</td>
                  <td className="py-1 pr-3">{s.cost ?? '-'}</td>
                  <td className="py-1 pr-3 font-bold">{s.ratio.toFixed(2)}</td>
                  <td className="py-1 pr-3">{s.taken ? 'yes' : `no (${s.reason})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-crit">{algorithmInfo('greedyIntervention').caveat}</p>
      </Panel>

      <Panel id="knapsackDP">
        <dl className="num grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px]">
          <Pair k="Budget" v={`${decision.limits.effortBudget} effort units`} />
          <Pair k="Greedy risk points" v={g.totalReduction} />
          <Pair k="DP optimum" v={o.best} />
          <Pair k="Gap" v={o.best - g.totalReduction} />
          <Pair k="States filled" v={o.stats.states} />
          <Pair k="Transitions" v={o.stats.transitions} />
        </dl>
        <p className="num mt-1 text-[12.5px]">
          Greedy set: {g.chosen.map((c) => c.label).join(', ') || 'empty'}
          <br />
          Optimal set: {o.chosen.map((c) => c.label).join(', ') || 'empty'}
        </p>
        <p className="mt-1 text-[12.5px] font-bold" style={{ color: o.best > g.totalReduction ? '#b02a22' : '#2f7a45' }}>
          {o.best > g.totalReduction
            ? `Greedy fell ${o.best - g.totalReduction} risk points short of the optimum on this instance.`
            : 'Greedy matched the optimum on this instance. It is not guaranteed to, and the table below shows why.'}
        </p>
        <DpRecurrence
          state="dp[i][b] = best risk reduction from the first i interventions using at most b effort"
          transition="dp[i][b] = max( dp[i-1][b],  dp[i-1][b - cost_i] + value_i )"
          base="dp[0][b] = 0 for every b"
          answer={`dp[${o.table.length - 1}][${o.budget}] = ${o.best}`}
        />
        {o.table.length > 1 && <DpTable table={o.table} rowLabels={decision.candidates.map((c) => c.label)} />}
      </Panel>
    </>
  )
}

// ---------------------------------------------------------------- exit allocation DP

function DpSection({ decision }) {
  const a = decision.allocation
  return (
    <Panel id="evacuationDP">
      {!a.dp.feasible ? (
        <p className="text-[13px] text-muted">No usable exit is configured, so there is nothing to allocate. Configure exits on the Setup tab.</p>
      ) : (
        <>
          <div className="overflow-x-auto scroll-thin">
            <table className="num w-full text-[12.5px]">
              <thead>
                <tr className="label border-b border-line-strong text-left">
                  {['Exit', 'Capacity', 'Opening delay', 'DP allocation', 'Finishes at', 'Proportional split'].map((h) => (
                    <th key={h} className="py-1 pr-3 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {a.dp.allocation.map((x, i) => (
                  <tr key={x.id} className={x.people ? '' : 'text-dim'}>
                    <td className="py-1 pr-3 font-bold">{x.name}</td>
                    <td className="py-1 pr-3">{x.capacity}/min</td>
                    <td className="py-1 pr-3">{x.delay ? `${Math.round(x.delay * 60)} s` : 'open now'}</td>
                    <td className="py-1 pr-3 font-bold">{x.people}</td>
                    <td className="py-1 pr-3">{x.minutes ? mmss(x.minutes * 60) : '-'}</td>
                    <td className="py-1 pr-3 text-muted">{a.proportional.allocation[i]?.people ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px]">
            <Pair k="DP clearance (makespan)" v={mmss(a.dp.clearance * 60)} />
            <Pair k="Proportional clearance" v={mmss(a.proportional.clearance * 60)} />
            <Pair k="Improvement" v={mmss(Math.max(0, (a.proportional.clearance - a.dp.clearance) * 60))} />
            <Pair k="States / transitions" v={`${a.dp.stats.states} / ${a.dp.stats.transitions}`} />
            <Pair k="Block size" v={`${a.dp.stats.blockSize} people`} />
            <Pair k="Blocks to place" v={a.dp.stats.blocks} />
          </dl>
          <DpRecurrence
            state="dp[j][p] = smallest achievable clearance time using exits j..m-1 for p remaining blocks"
            transition="dp[j][p] = min over a=0..p of  max( delay_j + a*block/cap_j ,  dp[j+1][p-a] )"
            base="dp[m][0] = 0;  dp[m][p] = infinity for p > 0 (people with nowhere to go)"
            answer={`dp[0][${a.dp.stats.blocks}] = ${a.dp.clearance.toFixed(2)} minutes`}
          />
          <p className="mt-2 text-[12px] leading-snug text-muted">
            Queues drain in parallel, so the site is clear when the LAST exit finishes &mdash; a makespan objective. The
            proportional split ignores opening delays, which is why the DP can beat it whenever the delays differ.
          </p>
          {(a.proportional.clearance - a.dp.clearance) * 60 <= 1 && (
            <p className="mt-1 text-[12px] leading-snug text-crit">
              On this frame the two agree. That is the honest result, not a failure: the usable exits have the same capacity
              and no opening delay, so an even split is already optimal and there is nothing for the DP to improve. Its
              advantage appears when capacities or opening delays differ &mdash; for instance once a plan opens a closed gate,
              which carries a delay the proportional split cannot see.
            </p>
          )}
        </>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- backtracking

function BacktrackingSection({ decision }) {
  const w = decision.whatIf
  return (
    <Panel id="backtracking">
      {!decision.candidates.length ? (
        <p className="text-[13px] text-muted">No interventions are warranted, so there are no combinations to explore.</p>
      ) : !w ? (
        <p className="text-[13px] text-muted">
          Run the search from the Decision tab. With {decision.candidates.length} candidate actions the tree has 2
          <sup>{decision.candidates.length}</sup> = <span className="num font-bold">{2 ** decision.candidates.length}</span>{' '}
          leaves, and each kept leaf costs a full max-flow evaluation, so it runs on request.
        </p>
      ) : (
        <>
          <dl className="num grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-3">
            <Pair k="Decisions" v={decision.candidates.length} />
            <Pair k="Search space" v={`2^${decision.candidates.length} = ${w.stats.searchSpace}`} />
            <Pair k="Nodes visited" v={w.stats.nodesVisited} />
            <Pair k="Plans evaluated" v={w.stats.leavesEvaluated} />
            <Pair k="Pruned by bound" v={w.stats.prunedByBound} />
            <Pair k="Pruned by budget" v={w.stats.prunedByBudget} />
            <Pair k="Pruned by staff" v={w.stats.prunedByStaff} />
            <Pair k="Rejected as unsafe" v={w.stats.rejectedUnsafe} />
            <Pair k="Max depth reached" v={w.stats.maxDepth} />
          </dl>
          <p className="num mt-2 text-[13px]">
            Best plan: <span className="font-bold">{w.best.subset.map((s) => s.label).join(' + ') || 'do nothing'}</span> &mdash;
            queue time {mmss(w.baseline.evacSeconds)} &rarr; <span className="font-bold text-crit">{mmss(w.best.evacSeconds)}</span> at cost{' '}
            {w.best.cost} of {decision.limits.effortBudget}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-muted">{algorithmInfo('backtracking').pruning}</p>
          <p className="mt-1 text-[12px] leading-snug text-crit">{algorithmInfo('backtracking').caveat}</p>
          <div className="mt-2 border-t border-line pt-2">
            <p className="label">Search trace</p>
            <ol className="num mt-1 max-h-[280px] space-y-0.5 overflow-y-auto scroll-thin text-[11px]">
              {w.explored.map((e, i) => (
                <li key={i} style={{ paddingLeft: `${e.depth * 10}px` }} className={e.pruned ? 'text-dim' : ''}>
                  {'|- '}
                  [{e.ids.join(', ') || 'empty'}]{' '}
                  {e.pruned ? (
                    <span className="text-warn">pruned: {e.pruned}{e.bound != null ? ` (bound ${Math.round(e.bound)}s cannot beat ${Math.round(e.best)}s)` : ''}</span>
                  ) : (
                    <>
                      {mmss(e.evacSeconds)} {e.outcome === 'new best' && <span className="font-bold text-crit">new best</span>}
                    </>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- data structures

function StructuresSection({ decision }) {
  const rows = [
    ['graph', `${decision.graph.nodeCount} nodes, ${decision.graph.edgeCount} edges, average degree ${decision.graph.averageDegree().toFixed(1)}`, 'Dijkstra, BFS, DFS, the flow network'],
    ['minHeap', `${decision.route?.stats.heap?.pushes ?? 0} pushes, ${decision.route?.stats.heap?.pops ?? 0} pops, ${decision.route?.stats.heap?.comparisons ?? 0} comparisons last run`, "Dijkstra's priority queue"],
    ['queue', `peak ${decision.reach.stats.maxQueueSize ?? 0} entries last run`, 'BFS frontier, and the augmenting-path search inside max flow'],
    ['stack', 'depth bounded by the graph, not the call stack', 'DFS frontier'],
  ]
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <span className="label">Data structures, measured on the live graph</span>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="label border-b border-line-strong text-left">
                {['Structure', 'Operations', 'Live measurement', 'Used by'].map((h) => (
                  <th key={h} className="px-3 py-1 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(([id, measured, usedBy]) => {
                const a = algorithmInfo(id)
                return (
                  <tr key={id}>
                    <td className="px-3 py-1.5 font-bold">{a.name}</td>
                    <td className="num px-3 py-1.5">{a.time.worst}</td>
                    <td className="num px-3 py-1.5">{measured}</td>
                    <td className="px-3 py-1.5 text-muted">{usedBy}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      {rows.map(([id]) => {
        const a = algorithmInfo(id)
        return (
          <section key={id} className="panel">
            <div className="panel-head">
              <span className="label">{a.name}</span>
              <span className="num ml-auto text-[11px] text-dim">{a.space} space</span>
            </div>
            <div className="px-3 py-2 text-[12.5px] leading-snug">
              <p className="text-muted">{a.why}</p>
              <p className="mt-1 text-dim">Alternative considered: {a.notInstead}</p>
            </div>
          </section>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------- benchmark

function BenchmarkSection() {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [what, setWhat] = useState('sorting')

  const run = () => {
    setBusy(true)
    // Yield a frame so the button shows its busy state before the main thread blocks.
    setTimeout(() => {
      try {
        setRows(what === 'sorting' ? runSortBenchmark() : runGraphBenchmark())
      } finally {
        setBusy(false)
      }
    }, 20)
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">Performance experiment</span>
        <div className="ml-auto flex items-center gap-2">
          <select value={what} onChange={(e) => setWhat(e.target.value)} className="border border-line-strong bg-bg px-1.5 py-0.5 text-[11px]" style={{ borderRadius: 2 }}>
            <option value="sorting">Merge sort vs quick sort</option>
            <option value="graph">BFS vs Dijkstra on a station-shaped graph</option>
          </select>
          <button className="btn btn-primary" onClick={run} disabled={busy}>
            {busy ? 'Running...' : 'Run benchmark'}
          </button>
        </div>
      </div>
      <div className="px-3 py-2">
        <p className="text-[12.5px] leading-snug text-muted">
          Synthetic inputs, because a station layout has a dozen zones and growth needs thousands. Inputs are generated from a
          fixed seed, so both algorithms see byte-identical data. Each size is timed five times and the median is reported, so
          one garbage-collection pause cannot dominate.
        </p>
        {!rows ? (
          <p className="mt-2 text-[12.5px] text-dim">Press Run to measure sizes {BENCHMARK_SIZES.join(', ')}.</p>
        ) : (
          <>
            <div className="mt-2 h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows.chart} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
                  <CartesianGrid stroke="#d6d4cd" />
                  <XAxis dataKey="n" type="number" scale="log" domain={['dataMin', 'dataMax']} ticks={BENCHMARK_SIZES} tick={AXIS} axisLine={{ stroke: '#111111' }} tickLine={false} />
                  <YAxis tick={AXIS} axisLine={{ stroke: '#111111' }} tickLine={false} width={48} label={{ value: 'ms', angle: -90, position: 'insideLeft', style: AXIS }} />
                  <Tooltip
                    contentStyle={{ background: '#f6f5f1', border: '1.5px solid #111111', borderRadius: 2, fontSize: 12 }}
                    formatter={(v, name) => [`${v} ms`, name]}
                    labelFormatter={(v) => `n = ${v}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {rows.series.map((s) => (
                    <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[s.key] ?? '#3d3c38'} strokeWidth={2} dot={{ r: 2.5 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="num mt-2 w-full text-[12px]">
                <thead>
                  <tr className="label border-b border-line-strong text-left">
                    <th className="py-1 pr-3 font-bold">Algorithm</th>
                    <th className="py-1 pr-3 font-bold">Theoretical complexity</th>
                    <th className="py-1 pr-3 font-bold">n</th>
                    <th className="py-1 pr-3 font-bold">Observed runtime</th>
                    <th className="py-1 pr-3 font-bold">Time ratio vs previous n</th>
                    <th className="py-1 pr-3 font-bold">Counted operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.series.flatMap((s) =>
                    s.rows.map((r, i) => (
                      <tr key={`${s.key}-${r.n}`}>
                        <td className="py-1 pr-3">{i === 0 ? s.label : ''}</td>
                        <td className="py-1 pr-3 text-dim">{i === 0 ? s.complexity : ''}</td>
                        <td className="py-1 pr-3">{r.n}</td>
                        <td className="py-1 pr-3">{r.ms.toFixed(3)} ms</td>
                        <td className="py-1 pr-3">{r.ratio ? `${r.ratio.toFixed(2)}x` : '-'}</td>
                        <td className="py-1 pr-3">{r.operations?.toLocaleString() ?? '-'}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] leading-snug text-crit">
              These are <b>observed runtimes</b>, not a proof of the <b>theoretical complexity</b>. Big-O describes growth as n
              goes to infinity with constants discarded; no finite set of measurements can establish it. What the ratio column
              can show is whether the observed growth is consistent with the analysis: an O(n log n) algorithm should take
              slightly more than 2x longer when n doubles, and an O(n&sup2;) one about 4x. The counted-operations column is
              exact and machine independent, so it is the stronger evidence.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

function runSortBenchmark() {
  const cmp = (a, b) => b.score - a.score
  const { perAlgorithm } = compare(
    [
      { key: 'merge', label: 'Merge sort (random input)', makeInput: (n) => randomZoneScores(n), fn: (input) => mergeSort(input, cmp) },
      { key: 'quick', label: 'Quick sort (random input)', makeInput: (n) => randomZoneScores(n), fn: (input) => quickSort(input, cmp) },
      // Quick sort with last-element pivoting on sorted input: the documented O(n^2) worst case.
      { key: 'quickWorst', label: 'Quick sort, last-element pivot on sorted input', makeInput: (n) => sortedZoneScores(Math.min(n, 2000)), fn: (input) => quickSort(input, cmp, { pivot: 'last' }) },
    ],
    BENCHMARK_SIZES,
    { runs: 5, warmup: 1 },
  )
  return {
    chart: BENCHMARK_SIZES.map((n, i) => ({ n, merge: round(perAlgorithm[0].rows[i].ms), quick: round(perAlgorithm[1].rows[i].ms), quickWorst: round(perAlgorithm[2].rows[i].ms) })),
    series: [
      { key: 'merge', label: 'Merge sort', complexity: 'O(n log n) always', rows: perAlgorithm[0].rows },
      { key: 'quick', label: 'Quick sort, median-of-three', complexity: 'O(n log n) average', rows: perAlgorithm[1].rows },
      { key: 'quickWorst', label: 'Quick sort, last pivot, sorted input (capped at n=2000)', complexity: 'O(n^2) worst case', rows: perAlgorithm[2].rows },
    ],
  }
}

function runGraphBenchmark() {
  const sizes = [100, 500, 1000, 5000, 10000]
  const { perAlgorithm } = compare(
    [
      { key: 'bfs', label: 'BFS', makeInput: (n) => randomStationGraph(n, 11, Graph), fn: (g) => bfs(g, g.nodeIds()[0]) },
      { key: 'dijkstra', label: 'Dijkstra', makeInput: (n) => randomStationGraph(n, 11, Graph), fn: (g) => dijkstra(g, g.nodeIds()[0]) },
    ],
    sizes,
    { runs: 3, warmup: 1 },
  )
  return {
    chart: sizes.map((n, i) => ({ n, bfs: round(perAlgorithm[0].rows[i].ms), dijkstra: round(perAlgorithm[1].rows[i].ms) })),
    series: [
      { key: 'bfs', label: 'BFS (queue)', complexity: 'O(V + E)', rows: perAlgorithm[0].rows },
      { key: 'dijkstra', label: 'Dijkstra (min-heap)', complexity: 'O((V + E) log V)', rows: perAlgorithm[1].rows },
    ],
  }
}

const round = (v) => Number(v.toFixed(4))

// ---------------------------------------------------------------- shared pieces

function ComplexityTable() {
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">Algorithm mapping and complexity</span>
        <span className="ml-auto text-[11px] text-dim">Analytical results, not measurements</span>
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="label border-b border-line-strong text-left">
              {['DAA concept', 'Family', 'Sentinel application', 'Best', 'Average', 'Worst', 'Space'].map((h) => (
                <th key={h} className="px-3 py-1 font-bold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {mappingTable().map((row) => {
              const a = ALGORITHMS[row.id]
              return (
                <tr key={row.id}>
                  <td className="px-3 py-1.5 font-bold whitespace-nowrap">{a.name}</td>
                  <td className="px-3 py-1.5 text-dim whitespace-nowrap">{a.family}</td>
                  <td className="px-3 py-1.5 text-muted">{a.problem}</td>
                  <td className="num px-3 py-1.5 whitespace-nowrap">{a.time.best}</td>
                  <td className="num px-3 py-1.5 whitespace-nowrap">{a.time.average}</td>
                  <td className="num px-3 py-1.5 whitespace-nowrap">{a.time.worst}</td>
                  <td className="num px-3 py-1.5 whitespace-nowrap">{a.space}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Panel({ id, head, children }) {
  const a = algorithmInfo(id)
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">{a.name}</span>
        <span className="text-[11px] text-dim">{a.family}</span>
        {head}
      </div>
      <div className="border-b border-line px-3 py-1.5">
        <p className="text-[12px] leading-snug">
          <span className="font-bold">Problem:</span> {a.problem}
        </p>
        <p className="num mt-0.5 text-[11px] text-dim">
          Time {a.time.best} best / {a.time.average} average / {a.time.worst} worst &middot; Space {a.space}
          {a.recurrence ? ` · ${a.recurrence}` : ''}
        </p>
      </div>
      <div className="px-3 py-2">{children}</div>
    </section>
  )
}

function DpRecurrence({ state, transition, base, answer }) {
  return (
    <dl className="num mt-2 space-y-0.5 border-l-2 border-line-strong bg-raised px-3 py-2 text-[11.5px]">
      {[['State', state], ['Transition', transition], ['Base case', base], ['Answer', answer]].map(([k, v]) => (
        <div key={k} className="flex flex-wrap gap-x-2">
          <dt className="label w-[76px] shrink-0">{k}</dt>
          <dd className="min-w-0 flex-1">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The knapsack table, trimmed to a readable width. Values are the real dp array. */
function DpTable({ table, rowLabels }) {
  const cols = table[0].length
  const step = Math.max(1, Math.ceil(cols / 14))
  const shown = Array.from({ length: Math.ceil(cols / step) }, (_, i) => i * step).filter((b) => b < cols)
  const last = cols - 1
  if (!shown.includes(last)) shown.push(last)
  return (
    <div className="mt-2 overflow-x-auto scroll-thin">
      <p className="label mb-1">DP table: rows are interventions considered, columns are the effort budget</p>
      <table className="num text-[11px]">
        <thead>
          <tr>
            <th className="border border-line px-1.5 py-0.5 text-left font-bold">i \ b</th>
            {shown.map((b) => (
              <th key={b} className="border border-line px-1.5 py-0.5 font-bold">{b}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.map((row, i) => (
            <tr key={i}>
              <th className="whitespace-nowrap border border-line px-1.5 py-0.5 text-left font-bold">
                {i === 0 ? '0 (base)' : `${i}. ${rowLabels[i - 1] ?? ''}`}
              </th>
              {shown.map((b) => (
                <td key={b} className="border border-line px-1.5 py-0.5 text-right" style={i === table.length - 1 && b === last ? { background: '#b02a2222', fontWeight: 700 } : undefined}>
                  {row[b]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Pair({ k, v }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-dim">{k}</dt>
      <dd className="font-bold">{v}</dd>
    </div>
  )
}
