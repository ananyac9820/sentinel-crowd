// The decision engine: one function that takes a crowd snapshot and returns a recommendation,
// with every number in it computed by one of the algorithms.
//
//   crowd snapshot (detector or simulation)
//        -> buildCrowdGraph            weighted directed graph
//        -> partitionSite              divide and conquer: which REGION is worst
//        -> rankZones                  merge sort: danger order
//        -> riskBand                   binary search: which band the focus zone is in
//        -> reachableExits             BFS: can these people get out, and in how few transitions
//        -> dangerRegions              DFS: which adjacent zones form one body of crowd
//        -> safestRoute                Dijkstra: the cheapest route out, vs the shortest one
//        -> analyseFlow                Edmonds-Karp: evacuation throughput, people/min
//        -> minCut                     the links that limit it
//        -> buildInterventions         candidates generated FROM the cut
//        -> greedyIntervention         fast prioritised plan
//        -> knapsackDP                 the optimal set under the same budget, as a yardstick
//        -> allocateExitsDP            how many people per exit, and the clearance time
//        -> planByBacktracking         the best interacting COMBINATION (optional; it is the
//                                      expensive one, so the caller asks for it explicitly)
//        -> recommendation             plain words, built from the computed values
//
// Nothing here is cached across frames on purpose: the whole pipeline runs in a few milliseconds
// on a station-sized graph, and `timings` reports how long each stage actually took.

import { buildCrowdGraph, criticalDensity, explainCost, MODEL } from './crowdGraphBuilder.js'
import { rankZones, riskBand, compareSorts } from './riskEngine.js'
import { analyseFlow, buildInterventions, evaluatePlan, boundEvacSeconds, planIsSafe } from './interventionEngine.js'
import { reachableExits } from '../algorithms/graph/bfs.js'
import { dangerRegions, disconnectsExits } from '../algorithms/graph/dfs.js'
import { safestRoute } from '../algorithms/graph/dijkstra.js'
import { partitionSite, hottestRegion } from '../algorithms/divideAndConquer/spatialPartition.js'
import { greedyIntervention } from '../algorithms/optimization/greedyIntervention.js'
import { knapsackDP } from '../algorithms/optimization/knapsackDP.js'
import { allocateExitsDP, allocateProportional } from '../algorithms/optimization/evacuationDP.js'
import { planByBacktracking } from '../algorithms/optimization/backtracking.js'
import { binarySearchPredicate } from '../algorithms/searching/binarySearch.js'

const clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

export const DEFAULT_LIMITS = {
  effortBudget: 10, // staff-minutes available for immediate action
  staff: 6,
  maxActions: 3,
  targetClearanceSeconds: 120, // the clearance time the capacity search aims for
}

/** A zone counts as part of a dangerous region at WARNING or above, or when movement is flagged. */
const isDangerous = (node) => node?.kind === 'zone' && ((node.level ?? 0) >= 2 || node.turbulence >= 55 || node.counterFlow)

/**
 * @param {object} input { snap, settings, site, forecast }
 * @param {object} options { limits, sortAlgorithm, withBacktracking }
 */
export function analyseCrowdState({ snap, settings, site, forecast = [] }, { limits = DEFAULT_LIMITS, sortAlgorithm = 'merge', withBacktracking = false } = {}) {
  const timings = {}
  const time = (name, fn) => {
    const t0 = clock()
    const value = fn()
    timings[name] = clock() - t0
    return value
  }

  // ---- 1. Model ----
  const graph = time('graph', () => buildCrowdGraph(snap, settings, site))
  const people = graph.nodesOfKind('zone').reduce((a, n) => a + n.people, 0)
  const crit = criticalDensity(settings)

  // ---- 2. Divide and conquer: which region is under the most pressure ----
  const partition = time('partition', () =>
    partitionSite(snap.zones ?? [], snap.counts ?? [], { levels: snap.levels, turbulence: snap.turbulence, criticalDensity: crit }),
  )
  const region = hottestRegion(partition.root)

  // ---- 3. Sorting: danger order ----
  const ranking = time('sort', () => rankZones(graph, { algorithm: sortAlgorithm, forecast }))

  // The focus zone is the worst-ranked zone INSIDE the hottest region, which is how the
  // divide-and-conquer result actually changes what the rest of the pipeline looks at.
  const regionZones = new Set(region?.zones ?? [])
  const focus = ranking.ranked.find((z) => regionZones.has(z.zoneIndex)) ?? ranking.ranked[0] ?? null
  const focusNode = focus ? graph.getNode(focus.id) : null

  // ---- 4. Searching: which band the focus zone is in ----
  const band = focusNode ? time('search', () => riskBand(focusNode.density, settings)) : { band: 0, stats: { steps: 0, comparisons: 0 } }

  // ---- 5. BFS: reachability and fewest-transition exits ----
  const reach = focusNode ? time('bfs', () => reachableExits(graph, focusNode.id)) : { exits: [], unreachable: [], stats: {} }

  // ---- 6. DFS: contiguous dangerous regions ----
  const danger = time('dfs', () => dangerRegions(graph, isDangerous))
  const dangerRegion = danger.regions[0] ?? null

  // ---- 7. Dijkstra: the safest route, and the shortest one for comparison ----
  const route = focusNode ? time('dijkstra', () => safestRoute(graph, focusNode.id)) : null

  // ---- 8. Max flow and min cut ----
  const flow = time('maxflow', () => analyseFlow(graph, people))

  // The last person out has to WALK to the exit as well as pass through it, so clearance has two
  // parts: the queue time the flow model gives (people / throughput) and the walking time of the
  // safest route, which is what Dijkstra already computed. The queue term is what interventions
  // change; the walk term is the same for every plan, so comparisons between plans stay valid.
  const walkSeconds = route?.reachable ? route.safest.walkTime : 0
  const clearanceSeconds = (queueSeconds) => (Number.isFinite(queueSeconds) ? queueSeconds + walkSeconds : Infinity)

  // ---- 9. Candidate interventions, generated from the cut ----
  // Only when something actually needs fixing: a minimum cut exists even on an empty safe site.
  const warranted = (focus?.band ?? 0) >= 1 || Boolean(dangerRegion) || clearanceSeconds(flow.evacSeconds) > limits.targetClearanceSeconds
  const candidates = time('candidates', () => buildInterventions({ graph, bottlenecks: flow.bottlenecks, dangerRegion, maxFlow: flow.maxFlow, warranted }))

  // ---- 10. Greedy: the fast plan ----
  const greedy = time('greedy', () => greedyIntervention(candidates, { budget: limits.effortBudget, staff: limits.staff, maxActions: limits.maxActions }))

  // ---- 11. DP: the optimal set under the same budget, as the yardstick for greedy ----
  const optimal = time('knapsack', () => knapsackDP(candidates, limits.effortBudget))

  // Both plans are then scored by the SAME flow computation, so the comparison is on measured
  // evacuation time and not on the estimated risk-reduction numbers that fed the selection.
  const greedyOutcome = time('scoreGreedy', () => evaluatePlan(graph, people, greedy.chosen))
  const optimalOutcome = time('scoreOptimal', () => evaluatePlan(graph, people, optimal.chosen))

  // ---- 12. DP: how many people to send to each exit ----
  const exitOptions = exitsForAllocation(graph, greedy.chosen)
  // 60 shares keeps the table small (O(m * 60^2) states) while making the discretisation error at
  // most one sixtieth of the crowd, which is below the resolution the recommendation is read at.
  const allocation = time('allocation', () => allocateExitsDP(exitOptions, people, { blockSize: Math.max(1, people / 60) }))
  const proportional = allocateProportional(exitOptions, people)

  // ---- 13. Binary search on the answer: how much extra capacity would meet the target ----
  const capacityNeeded = time('capacitySearch', () =>
    searchRequiredCapacity(graph, people, flow, limits.targetClearanceSeconds),
  )

  // ---- 14. Backtracking: the best interacting combination (expensive, so opt-in) ----
  const whatIf = withBacktracking
    ? time('backtracking', () =>
        planByBacktracking(candidates, {
          evaluate: (subset) => {
            const r = evaluatePlan(graph, people, subset)
            return { evacSeconds: r.evacSeconds, maxFlow: r.maxFlow, people: r.people }
          },
          bound: (chosen, rest) => boundEvacSeconds(graph, people, chosen, rest, flow.maxFlow),
          isSafe: (subset) => planIsSafe(graph, subset),
          budget: limits.effortBudget,
          staff: limits.staff,
          maxActions: limits.maxActions,
        }),
      )
    : null

  // ---- 15. Safety check: would closing the tightest corridor strand anyone? ----
  const tightest = flow.bottlenecks.find((b) => b.kind === 'corridor')
  const closureCheck = tightest ? time('closureCheck', () => disconnectsExits(graph, (e) => e.id === tightest.id)) : null

  const decision = {
    people,
    graph,
    partition: { root: partition.root, region, stats: partition.stats },
    ranking,
    focus: focus ? { ...focus, band: band.band, density: focusNode.density, load: focusNode.load } : null,
    band,
    reach,
    danger,
    dangerRegion,
    route,
    flow,
    candidates,
    warranted,
    walkSeconds,
    clearanceNow: clearanceSeconds(flow.evacSeconds),
    greedy: { ...greedy, outcome: greedyOutcome, clearance: clearanceSeconds(greedyOutcome.evacSeconds) },
    optimal: { ...optimal, outcome: optimalOutcome, clearance: clearanceSeconds(optimalOutcome.evacSeconds) },
    allocation: { dp: allocation, proportional, exits: exitOptions },
    capacityNeeded,
    whatIf,
    closureCheck,
    limits,
    timings,
  }
  decision.recommendation = buildRecommendation(decision)
  return decision
}

/**
 * The exits the allocation DP may use: every exit reachable in the graph, with its throughput
 * and its opening delay. An exit a greedy pick opens is included with that pick's delay.
 */
function exitsForAllocation(graph, chosen = []) {
  const opening = new Map(chosen.filter((iv) => iv.kind === 'exit-capacity').map((iv) => [iv.target, iv]))
  return graph.nodesOfKind('exit').map((node) => {
    const plan = opening.get(node.pointId)
    const base = node.opened === false ? 0 : MODEL.EXIT_WIDTH_M * MODEL.SPECIFIC_FLOW
    return {
      id: node.id,
      name: node.name,
      capacity: Math.round(base + (plan?.capacityGain ?? 0)),
      // Minutes before the exit is usable. An exit that is already open has no delay.
      delay: plan ? plan.timeToEffect / 60 : node.opened === false ? 1.5 : 0,
      planned: Boolean(plan),
    }
  })
}

/**
 * Smallest extra exit capacity (people/min) that brings clearance under the target, found by
 * binary search over the answer space. Each test is a full max-flow run, so the log factor is
 * the difference between about 11 runs and about 800.
 */
function searchRequiredCapacity(graph, people, flow, targetSeconds) {
  if (!Number.isFinite(flow.evacSeconds)) {
    // Nobody can get out at all; the question is still well posed, so search anyway.
  } else if (flow.evacSeconds <= targetSeconds) {
    return { needed: 0, already: true, targetSeconds, stats: { steps: 0, evaluations: 0 }, current: flow.evacSeconds }
  }
  const exits = graph.nodesOfKind('exit')
  if (!exits.length) return { needed: null, already: false, targetSeconds, stats: { steps: 0, evaluations: 0 }, current: flow.evacSeconds, reason: 'no exit is configured' }

  // Spread the trial capacity evenly over the configured exits, then ask the flow model.
  const test = (extraTotal) => {
    const share = extraTotal / exits.length
    const extra = new Map(exits.map((e) => [e.pointId, share]))
    const boosted = graph.mapEdges((e) => {
      const to = graph.getNode(e.to)
      return to.kind === 'exit' ? { capacity: e.capacity + share } : null
    })
    const r = analyseFlow(boosted, people, { extraExitCapacity: extra, recordPaths: false })
    return r.evacSeconds <= targetSeconds
  }

  const { value, stats } = binarySearchPredicate(0, 2000, test)
  return { needed: value, already: false, targetSeconds, stats, current: flow.evacSeconds, perExit: value == null ? null : Math.round(value / exits.length) }
}

const mmss = (seconds) => {
  if (!Number.isFinite(seconds)) return 'not possible with the current layout'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m ? `${m} min ${s.toString().padStart(2, '0')} s` : `${s} s`
}

/**
 * Turns the computed results into the sentence an operator reads. Every number in the text is
 * taken from a result object above; none of it is written in by hand.
 */
function buildRecommendation(d) {
  const lines = []
  const actions = []
  const before = d.clearanceNow
  const after = d.greedy.clearance

  if (!d.focus) {
    return { headline: 'No zones are configured, so there is nothing to analyse.', lines: [], actions: [], before, after, severity: 0 }
  }

  const bandName = ['SAFE', 'WATCH', 'WARNING', 'CRITICAL'][d.focus.band] ?? 'SAFE'
  const headline =
    d.focus.band >= 2
      ? `${d.focus.name} is at ${bandName} density (${Math.round(d.focus.load * 100)}% of the crush threshold).`
      : `${d.focus.name} is the busiest zone at ${Math.round(d.focus.load * 100)}% of the crush threshold.`

  lines.push(
    `Evacuation capacity now: ${Math.round(d.flow.maxFlow)} people per minute for ${d.people} people. Clearance is about ${mmss(before)}: ${mmss(d.flow.evacSeconds)} of queueing at the exits plus ${mmss(d.walkSeconds)} to walk the safest route.`,
  )

  const top = d.flow.bottlenecks[0]
  if (top) lines.push(`Minimum cut: ${d.flow.bottlenecks.length === 1 ? 'one link' : `${d.flow.bottlenecks.length} links`} limit the whole site. The tightest is ${top.label} at ${top.capacity} people per minute.`)

  if (d.dangerRegion && d.dangerRegion.names.length > 1)
    lines.push(`Depth-first search groups ${d.dangerRegion.names.join(', ')} into one dangerous region holding ${d.dangerRegion.people} people, so they have to be treated together.`)

  if (d.route?.reachable) {
    lines.push(
      d.route.differs
        ? `Safest route from ${d.focus.name}: ${d.route.safest.path.map((id) => d.graph.getNode(id).name).join(' -> ')}. The physically shortest route is via ${d.route.shortest.name} (${Math.round(d.route.shortest.distance)} m against ${Math.round(d.route.safest.distance)} m) but costs more once congestion and risk are counted, so it is not the one to use.`
        : `Safest route from ${d.focus.name}: ${d.route.safest.path.map((id) => d.graph.getNode(id).name).join(' -> ')}, which is also the shortest.`,
    )
  } else if (d.reach.unreachable.length) {
    lines.push(`Breadth-first search found no route from ${d.focus.name} to any configured exit. That is itself an emergency.`)
  }

  for (const step of d.greedy.steps.filter((s) => s.taken)) actions.push({ label: step.label, reason: step.reason })

  if (actions.length) {
    lines.push(`Recommended now: ${actions.map((a) => a.label).join(', then ')}. Predicted clearance afterwards: ${mmss(after)} (${Math.round(d.greedy.outcome.maxFlow)} people per minute).`)
  } else if (!d.warranted) {
    lines.push('No intervention is recommended: every zone is below the WATCH density and the site clears within the target time, so there is nothing for the optimiser to improve.')
  } else if (d.focus.band >= 2) {
    lines.push('No intervention within the current effort budget raises throughput. Raise the budget or add staff.')
  }

  if (d.optimal.best > d.greedy.totalReduction) {
    lines.push(`Greedy scored ${d.greedy.totalReduction} estimated risk points; the dynamic-programming optimum for the same budget scores ${d.optimal.best}. Greedy picks the best value at each step and is not guaranteed to match that.`)
  }

  if (d.allocation.dp.feasible && d.allocation.dp.used?.length > 1) {
    const saved = (d.allocation.proportional.clearance - d.allocation.dp.clearance) * 60
    lines.push(
      `Exit allocation (dynamic programming): ${d.allocation.dp.used.map((a) => `${a.people} to ${a.name}`).join(', ')}, clearing in ${mmss(d.allocation.dp.clearance * 60)}.` +
        (saved > 1
          ? ` Splitting people in proportion to capacity instead would take ${mmss(d.allocation.proportional.clearance * 60)}, so the allocation saves ${mmss(saved)}.`
          : ' A proportional split matches it here, because the usable exits have the same capacity and no opening delay; the allocation only earns its keep once capacities or opening delays differ.'),
    )
  }

  if (d.capacityNeeded?.needed) {
    lines.push(`To clear within ${Math.round(d.limits.targetClearanceSeconds)} s the site needs about ${Math.round(d.capacityNeeded.needed)} more people per minute of exit capacity (${d.capacityNeeded.perExit} per configured exit), found by binary search over the capacity range in ${d.capacityNeeded.stats.evaluations} max-flow evaluations.`)
  }

  return {
    headline,
    lines,
    actions,
    before,
    after,
    improvement: Number.isFinite(before) && Number.isFinite(after) ? before - after : null,
    severity: d.focus.band,
    beforeText: mmss(before),
    afterText: mmss(after),
  }
}

export { mmss, explainCost }
export default analyseCrowdState
