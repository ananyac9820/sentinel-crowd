import { useEffect, useMemo, useRef, useState } from 'react'
import CrowdGraphView from './CrowdGraphView.jsx'
import { decorate, stepCount } from './decorations.js'
import { ComplexityBox } from './AlgorithmAnalysis.jsx'
import { buildCrowdGraph, SOURCE } from '../../engine/crowdGraphBuilder.js'
import { edgeLabel, formatSeconds } from '../../engine/decisionEngine.js'
import { COST_WEIGHTS } from '../../engine/stationModel.js'
import { EMERGENCY_NAME, EMERGENCY_T } from '../../engine/emergencyScenario.js'
import { LEVELS } from '../../lib/risk.js'
import { PauseIcon, PlayIcon, RestartIcon } from '../Icons.jsx'

// Demo order. Each step shows one part of the pipeline on the same crowd graph.
export const DAA_STEPS = [
  { key: 'state', label: 'Crowd state', algos: ['mergeSort', 'binarySearch'] },
  { key: 'graph', label: 'Graph', algos: ['graph'] },
  { key: 'bfs', label: 'BFS', algos: ['bfs'] },
  { key: 'dfs', label: 'DFS', algos: ['dfs'] },
  { key: 'dijkstra', label: 'Dijkstra', algos: ['dijkstra'] },
  { key: 'flow', label: 'Max flow + min cut', algos: ['maxFlow', 'minCut'] },
  { key: 'greedy', label: 'Greedy plan', algos: ['greedy', 'backtracking'] },
  { key: 'result', label: 'Recommendation', algos: [] },
]

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const fmt = (v) => (v === Infinity ? '∞' : Math.round(v * 10) / 10)

export default function DaaEngineView({ analysis, live, mode, simT, snap, planApplied, onLoadEmergency, onRun, onApplyPlan }) {
  const [view, setView] = useState('state')
  const [cursor, setCursor] = useState(Infinity)
  const [playing, setPlaying] = useState(false)
  const a = analysis?.status === 'ok' ? analysis : null
  const total = stepCount(view, a)
  const shown = Math.min(cursor, total)

  // Before any analysis, show the graph being rebuilt from the live crowd state every tick.
  const liveGraph = useMemo(() => (analysis ? null : buildCrowdGraph(live)), [analysis, live])

  useEffect(() => {
    setCursor(Infinity)
    setPlaying(false)
  }, [view, analysis])

  // Step-by-step replay.
  useEffect(() => {
    if (!playing) return
    if (shown >= total) return setPlaying(false)
    const id = setTimeout(() => setCursor(shown + 1), 650)
    return () => clearTimeout(id)
  }, [playing, shown, total])

  // Presenter keys on this tab: left / right arrows move between steps.
  const viewRef = useRef(view)
  viewRef.current = view
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return
      const i = DAA_STEPS.findIndex((s) => s.key === viewRef.current)
      if (e.key === 'ArrowRight' && i < DAA_STEPS.length - 1) setView(DAA_STEPS[i + 1].key)
      if (e.key === 'ArrowLeft' && i > 0) setView(DAA_STEPS[i - 1].key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const deco = a ? decorate(view, a, shown) : { graph: analysis?.graph ?? liveGraph, nodeDeco: {}, edgeDeco: {} }
  const stepIndex = DAA_STEPS.findIndex((s) => s.key === view)

  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0 lg:overflow-y-auto scroll-thin">
      <ScenarioBar analysis={analysis} mode={mode} simT={simT} snap={snap} onLoadEmergency={onLoadEmergency} onRun={onRun} />
      {a && <SummaryStrip a={a} />}

      <nav className="flex flex-wrap gap-1.5" aria-label="Analysis steps">
        {DAA_STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setView(s.key)}
            disabled={!a && i > 1}
            className={`btn ${view === s.key ? 'btn-primary' : ''}`}
            aria-pressed={view === s.key}
            title={!a && i > 1 ? 'Run the DAA analysis first' : `Step ${i + 1}`}
          >
            <span className="num opacity-70">{i + 1}</span> {s.label}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-dim max-lg:hidden">← → keys move between steps</span>
      </nav>

      <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="panel flex flex-col">
          <div className="panel-head">
            <span className="label">{a ? `${stepIndex + 1}. ${DAA_STEPS[stepIndex].label}` : 'Crowd graph (live)'}</span>
            <span className="text-[12px] text-muted">
              {deco.graph ? `V = ${deco.graph.V}, E = ${deco.graph.E}` : ''}
              {a && (view === 'greedy' || view === 'result') ? ' · graph with the plan applied' : ''}
            </span>
            {total > 0 && (
              <div className="ml-auto flex items-center gap-1.5">
                <button className="btn" onClick={() => (shown >= total ? (setCursor(0), setPlaying(true)) : setPlaying((p) => !p))} title="Replay the algorithm step by step">
                  {playing ? <PauseIcon size={12} /> : shown >= total ? <RestartIcon size={12} /> : <PlayIcon size={12} />}
                  {playing ? 'Pause' : shown >= total ? 'Replay' : 'Play'}
                </button>
                <button className="btn" disabled={shown <= 0} onClick={() => (setPlaying(false), setCursor(Math.max(0, shown - 1)))}>
                  Prev
                </button>
                <button className="btn" disabled={shown >= total} onClick={() => (setPlaying(false), setCursor(shown + 1))}>
                  Next
                </button>
                <span className="num w-[52px] text-right text-[12px] text-muted">
                  {shown}/{total}
                </span>
              </div>
            )}
          </div>
          {/* Sized to fit a 1080p / 900px projector screen together with the summary above it. */}
          <div className="p-2" style={{ height: 'clamp(340px, calc(100vh - 360px), 620px)' }}>
            <CrowdGraphView graph={deco.graph} nodeDeco={deco.nodeDeco} edgeDeco={deco.edgeDeco} />
          </div>
          <Legend view={a ? view : 'live'} />
        </section>

        <aside className="panel flex flex-col">
          {!a ? (
            <Intro analysis={analysis} graph={deco.graph} />
          ) : (
            <StepDetail view={view} a={a} cursor={shown} total={total} planApplied={planApplied} onApplyPlan={onApplyPlan} mode={mode} />
          )}
        </aside>
      </div>

      {a && <BeforeAfter a={a} snap={snap} planApplied={planApplied} mode={mode} simT={simT} onApplyPlan={onApplyPlan} />}
    </div>
  )
}

function ScenarioBar({ analysis, mode, simT, snap, onLoadEmergency, onRun }) {
  const lvl = LEVELS[snap.overall]
  return (
    <section className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <div className="min-w-0">
        <p className="label">DAA decision engine</p>
        <p className="text-[12px] text-muted">
          Computer vision says <b>what is happening</b>; these algorithms decide <b>what to do about it</b>.
        </p>
      </div>
      <div className="num text-[12px] text-muted">
        {mode === 'sim' ? `Simulation · CAM-03 · ${mmss(simT)}` : 'Live detection'} · {snap.people} people ·{' '}
        <span style={{ color: lvl.color }} className="font-bold">
          {lvl.label}
        </span>
        {analysis && <span className="ml-2 text-dim">analysed at {analysis.mode === 'sim' ? mmss(analysis.at) : 'live frame'}</span>}
      </div>
      <div className="ml-auto flex flex-wrap gap-2">
        <button className="btn" onClick={onLoadEmergency} title={`Replays the scripted station scenario to ${mmss(EMERGENCY_T)} with no automatic response. Same result every time.`}>
          Load {EMERGENCY_NAME}
        </button>
        <button className="btn btn-primary h-8 px-4 text-[13px]" onClick={onRun}>
          Run DAA Analysis
        </button>
      </div>
    </section>
  )
}

function SummaryStrip({ a }) {
  const r = a.recommendation
  const items = [
    ['Critical zone', `${a.critical.name} · ${a.critical.density}%`],
    ['Safest route', r.route.join(' → ')],
    ['Maximum flow', `${a.capacity.maxFlow} people/min`],
    ['Bottleneck', r.bottleneck.join(', ')],
    ['Recommended action', r.actions.join(' + ') || 'None needed'],
    ['Expected improvement', `+${r.gainPct}% capacity · clearance −${r.timeCutPct}%`],
  ]
  return (
    <section className="panel border-l-[6px]" style={{ borderLeftColor: 'var(--color-crit)' }}>
      <div className="panel-head">
        <span className="label">DAA analysis complete</span>
        <span className="text-[12px] text-muted">{a.recommendation.headline}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2 md:grid-cols-3 xl:grid-cols-6">
        {items.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="label text-dim">{k}</dt>
            <dd className="num text-[13px] leading-snug">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Intro({ analysis, graph }) {
  return (
    <div className="space-y-3 px-3 py-3 text-[13px] leading-snug">
      <p className="label">How the crowd becomes a graph</p>
      {analysis && analysis.status !== 'ok' && <p className="border border-crit px-2 py-1.5 font-bold text-crit">{analysis.message}</p>}
      <ul className="list-disc space-y-1 pl-4 text-muted">
        <li>
          <b className="text-fg">Nodes</b>: camera zones (people, density, risk), exits and stairs from the site setup, the areas seen by the other station cameras, and one safe area.
        </li>
        <li>
          <b className="text-fg">Edges</b>: walkable connections with distance, capacity (people/min), congestion and risk.
        </li>
        <li>This graph is rebuilt from the live crowd state on every tick. Closed gates are dashed (capacity 0).</li>
      </ul>
      {graph && (
        <p className="num text-[12px]">
          Right now: V = {graph.V} nodes, E = {graph.E} directed edges.
        </p>
      )}
      <p className="text-muted">
        For the demo, press <b className="text-fg">Load {EMERGENCY_NAME}</b>, then <b className="text-fg">Run DAA Analysis</b>.
      </p>
    </div>
  )
}

function Legend({ view }) {
  const items = {
    live: [['#9c9a93', 'calm'], ['#b4561a', 'congested'], ['#b02a22', 'jammed'], ['dash', 'closed']],
    state: [['badge', 'rank by merge sort']],
    graph: [['#9c9a93', 'calm'], ['#b4561a', 'congested'], ['#b02a22', 'jammed'], ['dash', 'closed']],
    bfs: [['badge', 'visit order'], ['#111111', 'BFS tree'], ['ring', 'unreachable exit']],
    dfs: [['#b02a22', 'danger cluster (DFS tree)']],
    dijkstra: [['#111111', 'safest route (cost)'], ['dashred', 'shortest distance'], ['badge', 'settle order, d = cost']],
    flow: [['#111111', 'flow / capacity'], ['#b02a22', 'min cut'], ['dashwarn', 'closed, crosses the cut']],
    greedy: [['#2f7a45', 'capacity added by plan'], ['#b02a22', 'new min cut']],
    result: [['#111111', 'recommended route'], ['#2f7a45', 'opened by plan']],
  }[view]
  if (!items) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-3 py-1.5 text-[11px] text-muted">
      {items.map(([k, text]) => (
        <span key={text} className="inline-flex items-center gap-1.5">
          {k === 'badge' ? (
            <span className="h-3 w-3 rounded-full bg-fg" />
          ) : k === 'ring' ? (
            <span className="h-3 w-3 border-2 border-crit" />
          ) : k.startsWith('dash') ? (
            <span className="w-5 border-t-2 border-dashed" style={{ borderColor: k === 'dashred' ? '#b02a22' : k === 'dashwarn' ? '#b4561a' : '#9c9a93' }} />
          ) : (
            <span className="h-[3px] w-5" style={{ background: k }} />
          )}
          {text}
        </span>
      ))}
      <span className="ml-auto text-dim">Hover any node or edge for its numbers</span>
    </div>
  )
}

function StepDetail({ view, a, cursor, total, planApplied, onApplyPlan, mode }) {
  const step = DAA_STEPS.find((s) => s.key === view)
  const body = {
    state: <StateDetail a={a} />,
    graph: <GraphDetail a={a} />,
    bfs: <BfsDetail a={a} cursor={cursor} total={total} />,
    dfs: <DfsDetail a={a} cursor={cursor} total={total} />,
    dijkstra: <DijkstraDetail a={a} cursor={cursor} total={total} />,
    flow: <FlowDetail a={a} cursor={cursor} total={total} />,
    greedy: <GreedyDetail a={a} />,
    result: <ResultDetail a={a} planApplied={planApplied} onApplyPlan={onApplyPlan} mode={mode} />,
  }[view]
  return (
    <>
      <div className="flex-1 space-y-3 px-3 py-3 text-[13px] leading-snug">{body}</div>
      {step.algos.map((k) => (
        <ComplexityBox key={k} algoKey={k} timing={a.timings[k]} />
      ))}
    </>
  )
}

const Problem = ({ children }) => (
  <p>
    <span className="label mr-1.5">Problem</span>
    {children}
  </p>
)
const Result = ({ label = 'Result', children }) => (
  <div>
    <p className="label mb-0.5">{label}</p>
    <div className="num text-[13px]">{children}</div>
  </div>
)
const Path = ({ ids, label }) => <span>{ids.map(label).join(' → ')}</span>

function StateDetail({ a }) {
  const { before, ranked, bands } = a.ranking
  const merges = a.mergeTrace.filter((t) => t.type === 'merge').length
  const c = a.critical
  return (
    <>
      <Problem>Which zones are most dangerous right now?</Problem>
      <div className="grid grid-cols-2 gap-3">
        <RankList title="Camera order (input)" items={before} />
        <RankList title="After merge sort" items={ranked} highlight />
      </div>
      <p className="text-[12px] text-muted">
        Merge sort: {a.mergeTrace.length - merges} divides and {merges} merges for n = {before.length} zones. Sorted by density, then people, then turbulence.
      </p>
      <Result label="Binary search: alert band of the top zone">
        <p>
          {c.name}: {c.perArea} people per zone area, thresholds [{bands.map((b) => b.min).join(', ')}]
        </p>
        <p className="text-[12px] text-muted">
          Probes:{' '}
          {c.probes.map((p, i) => (
            <span key={i}>
              {i > 0 && ' → '}[{p.index}] {p.min} {p.ok ? '≤' : '>'} {c.perArea}
            </span>
          ))}
        </p>
        <p className="font-bold" style={{ color: LEVELS[c.band.level].color }}>
          Found: {c.band.label}
        </p>
      </Result>
    </>
  )
}

function RankList({ title, items, highlight }) {
  return (
    <div>
      <p className="label mb-1 text-dim">{title}</p>
      <ol className="num space-y-0.5 text-[12px]">
        {items.map((z, i) => (
          <li key={z.id} className="flex justify-between gap-2" style={{ color: highlight && i === 0 ? 'var(--color-crit)' : undefined, fontWeight: highlight && i === 0 ? 700 : undefined }}>
            <span>
              {highlight ? `${i + 1}. ` : ''}
              {z.name}
            </span>
            <span>{z.density}%</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function GraphDetail({ a }) {
  const g = a.graph
  const kinds = {}
  for (const n of g.nodes.values()) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1
  const out = g.neighbours(a.critical.id)
  return (
    <>
      <Problem>Represent the station so that algorithms can reason about it.</Problem>
      <p className="num text-[12px]">
        V = {g.V}: {kinds.zone ?? 0} zones, {(kinds.exit ?? 0) + (kinds.stairs ?? 0)} exits/stairs, {kinds.area ?? 0} station areas, 1 safe area. E = {g.E} directed edges.
      </p>
      <div className="border border-line bg-bg px-2 py-1.5">
        <p className="label mb-0.5">Edge cost (used by Dijkstra)</p>
        <p className="num text-[12px]">
          cost = {COST_WEIGHTS.distance} × distance(m) + {COST_WEIGHTS.congestion} × congestion(%) + {COST_WEIGHTS.risk} × risk(0-100)
        </p>
        <p className="mt-1 text-[11px] text-dim">Congestion and risk are measured at the edge’s destination by the camera. Capacity drops as a zone approaches crush density.</p>
      </div>
      <div>
        <p className="label mb-1">Adjacency list of {a.critical.name}</p>
        <table className="num w-full text-[11.5px]">
          <thead className="text-dim">
            <tr className="text-left">
              <th className="font-semibold">to</th>
              <th className="text-right font-semibold">m</th>
              <th className="text-right font-semibold">cong.</th>
              <th className="text-right font-semibold">risk</th>
              <th className="text-right font-semibold">cap/min</th>
              <th className="text-right font-semibold">cost</th>
            </tr>
          </thead>
          <tbody>
            {out.map((e) => (
              <tr key={e.id}>
                <td>{a.label(e.to)}</td>
                <td className="text-right">{e.distance}</td>
                <td className="text-right">{Math.round(e.congestion)}%</td>
                <td className="text-right">{e.risk}</td>
                <td className="text-right">{fmt(e.capacity)}</td>
                <td className="text-right font-bold">{e.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function BfsDetail({ a, cursor, total }) {
  const { order, hops, blockedExits, reachableExits, steps } = a.reach
  const step = steps[cursor - 1]
  return (
    <>
      <Problem>Which exits can people in {a.critical.name} still reach?</Problem>
      <Result label="Traversal (visit order)">
        <Path ids={order.slice(0, cursor)} label={a.label} />
      </Result>
      {cursor < total && step && (
        <p className="num text-[12px] text-muted">
          Dequeued {a.label(step.node)} (hop {step.hop}); queue: [{step.queue.map(a.label).join(', ')}]
        </p>
      )}
      <Result label="Reachable exits">
        {reachableExits.map((id) => `${a.label(id)} (${hops.get(id)} hops)`).join(', ') || 'none'}
      </Result>
      <Result label="Not reachable">
        <span className="text-crit">{blockedExits.map(a.label).join(', ') || 'none'}</span>
      </Result>
      {blockedExits.length > 0 && <p className="text-[12px] text-muted">These exits are closed (capacity 0), so BFS cannot cross into them. Opening one is a candidate intervention.</p>}
    </>
  )
}

function DfsDetail({ a, cursor, total }) {
  const { order, steps } = a.cluster
  const step = steps[cursor - 1]
  return (
    <>
      <Problem>Which connected zones are affected by the danger at {a.critical.name}?</Problem>
      <p className="text-[12px] text-muted">DFS from {a.critical.name}, entering only zones at WATCH or above.</p>
      <Result label="Danger cluster (DFS order)">
        <span className="text-crit">
          <Path ids={order.slice(0, cursor)} label={a.label} />
        </span>
      </Result>
      {cursor < total && step && (
        <p className="num text-[12px] text-muted">
          Expanded {a.label(step.node)}; stack: [{step.stack.map(a.label).join(', ')}]
        </p>
      )}
      <p>
        {order.length} zone{order.length === 1 ? '' : 's'} with {order.reduce((s, id) => s + (a.graph.getNode(id).people ?? 0), 0)} people must be managed as one area.
      </p>
    </>
  )
}

function DijkstraDetail({ a, cursor, total }) {
  const { safest, shortest } = a.route
  const step = safest.steps[cursor - 1]
  const differs = safest.path.join() !== shortest.path.join()
  return (
    <>
      <Problem>Safest evacuation route from {a.critical.name}.</Problem>
      {cursor < total && step && (
        <p className="num text-[12px] text-muted">
          Settled {a.label(step.node)} at cost {fmt(step.dist)}
          {step.relaxed.length ? `; relaxed ${step.relaxed.map((r) => `${a.label(r.to)}=${fmt(r.dist)}`).join(', ')}` : ''}
        </p>
      )}
      <table className="num w-full text-[12px]">
        <thead className="text-left text-dim">
          <tr>
            <th className="font-semibold" />
            <th className="text-right font-semibold">cost</th>
            <th className="text-right font-semibold">m</th>
            <th className="text-right font-semibold">cong.</th>
            <th className="text-right font-semibold">risk</th>
          </tr>
        </thead>
        <tbody>
          <tr className="font-bold">
            <td>Safest (by cost)</td>
            <td className="text-right">{safest.cost}</td>
            <td className="text-right">{safest.distance}</td>
            <td className="text-right">{Math.round(safest.congestion)}%</td>
            <td className="text-right">{safest.risk}</td>
          </tr>
          <tr className="text-crit">
            <td>Shortest (by metres)</td>
            <td className="text-right">{shortest.cost}</td>
            <td className="text-right">{shortest.distance}</td>
            <td className="text-right">{Math.round(shortest.congestion)}%</td>
            <td className="text-right">{shortest.risk}</td>
          </tr>
        </tbody>
      </table>
      <Result label="Selected route">
        <Path ids={safest.path} label={a.label} />
      </Result>
      <p>
        <span className="label mr-1.5">Reason</span>
        {differs
          ? `The physically shorter route (${shortest.distance} m via ${shortest.path.slice(1, -1).map(a.label).join(', ')}) reaches ${Math.round(shortest.congestion)}% congestion and risk ${shortest.risk}. The selected route is ${fmt(safest.distance - shortest.distance)} m longer but costs ${fmt(shortest.cost - safest.cost)} less.`
          : 'The shortest route is also the least congested, so both costs agree.'}
      </p>
    </>
  )
}

function FlowDetail({ a, cursor, total }) {
  const { flow, cut, maxFlow, evacSeconds } = a.capacity
  const route = (p) => p.path.filter((id) => id !== SOURCE).map(a.label).join(' → ')
  return (
    <>
      <Problem>How many people per minute can the station evacuate, and what limits it?</Problem>
      <p className="text-[12px] text-muted">A virtual source feeds every occupied zone; the sink is the safe area. Capacity = people/min that can pass safely.</p>
      <ol className="num space-y-1 text-[12px]">
        {flow.augmentingPaths.slice(0, Math.max(cursor, 0)).map((p, i) => (
          <li key={i} className={i === cursor - 1 && cursor < total ? 'font-bold text-crit' : ''}>
            Iteration {i + 1}: {route(p)} · flow +{fmt(p.bottleneck)} (total {fmt(p.total)})
          </li>
        ))}
      </ol>
      {cursor >= total && (
        <>
          <Result label="Maximum flow">
            <span className="text-[20px] font-bold">{maxFlow}</span> people/min · clears {a.people} people in about {formatSeconds(evacSeconds)}
          </Result>
          <Result label={`Min cut (bottleneck) · total ${fmt(cut.capacity)}/min = max flow`}>
            <ul className="space-y-0.5">
              {cut.cutEdges.map((e) => (
                <li key={e.id} className="text-crit">
                  CUT {edgeLabel(a.label, e)}: {fmt(e.capacity)}/min{e.kind === 'stairs' && e.risk ? ` (counter-flow ${e.risk} cuts the stairs’ capacity)` : ''}
                </li>
              ))}
            </ul>
          </Result>
          {cut.closedCrossing.length > 0 && (
            <p className="text-[12px]">
              <span className="font-bold text-warn">Closed edges crossing the cut:</span> {cut.closedCrossing.map((e) => edgeLabel(a.label, e)).join(', ')}. Opening one adds capacity directly across the bottleneck.
            </p>
          )}
        </>
      )}
    </>
  )
}

function GreedyDetail({ a }) {
  const { greedy, optimal, budget, targetSeconds } = a
  const sameAsOptimal = optimal && Math.abs(optimal.value - greedy.final) < 1e-6
  return (
    <>
      <Problem>Which actions should staff take first? Benefit = seconds of clearance time saved (re-measured with max flow); ratio = benefit ÷ cost.</Problem>
      <p className="num text-[12px] text-muted">
        Budget {budget} points · goal: clear within {targetSeconds} s · start {formatSeconds(greedy.initial)}
      </p>
      {greedy.steps.map((s, i) => (
        <div key={i}>
          <p className="label mb-0.5">
            Step {i + 1}: {s.chosen.label}
          </p>
          <table className="num w-full text-[11.5px]">
            <thead className="text-left text-dim">
              <tr>
                <th className="font-semibold">option</th>
                <th className="text-right font-semibold">cost</th>
                <th className="text-right font-semibold">saves</th>
                <th className="text-right font-semibold">ratio</th>
              </tr>
            </thead>
            <tbody>
              {s.considered.map((o) => (
                <tr key={o.candidate.id} className={o.candidate === s.chosen ? 'font-bold' : 'text-muted'}>
                  <td>
                    {o.candidate === s.chosen ? '✓ ' : ''}
                    {o.candidate.label}
                  </td>
                  <td className="pl-2 text-right">{o.candidate.cost}</td>
                  <td className="pl-2 text-right">{o.affordable ? `${fmt(o.gain)} s` : 'over budget'}</td>
                  <td className="pl-2 text-right">{o.affordable ? fmt(o.ratio) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="num mt-0.5 text-[11.5px]">
            Clearance {formatSeconds(s.before)} → {formatSeconds(s.after)}
          </p>
        </div>
      ))}
      <p className="text-[12px]">
        <span className="label mr-1.5">Stopped</span>
        {greedy.stopReason}. Plan cost {greedy.spent}/{budget}.
      </p>
      {greedy.steps.some((s) => s.considered.some((o) => o.affordable && o.gain <= 1e-9)) && (
        <p className="text-[12px] text-muted">Options that save 0 s only add capacity away from the min cut, so they cannot raise the maximum flow.</p>
      )}
      {optimal && (
        <div className="border border-line bg-bg px-2 py-1.5 text-[12px]">
          <p className="label mb-0.5">Check: backtracking (exact)</p>
          <p className="num">
            {optimal.explored} plans explored, {optimal.pruned} branches pruned (over budget), of {optimal.total} subsets.
          </p>
          <p>
            Best within budget: <b>{optimal.selected.map((c) => c.label).join(' + ') || 'no action'}</b> ({formatSeconds(optimal.value)}, cost {optimal.cost}).
          </p>
          <p className="mt-0.5 text-muted">
            {sameAsOptimal
              ? 'Greedy matched the optimum here.'
              : greedy.stopReason === 'Goal reached'
                ? `Greedy stopped once the ${targetSeconds} s goal was met, spending ${greedy.spent} instead of ${optimal.cost}. Backtracking maximises the benefit regardless of cost.`
                : 'Greedy chose a locally best step that blocked a better combination. Greedy is fast but not guaranteed optimal.'}
          </p>
        </div>
      )}
    </>
  )
}

function ResultDetail({ a, planApplied, onApplyPlan, mode }) {
  const r = a.recommendation
  return (
    <>
      <p className="label">Recommendation</p>
      <div className="space-y-1.5 border-l-4 border-crit pl-3">
        {r.text.map((line, i) => (
          <p key={i} className={i === 2 ? 'font-bold' : ''}>
            {line}
          </p>
        ))}
      </div>
      <ApplyButton a={a} planApplied={planApplied} onApplyPlan={onApplyPlan} mode={mode} />
      <p className="text-[12px] text-muted">Every number above is read from the analysis result: ranking, BFS, DFS, Dijkstra, Edmonds-Karp, min cut and the greedy plan.</p>
    </>
  )
}

function ApplyButton({ a, planApplied, onApplyPlan, mode }) {
  if (!a.plan.length) return <p className="text-[12px] text-muted">No action improves evacuation capacity within the budget.</p>
  if (mode !== 'sim') return <p className="text-[12px] text-muted">In Live mode staff carry out the plan; switch to Simulation to apply it and watch the effect.</p>
  if (planApplied) return <p className="num text-[12px] font-bold text-safe">Plan applied at {mmss(planApplied.at)}. The simulation is running with it.</p>
  return (
    <button className="btn btn-primary h-8 px-4 text-[13px]" onClick={() => onApplyPlan(a.plan)}>
      Apply recommended plan
    </button>
  )
}

function BeforeAfter({ a, snap, planApplied, mode, simT, onApplyPlan }) {
  const p = a.projection
  const rows = [
    ['People on platform', a.people, a.people],
    ['Evacuation capacity (max flow)', `${a.capacity.maxFlow} /min`, `${a.after.capacity.maxFlow} /min`],
    ['Estimated clearance', formatSeconds(a.capacity.evacSeconds), formatSeconds(a.after.capacity.evacSeconds)],
    ['Bottleneck (min cut)', a.capacity.cut.cutEdges.map((e) => edgeLabel(a.label, e)).join(', '), a.after.capacity.cut.cutEdges.map((e) => edgeLabel(a.label, e)).join(', ')],
    ['Route from ' + a.critical.name, `${a.route.safest.path.map(a.label).join(' → ')} (${a.route.safest.cost})`, `${a.after.route.path.map(a.label).join(' → ')} (${a.after.route.cost})`],
  ]
  if (p) rows.push([`Projected risk at ${mmss(p.without.at)} (existing risk model)`, <Risk key="b" r={p.without} />, <Risk key="a" r={p.withPlan} />])
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">Before / after optimisation</span>
        <span className="text-[12px] text-muted">Plan: {a.plan.map((id) => a.candidates.find((c) => c.id === id)?.label).join(' + ') || 'none'}</span>
        <div className="ml-auto">
          <ApplyButton a={a} planApplied={planApplied} onApplyPlan={onApplyPlan} mode={mode} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="label text-left">
              <th className="px-3 py-1.5 font-bold" />
              <th className="px-3 py-1.5 font-bold text-crit">Before</th>
              <th className="px-3 py-1.5 font-bold text-safe">After plan</th>
            </tr>
          </thead>
          <tbody className="num">
            {rows.map(([k, b, after]) => (
              <tr key={k} className="border-t border-line">
                <td className="px-3 py-1.5 font-sans text-[12px] text-muted">{k}</td>
                <td className="px-3 py-1.5">{b}</td>
                <td className="px-3 py-1.5 font-bold">{after}</td>
              </tr>
            ))}
            {planApplied && mode === 'sim' && (
              <tr className="border-t-2 border-line-strong">
                <td className="px-3 py-1.5 font-sans text-[12px] text-muted">Live simulation now ({mmss(simT)})</td>
                <td className="px-3 py-1.5">
                  <Risk r={planApplied.riskAt} />
                </td>
                <td className="px-3 py-1.5 font-bold">
                  <Risk r={{ score: snap.score, level: snap.overall }} /> · {snap.people} people
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-3 py-1.5 text-[11px] leading-snug text-dim">
        Capacity, clearance, bottleneck and route are recomputed on the graph with the plan applied. Clearance = people ÷ max flow (steady-flow estimate, ignores walking time).
        {p ? ' Projected risk replays the scripted scenario with Sentinel’s own risk model, with and without the plan.' : ''}
      </p>
    </section>
  )
}

function Risk({ r }) {
  const lvl = LEVELS[r.level]
  return (
    <span>
      {r.score}/100{' '}
      <span className="font-bold" style={{ color: lvl.color }}>
        {lvl.label}
      </span>
    </span>
  )
}

