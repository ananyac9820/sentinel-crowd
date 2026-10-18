// End-to-end tests: Sentinel crowd state -> graph -> algorithms -> recommendation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadEmergencyState } from '../src/engine/emergencyScenario.js'
import { runDaaAnalysis } from '../src/engine/decisionEngine.js'
import { buildCrowdGraph, SAFE } from '../src/engine/crowdGraphBuilder.js'
import { emptySnapshot } from '../src/lib/risk.js'
import { cloneProfile } from '../src/lib/site.js'

const state = loadEmergencyState()
const run = (extra = {}) => runDaaAnalysis({ ...state, measure: false, ...extra })

test('Emergency scenario is deterministic', () => {
  const a = loadEmergencyState()
  const b = loadEmergencyState()
  assert.deepEqual(a.snap.counts, b.snap.counts)
  assert.equal(a.snap.overall, 3) // CRITICAL
})

test('Graph is built from the crowd state, not a separate dataset', () => {
  const g = buildCrowdGraph(state)
  state.snap.zones.forEach((z, i) => assert.equal(g.getNode(z.id).people, state.snap.counts[i]))
  assert.ok(g.hasNode(SAFE))
  assert.ok(g.hasNode('EXIT:Gate 1'))
  // Gate 2 is closed in the scenario: its edge has zero capacity.
  const gate2 = g.edges().find((e) => e.to === 'EXIT:Gate 2')
  assert.equal(gate2.capacity, 0)
  // ...and opening it is a real graph change.
  const opened = buildCrowdGraph({ ...state, applied: ['gate2'] }).edges().find((e) => e.to === 'EXIT:Gate 2')
  assert.ok(opened.capacity > 0)
})

test('Full analysis: critical zone, closed exits, route choice, bottleneck, plan', () => {
  const r = run()
  assert.equal(r.status, 'ok')
  assert.equal(r.critical.id, 'B3')
  assert.equal(r.critical.band.label, 'CRITICAL')
  assert.ok(r.reach.blockedExits.includes('EXIT:Gate 2'))
  assert.ok(r.cluster.zones.length >= 2)
  // Safest route avoids the congested stairs even though they are physically shorter.
  assert.ok(r.route.shortest.distance < r.route.safest.distance)
  assert.ok(r.route.safest.cost < r.route.shortest.cost)
  // Max-flow min-cut theorem holds on the real graph.
  assert.equal(r.capacity.cut.capacity, r.capacity.maxFlow)
  assert.ok(r.capacity.maxFlow > 0)
  // The plan measurably helps.
  assert.ok(r.plan.length >= 1)
  assert.ok(r.after.capacity.maxFlow > r.capacity.maxFlow)
  assert.ok(r.after.capacity.evacSeconds < r.capacity.evacSeconds)
  assert.ok(r.greedy.spent <= r.budget)
  // Backtracking can never do worse than greedy (it checks every plan within the budget).
  assert.ok(r.optimal.value <= r.greedy.final + 1e-9)
})

test('Interventions already applied are not offered again', () => {
  const r = run({ applied: ['gate2'] })
  assert.ok(!r.candidates.some((c) => c.id === 'gate2'))
  assert.ok(!r.reach.blockedExits.includes('EXIT:Gate 2'))
})

test('Empty crowd and unconfigured site are handled', () => {
  const empty = runDaaAnalysis({ ...state, snap: emptySnapshot(state.zones), sideSnaps: {}, measure: false })
  assert.equal(empty.status, 'empty')
  const noExits = run({ site: cloneProfile('generic') })
  assert.equal(noExits.status, 'no-exits')
})

test('Simulation logs each intervention exactly once, including ones applied at the current time', async () => {
  const { CrowdEngine, DEFAULT_SETTINGS } = await import('../src/lib/risk.js')
  const { DEFAULT_ZONES } = await import('../src/lib/zones.js')
  const { replayScenario, makeSideEngines } = await import('../src/engine/emergencyScenario.js')
  const countActions = (plan, toT) => {
    const engine = new CrowdEngine(DEFAULT_SETTINGS.sim, DEFAULT_ZONES, cloneProfile('station'))
    const { snap } = replayScenario({ engine, sideEngines: makeSideEngines(), zones: DEFAULT_ZONES, toT, plan })
    return snap.alerts.filter((a) => a.kind === 'action').length
  }
  assert.equal(countActions([{ type: 'gate2', at: 66, auto: true }], 80), 1) // scripted auto response
  assert.equal(countActions([{ type: 'gate2', at: 58 }, { type: 'emergencyExit', at: 58 }], 70), 2) // applied "now" at a tick
})
