import GraphView, { GraphLegend } from './GraphView.jsx'
import { mmss } from '../engine/crowdDecisionEngine.js'
import { algorithmInfo } from '../algorithms/analysis/complexity.js'

// The Decision tab: the algorithmic pipeline running on the live crowd state, stage by stage.
// Every number shown comes from the decision object the engine returned; this component does no
// computation of its own beyond formatting.

const LEGEND = [
  { color: '#b02a22', label: 'Safest route (Dijkstra)' },
  { color: '#9a7410', label: 'Shortest by distance', dashed: true },
  { color: '#b02a22', label: 'Minimum cut (bottleneck)', dashed: true },
  { color: '#2f7a45', label: 'Flow in use', square: true },
]

export default function DecisionPanel({ decision, onRunWhatIf, whatIfBusy, mode }) {
  if (!decision) return <div className="panel p-4 text-[13px] text-muted">Waiting for the first crowd reading.</div>

  const d = decision
  const r = d.recommendation
  const cutIds = d.flow.cut.cutEdges.map((e) => e.label?.edgeId).filter(Boolean)
  const flowEdges = new Map(d.flow.network.usedEdges().map((e) => [e.label?.edgeId, e.flow]).filter(([id]) => id))
  const regions = d.partition.region ? [{ rect: d.partition.region.rect, hot: true }] : null
  const nameOf = (id) => d.graph.getNode(id)?.name ?? id

  return (
    <div className="grid gap-3 [&>*]:min-w-0 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto scroll-thin">
        {/* ---- Recommendation: the output of the whole pipeline ---- */}
        <section className="panel">
          <div className="panel-head">
            <span className="label">Computed recommendation</span>
            <span className="ml-auto text-[11px] text-dim">
              {mode === 'sim' ? 'Simulation' : 'Live'} &middot; pipeline ran in {Object.values(d.timings).reduce((a, b) => a + b, 0).toFixed(1)} ms
            </span>
          </div>
          <div className="px-3 py-2">
            <p className="text-[15px] font-bold leading-snug">{r.headline}</p>
            <ul className="mt-1.5 space-y-1 text-[13px] leading-snug text-muted">
              {r.lines.map((line, i) => (
                <li key={i} className="flex gap-1.5">
                  <span aria-hidden="true" className="text-dim">
                    &bull;
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {r.actions.length > 0 && (
              <div className="mt-2 border-t border-line pt-2">
                <p className="label">Action order (greedy)</p>
                <ol className="mt-1 space-y-1 text-[13px]">
                  {r.actions.map((a, i) => (
                    <li key={a.label} className="flex gap-2">
                      <span className="num shrink-0 font-bold">{i + 1}.</span>
                      <span>
                        <span className="font-bold">{a.label}</span>
                        <span className="text-dim"> &mdash; {a.reason}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="num mt-1.5 text-[13px]">
                  Clearance {r.beforeText} &rarr; <span className="font-bold text-crit">{r.afterText}</span>
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ---- The graph, with every algorithm result drawn on it ---- */}
        <section className="panel">
          <div className="panel-head">
            <span className="label">Crowd graph</span>
            <span className="num ml-auto text-[11px] text-dim">
              V = {d.graph.nodeCount} &middot; E = {d.graph.edgeCount} &middot; average degree {d.graph.averageDegree().toFixed(1)}
            </span>
          </div>
          <div className="p-2">
            <GraphView
              graph={d.graph}
              route={d.route?.reachable ? d.route.safest.path : null}
              altRoute={d.route?.differs ? d.route.shortest.path : null}
              cutEdges={cutIds}
              flowEdges={flowEdges}
              regions={regions}
              focusId={d.focus?.id}
              highlightNodes={d.dangerRegion?.nodes ?? []}
              showCapacities
            />
          </div>
          <GraphLegend items={LEGEND} />
          <p className="border-t border-line px-3 py-1.5 text-[11px] leading-snug text-dim">
            Node size follows how full a zone is; line thickness follows link capacity in people per minute. The dashed red
            rectangle is the region the quadtree partition found to be under the most pressure.
          </p>
        </section>

        {/* ---- Stage-by-stage detail ---- */}
        <Stage
          id="spatialPartition"
          result={
            d.partition.region
              ? `${d.partition.region.zoneNames.join(', ')} - ${d.partition.region.people} people at ${Math.round(d.partition.region.load * 100)}% of the critical density`
              : 'no region'
          }
          detail={`${d.partition.stats.regions} regions examined, ${d.partition.stats.leaves} leaves, depth ${d.partition.stats.maxDepth}. This region selects the zone the route search starts from.`}
          ms={d.timings.partition}
        />

        <Stage
          id="mergeSort"
          result={d.ranking.ranked.slice(0, 4).map((z) => `${z.rank}. ${z.name} (${z.score})`).join('   ')}
          detail={`${d.ranking.stats.comparisons} comparisons, ${d.ranking.stats.merges ?? d.ranking.stats.partitions} ${d.ranking.stats.merges != null ? 'merges' : 'partitions'}, recursion depth ${d.ranking.stats.depth}, for ${d.ranking.ranked.length} zones.`}
          ms={d.timings.sort}
        />

        <Stage
          id="binarySearch"
          result={d.focus ? `${d.focus.name} density ${d.focus.density.toFixed(1)} falls in band ${d.focus.band} (${['SAFE', 'WATCH', 'WARNING', 'CRITICAL'][d.focus.band]})` : '-'}
          detail={`${d.band.stats.steps} halving steps, ${d.band.stats.comparisons} comparisons over the sorted threshold list.`}
          ms={d.timings.search}
        />

        <Stage
          id="bfs"
          result={
            d.reach.exits.length
              ? d.reach.exits.map((e) => `${e.name} (${e.hops} transitions)`).join(', ')
              : 'no exit is reachable from the focus zone'
          }
          detail={`${d.reach.stats.visited} nodes visited, ${d.reach.stats.edgesExamined} edges examined, peak queue ${d.reach.stats.maxQueueSize}.${d.reach.unreachable.length ? ` Unreachable: ${d.reach.unreachable.join(', ')}.` : ''}`}
          ms={d.timings.bfs}
        />

        <Stage
          id="dfs"
          result={
            d.danger.regions.length
              ? d.danger.regions.map((g) => `{${g.names.join(', ')}} holding ${g.people} people`).join('   ')
              : 'no congested zones touch each other'
          }
          detail={`${d.danger.stats.components} connected components found over ${d.danger.stats.visited} visits.${
            d.closureCheck ? ` Closing the tightest corridor would ${d.closureCheck.safe ? 'strand nobody' : `strand ${d.closureCheck.stranded.join(', ')}`}.` : ''
          }`}
          ms={d.timings.dfs}
        />

        <Stage
          id="dijkstra"
          result={
            d.route?.reachable
              ? `${d.route.safest.path.map(nameOf).join(' -> ')}  (cost ${d.route.safest.cost.toFixed(2)}, ${Math.round(d.route.safest.distance)} m, ${Math.round(d.route.safest.walkTime)} s walk)`
              : 'no route to any exit'
          }
          detail={
            d.route?.reachable
              ? `${d.route.stats.settled} nodes settled, ${d.route.stats.edgesRelaxed} edges relaxed, ${d.route.stats.improvements} improvements, ${d.route.stats.stalePops} stale heap entries skipped. ` +
                (d.route.differs
                  ? `The physically shortest route is ${d.route.shortest.path.map(nameOf).join(' -> ')} at ${Math.round(d.route.shortest.distance)} m, but its cost is ${d.route.shortest.cost.toFixed(2)} once congestion and risk count, so it loses.`
                  : 'Here the safest route is also the shortest, because the direct way out is not congested.')
              : 'Breadth-first search already showed no exit is reachable.'
          }
          ms={d.timings.dijkstra}
        >
          {d.route?.reachable && d.route.alternatives.length > 1 && (
            <div className="overflow-x-auto scroll-thin">
              <table className="mt-1.5 w-full text-[12px]">
                <thead>
                  <tr className="label border-b border-line text-left">
                    <th className="py-1 pr-3 font-bold">Exit</th>
                    <th className="py-1 pr-3 font-bold">Cost</th>
                    <th className="py-1 pr-3 font-bold">Distance</th>
                    <th className="py-1 pr-3 font-bold">Walk</th>
                    <th className="py-1 font-bold">Worst congestion</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-line">
                  {d.route.alternatives.map((alt, i) => (
                    <tr key={alt.id} className={i === 0 ? 'font-bold' : 'text-muted'}>
                      <td className="py-1 pr-3">{alt.name}{i === 0 && <span className="ml-1 text-[10px] text-crit">CHOSEN</span>}</td>
                      <td className="py-1 pr-3">{alt.cost.toFixed(2)}</td>
                      <td className="py-1 pr-3">{Math.round(alt.distance)} m</td>
                      <td className="py-1 pr-3">{Math.round(alt.walkTime)} s</td>
                      <td className="py-1">{Math.round(alt.congestion * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Stage>

        <Stage
          id="edmondsKarp"
          result={`${Math.round(d.flow.maxFlow)} people per minute, so ${d.people} people queue for ${mmss(d.flow.evacSeconds)}`}
          detail={`${d.flow.stats.flow.augmentations} augmenting paths over ${d.flow.stats.flow.bfsRuns} breadth-first searches, ${d.flow.stats.flow.edgesExamined} residual edges examined.`}
          ms={d.timings.maxflow}
        >
          {d.flow.augmentingPaths.length > 0 && (
            <ol className="num mt-1.5 max-h-[150px] space-y-0.5 overflow-y-auto scroll-thin text-[11.5px] text-muted">
              {d.flow.augmentingPaths.map((p) => (
                <li key={p.step}>
                  <span className="font-bold">{p.step}.</span> pushed {Math.round(p.pushed)} /min along {p.hops} links &rarr; total {Math.round(p.totalAfter)}
                  {p.limitedBy?.text ? <span className="text-dim"> (limited by {p.limitedBy.text})</span> : null}
                </li>
              ))}
            </ol>
          )}
        </Stage>

        <Stage
          id="minCut"
          result={
            d.flow.bottlenecks.length
              ? d.flow.bottlenecks.map((b) => `${b.label} at ${b.capacity}/min`).join('   ')
              : 'the network has no finite cut: nobody can leave'
          }
          detail={`Cut capacity ${Math.round(d.flow.cut.capacity)} equals the maximum flow ${Math.round(d.flow.maxFlow)}, as the theorem requires. ${d.flow.cut.sourceSide.length} nodes on the source side, ${d.flow.cut.sinkSide.length} on the sink side. Widening any link outside this cut cannot raise throughput.`}
          ms={d.timings.maxflow}
        />

        <Stage
          id="greedyIntervention"
          result={d.greedy.chosen.length ? d.greedy.chosen.map((c) => c.label).join(' -> ') : 'nothing selected'}
          detail={`${d.greedy.stats.candidatesConsidered} candidates ranked by risk reduction per unit of effort; ${d.greedy.stats.picks} taken, ${d.greedy.stats.rejected} rejected. Budget ${d.limits.effortBudget}, spent ${d.greedy.totalCost}.`}
          ms={d.timings.greedy}
        >
          {d.greedy.steps.length > 0 && (
            <ol className="mt-1.5 space-y-1 text-[12px]">
              {d.greedy.steps.map((s) => (
                <li key={s.step} className={s.taken ? '' : 'text-dim'}>
                  <span className="num font-bold">{s.step}.</span> {s.label}{' '}
                  <span className="num">[ratio {s.ratio.toFixed(2)}]</span> &mdash; {s.taken ? s.reason : `skipped: ${s.reason}`}
                </li>
              ))}
            </ol>
          )}
        </Stage>

        <Stage
          id="knapsackDP"
          result={`optimum ${d.optimal.best} risk points vs greedy ${d.greedy.totalReduction}${d.optimal.best > d.greedy.totalReduction ? ' (greedy fell short)' : ' (greedy matched the optimum here)'}`}
          detail={`Table ${d.optimal.table.length} x ${d.optimal.table[0]?.length ?? 0} = ${d.optimal.stats.states} states filled, ${d.optimal.stats.transitions} take-or-skip transitions. Optimal set: ${d.optimal.chosen.map((c) => c.label).join(', ') || 'empty'}.`}
          ms={d.timings.knapsack}
        />

        <Stage
          id="evacuationDP"
          result={
            d.allocation.dp.feasible && d.allocation.dp.used?.length
              ? `${d.allocation.dp.used.map((a) => `${a.people} -> ${a.name}`).join(', ')} clearing in ${mmss(d.allocation.dp.clearance * 60)}`
              : 'no usable exit'
          }
          detail={`${d.allocation.dp.stats.states} states, ${d.allocation.dp.stats.transitions} transitions, people counted in blocks of ${d.allocation.dp.stats.blockSize}. A proportional split of the same people would clear in ${mmss(d.allocation.proportional.clearance * 60)}.`}
          ms={d.timings.allocation}
        />

        <Stage
          id="capacitySearch"
          result={
            d.capacityNeeded.already
              ? `already inside the ${d.limits.targetClearanceSeconds} s target`
              : d.capacityNeeded.needed == null
                ? `the ${d.limits.targetClearanceSeconds} s target cannot be reached by adding exit capacity alone`
                : `+${Math.round(d.capacityNeeded.needed)} people per minute of exit capacity (about ${d.capacityNeeded.perExit} per gate)`
          }
          detail={`${d.capacityNeeded.stats.evaluations} max-flow evaluations over a range of 2000, instead of up to 2000 for a linear scan.`}
          ms={d.timings.capacitySearch}
        />

        {/* ---- Backtracking: opt-in, because it is the expensive one ---- */}
        <section className="panel">
          <div className="panel-head">
            <span className="label">Backtracking: what-if planner</span>
            <button className="btn btn-primary ml-auto" onClick={onRunWhatIf} disabled={whatIfBusy || !d.candidates.length}>
              {whatIfBusy ? 'Searching...' : 'Search combinations'}
            </button>
          </div>
          {!d.candidates.length ? (
            <p className="px-3 py-2 text-[13px] text-muted">No interventions are warranted right now, so there are no combinations to search.</p>
          ) : !d.whatIf ? (
            <p className="px-3 py-2 text-[13px] text-muted">
              There are {d.candidates.length} candidate actions, so up to 2<sup>{d.candidates.length}</sup> ={' '}
              <span className="num">{2 ** d.candidates.length}</span> complete plans. The search rebuilds the flow network for
              each plan it keeps, so it runs on request rather than every frame.
            </p>
          ) : (
            <div className="px-3 py-2 text-[13px]">
              <p>
                Best feasible plan:{' '}
                <span className="font-bold">{d.whatIf.best.subset.map((s) => s.label).join(' + ') || 'do nothing'}</span>
              </p>
              <p className="num mt-0.5">
                Queue time {mmss(d.whatIf.baseline.evacSeconds)} &rarr; <span className="font-bold text-crit">{mmss(d.whatIf.best.evacSeconds)}</span>, cost{' '}
                {d.whatIf.best.cost} of {d.limits.effortBudget}
              </p>
              <dl className="num mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] sm:grid-cols-3">
                <Pair k="Search space" v={`2^${d.candidates.length} = ${d.whatIf.stats.searchSpace}`} />
                <Pair k="Nodes visited" v={d.whatIf.stats.nodesVisited} />
                <Pair k="Plans evaluated" v={d.whatIf.stats.leavesEvaluated} />
                <Pair k="Pruned by bound" v={d.whatIf.stats.prunedByBound} />
                <Pair k="Pruned by budget" v={d.whatIf.stats.prunedByBudget} />
                <Pair k="Pruned by staff" v={d.whatIf.stats.prunedByStaff} />
              </dl>
              <p className="mt-1.5 text-[11.5px] leading-snug text-dim">{algorithmInfo('backtracking').pruning}</p>
              <ol className="num mt-1.5 max-h-[160px] space-y-0.5 overflow-y-auto scroll-thin text-[11px]">
                {d.whatIf.explored.map((e, i) => (
                  <li key={i} className={e.pruned ? 'text-dim' : ''}>
                    depth {e.depth} [{e.ids.join(', ') || 'empty'}]{' '}
                    {e.pruned ? <span className="text-warn">pruned: {e.pruned}</span> : <>clearance {mmss(e.evacSeconds)} {e.outcome === 'new best' && <span className="text-crit">new best</span>}</>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>

      {/* ---- Right column: why each algorithm, and the timings ---- */}
      <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto scroll-thin">
        <section className="panel">
          <div className="panel-head">
            <span className="label">Stage runtime</span>
            <span className="ml-auto text-[11px] text-dim">Measured, this machine</span>
          </div>
          <ul className="px-3 py-2 text-[12px]">
            {Object.entries(d.timings).map(([key, ms]) => (
              <li key={key} className="flex items-center gap-2 py-0.5">
                <span className="w-[108px] shrink-0 truncate">{key}</span>
                <span className="h-2 bg-raised" style={{ width: `${Math.min(100, (ms / Math.max(...Object.values(d.timings), 0.01)) * 100)}%`, minWidth: 2, background: '#6b6963' }} />
                <span className="num ml-auto">{ms.toFixed(2)} ms</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-3 py-1.5 text-[11px] leading-snug text-dim">
            A measured time says something about this machine and this input size. It is not evidence for an asymptotic bound;
            the complexities quoted below are the analytical results.
          </p>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="label">Why this algorithm?</span>
          </div>
          <dl className="divide-y divide-line">
            {['spatialPartition', 'mergeSort', 'binarySearch', 'bfs', 'dfs', 'dijkstra', 'edmondsKarp', 'minCut', 'greedyIntervention', 'knapsackDP', 'evacuationDP', 'backtracking'].map((id) => {
              const a = algorithmInfo(id)
              return (
                <div key={id} className="px-3 py-2">
                  <dt className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-bold">{a.name}</span>
                    <span className="num text-[11px] text-dim">{a.time.worst} time, {a.space} space</span>
                  </dt>
                  <dd className="mt-0.5 text-[12px] leading-snug text-muted">{a.why}</dd>
                  {a.caveat && <dd className="mt-1 text-[11.5px] leading-snug text-crit">{a.caveat}</dd>}
                </div>
              )
            })}
          </dl>
        </section>
      </div>
    </div>
  )
}

function Stage({ id, result, detail, ms, children }) {
  const a = algorithmInfo(id)
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">{a.name}</span>
        <span className="text-[11px] text-dim">{a.family}</span>
        <span className="num ml-auto text-[11px] text-dim">
          {a.time.worst} &middot; {ms != null ? `${ms.toFixed(2)} ms` : '-'}
        </span>
      </div>
      <div className="px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-dim">Problem</p>
        <p className="text-[12.5px] leading-snug text-muted">{a.problem}</p>
        <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-dim">Result</p>
        <p className="num text-[13px] leading-snug">{result}</p>
        <p className="mt-1 text-[11.5px] leading-snug text-dim">{detail}</p>
        {children}
      </div>
    </section>
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
