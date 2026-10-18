// Dumps the Emergency Crowd Surge analysis as JSON for the PDF report, so every number in the
// report comes from the real engine. Usage: node docs/report/export-data.mjs > data.json
import { loadEmergencyState, EMERGENCY_T } from '../../src/engine/emergencyScenario.js'
import { runDaaAnalysis, edgeLabel } from '../../src/engine/decisionEngine.js'
import { projectSimRisk } from '../../src/engine/riskProjection.js'
import { runBenchmark } from '../../src/engine/benchmark.js'
import { SOURCE } from '../../src/engine/crowdGraphBuilder.js'
import { COST_WEIGHTS, CAPACITY, PLAN_BUDGET, TARGET_EVAC_SECONDS } from '../../src/engine/stationModel.js'
import { ALGORITHMS } from '../../src/algorithms/catalog.js'

const st = loadEmergencyState()
const r = runDaaAnalysis({
  ...st,
  projectRisk: (extra) => projectSimRisk({ tNow: EMERGENCY_T, basePlan: [], extra, zones: st.zones, settings: st.settings, site: st.site }),
})
const L = r.label
const E = (e) => edgeLabel(L, e)
const r1 = (v) => (v === Infinity ? 'inf' : Math.round(v * 10) / 10)
const kinds = {}
for (const n of r.graph.nodes.values()) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1

console.log(JSON.stringify({
  t: EMERGENCY_T,
  people: r.people,
  overall: st.snap.overall,
  score: st.snap.score,
  settings: st.settings,
  zones: st.snap.zones.map((z, i) => ({ id: z.id, people: st.snap.counts[i], level: st.snap.levels[i], counter: st.snap.counterIdx[i], turbulence: st.snap.turbulence[i] })),
  side: Object.fromEntries(Object.entries(st.sideSnaps).map(([k, v]) => [k, v.people])),
  graph: { V: r.graph.V, E: r.graph.E, kinds },
  weights: COST_WEIGHTS,
  capacity: CAPACITY,
  budget: PLAN_BUDGET,
  target: TARGET_EVAC_SECONDS,
  critical: r.critical,
  ranking: { before: r.ranking.before.map((z) => [z.name, z.density]), ranked: r.ranking.ranked.map((z) => [z.name, z.density, z.band.label]), bands: r.ranking.bands.map((b) => [b.min, b.label]), merges: r.mergeTrace.filter((x) => x.type === 'merge').length, divides: r.mergeTrace.filter((x) => x.type === 'divide').length },
  adjacency: r.graph.neighbours(r.critical.id).map((e) => ({ to: L(e.to), distance: e.distance, congestion: Math.round(e.congestion), risk: e.risk, capacity: r1(e.capacity), cost: e.cost })),
  bfs: { order: r.reach.order.map(L), reachable: r.reach.reachableExits.map((id) => [L(id), r.reach.hops.get(id)]), blocked: r.reach.blockedExits.map(L) },
  dfs: { order: r.cluster.order.map(L) },
  dijkstra: {
    safest: { path: r.route.safest.path.map(L), cost: r.route.safest.cost, distance: r.route.safest.distance, congestion: Math.round(r.route.safest.congestion), risk: r.route.safest.risk },
    shortest: { path: r.route.shortest.path.map(L), cost: r.route.shortest.cost, distance: r.route.shortest.distance, congestion: Math.round(r.route.shortest.congestion), risk: r.route.shortest.risk },
    settled: r.route.safest.settled.map((s) => [L(s.node), r1(s.dist)]),
  },
  flow: {
    max: r.capacity.maxFlow,
    evac: r1(r.capacity.evacSeconds),
    paths: r.capacity.flow.augmentingPaths.map((p) => ({ path: p.path.filter((x) => x !== SOURCE).map(L), add: p.bottleneck, total: p.total })),
    cut: r.capacity.cut.cutEdges.map((e) => [E(e), r1(e.capacity)]),
    closed: r.capacity.cut.closedCrossing.map(E),
  },
  greedy: {
    initial: r1(r.greedy.initial), final: r1(r.greedy.final), spent: r.greedy.spent, stop: r.greedy.stopReason,
    steps: r.greedy.steps.map((s) => ({ chosen: s.chosen.label, before: r1(s.before), after: r1(s.after), options: s.considered.map((o) => [o.candidate.label, o.candidate.cost, o.affordable ? r1(o.gain) : null, o.affordable ? Math.round(o.ratio * 100) / 100 : null]) })),
  },
  candidates: r.candidates.map((c) => [c.label, c.cost, c.effect]),
  optimal: { plan: r.optimal.selected.map((c) => c.label), value: r1(r.optimal.value), cost: r.optimal.cost, explored: r.optimal.explored, pruned: r.optimal.pruned, total: r.optimal.total },
  after: { max: r.after.capacity.maxFlow, evac: r1(r.after.capacity.evacSeconds), cut: r.after.capacity.cut.cutEdges.map((e) => [E(e), r1(e.capacity)]), route: r.after.route.path.map(L) },
  projection: r.projection,
  recommendation: r.recommendation.text,
  gainPct: r.recommendation.gainPct,
  timeCutPct: r.recommendation.timeCutPct,
  timings: Object.fromEntries(Object.entries(r.timings).map(([k, v]) => [k, v.ms])),
  algorithms: ALGORITHMS,
  benchmark: runBenchmark(),
}, null, 1))
