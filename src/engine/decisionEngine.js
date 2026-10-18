// Sentinel's DAA decision engine. One call runs the whole pipeline:
//
//   crowd state (camera or simulation)
//     -> rank zones .................. merge sort + binary search   (riskEngine.js)
//     -> build crowd graph ........... adjacency list              (crowdGraphBuilder.js)
//     -> reachable exits ............. BFS
//     -> affected danger cluster ..... DFS
//     -> safest evacuation route ..... Dijkstra (crowd-aware cost) vs shortest distance
//     -> evacuation capacity ......... Edmonds-Karp max flow
//     -> bottleneck .................. min cut
//     -> intervention plan ........... greedy (benefit / cost), checked by backtracking
//     -> after-plan graph ............ max flow + Dijkstra again
//     -> recommendation
//
// Everything shown in the UI is read from the object this returns.
import { bfs } from '../algorithms/graph/bfs.js'
import { dfs } from '../algorithms/graph/dfs.js'
import { dijkstra } from '../algorithms/graph/dijkstra.js'
import { maxFlow } from '../algorithms/flow/maxFlow.js'
import { minCut } from '../algorithms/flow/minCut.js'
import { greedySelect } from '../algorithms/optimization/greedyIntervention.js'
import { backtrackBest } from '../algorithms/optimization/backtrackingPlanner.js'
import { mergeSort } from '../algorithms/sorting/mergeSort.js'
import { findBand } from '../algorithms/searching/binarySearch.js'
import { buildCrowdGraph, withCrowdSource, SAFE, SOURCE } from './crowdGraphBuilder.js'
import { rankZones, byDanger } from './riskEngine.js'
import { DAA_INTERVENTIONS } from './interventions.js'
import { PLAN_BUDGET, TARGET_EVAC_SECONDS } from './stationModel.js'
import { timeIt } from './timing.js'

// Seconds to move `people` out at `flow` people per minute (steady-flow estimate, ignores walking time).
export const evacSeconds = (people, flow) => (flow > 0 ? (people / flow) * 60 : Infinity)

export function evacuationCapacity(graph) {
  const flowGraph = withCrowdSource(graph)
  const flow = maxFlow(flowGraph, SOURCE, SAFE)
  const cut = minCut(flowGraph, flow)
  return { flowGraph, flow, cut }
}

export function runDaaAnalysis({ snap, settings, site, sideSnaps = {}, applied = [], projectRisk = null, measure = true }) {
  const state = { snap, settings, site, sideSnaps, applied }
  const timings = {}
  const time = (key, fn) => {
    if (measure) timings[key] = timeIt(fn)
  }

  // 1. Rank zones by danger (merge sort) and classify each one (binary search).
  const mergeTrace = []
  const ranking = rankZones(snap, settings, mergeTrace)
  time('mergeSort', () => mergeSort(ranking.before, byDanger))
  time('binarySearch', () => ranking.before.forEach((z) => findBand(ranking.bands, z.perArea)))
  const top = ranking.ranked[0]
  const critical = top && top.people > 0 ? top : null

  // 2. Build the crowd graph from the live state.
  const graph = buildCrowdGraph(state)
  time('graph', () => buildCrowdGraph(state))

  const label = (id) => graph.getNode(id)?.label ?? id
  const exitIds = graph.nodeIds().filter((id) => ['exit', 'stairs'].includes(graph.getNode(id).kind))
  const empty = { graph, ranking, mergeTrace, critical, timings, label, exitIds }
  if (!critical) return { ...empty, status: 'empty', message: 'Nobody detected yet, so there is nothing to evacuate.' }
  if (!graph.hasNode(SAFE) || !exitIds.length) {
    return { ...empty, status: 'no-exits', message: 'No exits are configured for this site. Configure a site on the Setup tab so the graph has exits.' }
  }

  // 3. BFS: which exits can the critical zone still reach through open connections?
  const reach = bfs(graph, critical.id)
  time('bfs', () => bfs(graph, critical.id))
  const reachableExits = exitIds.filter((id) => reach.hops.has(id))
  const blockedExits = exitIds.filter((id) => !reach.hops.has(id))

  // 4. DFS: the connected cluster of zones at WATCH or above around the critical zone.
  const inDanger = (node) => node.kind === 'zone' && node.level >= 1
  const cluster = dfs(graph, critical.id, { canEnter: inDanger })
  time('dfs', () => dfs(graph, critical.id, { canEnter: inDanger }))

  // 5. Dijkstra twice on the same graph: crowd-aware cost vs plain distance.
  const safest = dijkstra(graph, critical.id, { target: SAFE })
  time('dijkstra', () => dijkstra(graph, critical.id, { target: SAFE }))
  const shortest = dijkstra(graph, critical.id, { target: SAFE, weight: (e) => e.distance })
  const routeStats = (edges) => ({
    cost: sum(edges, (e) => e.cost),
    distance: sum(edges, (e) => e.distance),
    congestion: Math.max(0, ...edges.map((e) => e.congestion)),
    risk: Math.max(0, ...edges.map((e) => e.risk)),
  })

  // 6. Max flow (evacuation capacity) and min cut (bottleneck).
  const capacity = evacuationCapacity(graph)
  time('maxFlow', () => evacuationCapacity(graph))
  time('minCut', () => minCut(capacity.flowGraph, capacity.flow))
  const people = snap.people
  const evacBefore = evacSeconds(people, capacity.flow.maxFlow)

  // 7. Interventions: greedy plan, checked against the exact backtracking optimum.
  const candidates = site?.type === 'station' ? DAA_INTERVENTIONS.filter((iv) => !applied.includes(iv.id)) : []
  const objective = (chosen) => evacSeconds(people, evacuationCapacity(buildCrowdGraph({ ...state, applied: [...applied, ...chosen.map((c) => c.id)] })).flow.maxFlow)
  const greedy = greedySelect({ candidates, objective, budget: PLAN_BUDGET, isGoodEnough: (secs) => secs <= TARGET_EVAC_SECONDS })
  time('greedy', () => greedySelect({ candidates, objective, budget: PLAN_BUDGET, isGoodEnough: (secs) => secs <= TARGET_EVAC_SECONDS }))
  const optimal = candidates.length ? backtrackBest({ candidates, objective, budget: PLAN_BUDGET }) : null
  if (candidates.length) time('backtracking', () => backtrackBest({ candidates, objective, budget: PLAN_BUDGET }))
  const plan = greedy.selected.map((c) => c.id)

  // 8. The same analysis on the graph with the plan applied.
  const afterGraph = buildCrowdGraph({ ...state, applied: [...applied, ...plan] })
  const afterCapacity = evacuationCapacity(afterGraph)
  const afterRoute = dijkstra(afterGraph, critical.id, { target: SAFE })
  const evacAfter = evacSeconds(people, afterCapacity.flow.maxFlow)

  // 9. Independent check with Sentinel's own risk model (simulation only).
  const projection = projectRisk ? { without: projectRisk([]), withPlan: projectRisk(plan) } : null

  const result = {
    status: 'ok',
    graph,
    label,
    exitIds,
    ranking,
    mergeTrace,
    critical,
    people,
    reach: { ...reach, reachableExits, blockedExits },
    cluster: { ...cluster, zones: cluster.order },
    route: { safest: { ...safest, ...routeStats(safest.edges) }, shortest: { ...shortest, ...routeStats(shortest.edges) } },
    capacity: { ...capacity, maxFlow: capacity.flow.maxFlow, evacSeconds: evacBefore },
    greedy,
    optimal,
    candidates,
    plan,
    budget: PLAN_BUDGET,
    targetSeconds: TARGET_EVAC_SECONDS,
    after: {
      graph: afterGraph,
      capacity: { ...afterCapacity, maxFlow: afterCapacity.flow.maxFlow, evacSeconds: evacAfter },
      route: { ...afterRoute, ...routeStats(afterRoute.edges) },
    },
    projection,
    timings,
  }
  result.recommendation = buildRecommendation(result)
  return result
}

const sum = (arr, f) => Math.round(arr.reduce((a, x) => a + f(x), 0) * 10) / 10

export const edgeLabel = (label, e) => `${label(e.from)} → ${label(e.to)}`
export const formatSeconds = (s) => (s === Infinity ? 'no way out' : s >= 90 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`)

function buildRecommendation(r) {
  const { label } = r
  const route = r.route.safest.path.map(label)
  const bottleneck = r.capacity.cut.cutEdges.map((e) => edgeLabel(label, e))
  const actions = r.greedy.selected.map((c) => c.label)
  const gain = r.capacity.maxFlow > 0 ? Math.round(((r.after.capacity.maxFlow - r.capacity.maxFlow) / r.capacity.maxFlow) * 100) : 0
  const timeCut = r.capacity.evacSeconds === Infinity ? 100 : Math.round((1 - r.after.capacity.evacSeconds / r.capacity.evacSeconds) * 100)
  return {
    headline: `Zone ${r.critical.name} is ${r.critical.band.label} (${r.critical.people} people, ${r.critical.density}% of crush density).`,
    route,
    bottleneck,
    actions,
    gainPct: gain,
    timeCutPct: timeCut,
    text: [
      `Zone ${r.critical.name} is ${r.critical.band.label.toLowerCase()}: ${r.critical.people} people, ${r.critical.density}% of crush density.`,
      `Current evacuation capacity: ${r.capacity.maxFlow} people/min. Bottleneck: ${bottleneck.join(', ') || 'none'}.`,
      actions.length ? `Recommended action: ${actions.join(' + ')}.` : 'No intervention improves evacuation capacity within the budget.',
      `Move people from ${r.critical.name} along ${route.join(' → ')}.`,
      `Estimated platform clearance: ${formatSeconds(r.capacity.evacSeconds)} → ${formatSeconds(r.after.capacity.evacSeconds)}.`,
    ],
  }
}
