// End-to-end tests for the decision engine: real zones, real site profile, real algorithms.
// These are the tests that prove the DAA layer is wired into the product rather than sitting
// beside it -- they assert that changing the crowd changes the computed decision.

import { describe, expect, it } from 'vitest'
import { analyseCrowdState, DEFAULT_LIMITS } from '../crowdDecisionEngine.js'
import { buildCrowdGraph, criticalDensity } from '../crowdGraphBuilder.js'
import { rankZones, riskBand, compareSorts } from '../riskEngine.js'
import { analyseFlow, buildInterventions, evaluatePlan } from '../interventionEngine.js'
import { DEFAULT_SETTINGS, emptySnapshot } from '../../lib/risk.js'
import { DEFAULT_ZONES } from '../../lib/zones.js'
import { cloneProfile } from '../../lib/site.js'
import { simGrid } from '../../lib/simulation.js'
import { aggregateGrid } from '../../lib/zones.js'

const settings = DEFAULT_SETTINGS.sim
const site = cloneProfile('station')

/** A snapshot from the real simulation at time t, with real zone levels. */
function snapshotAt(t) {
  const grid = simGrid(t, [])
  const agg = aggregateGrid(grid, DEFAULT_ZONES)
  const counts = agg.counts.map((c) => Math.round(c))
  const af = DEFAULT_ZONES.map((z) => Math.max(0.15, z.w * z.h * 12))
  const levels = counts.map((c, i) => {
    const d = Math.round(c / af[i])
    return d >= settings.critical ? 3 : d >= settings.warning ? 2 : d >= settings.watch ? 1 : 0
  })
  return { ...emptySnapshot(DEFAULT_ZONES), zones: DEFAULT_ZONES, counts, levels, turbulence: counts.map(() => 0), counterFlow: counts.map(() => false), surges: counts.map(() => false) }
}

const analyse = (snap, options) => analyseCrowdState({ snap, settings, site }, options)

describe('crowd graph builder', () => {
  it('builds a node per zone plus one per configured exit and entry', () => {
    const graph = buildCrowdGraph(snapshotAt(0), settings, site)
    expect(graph.nodesOfKind('zone')).toHaveLength(DEFAULT_ZONES.length)
    expect(graph.nodesOfKind('exit')).toHaveLength(3) // the station profile has Gates 1-3
    expect(graph.nodesOfKind('entry')).toHaveLength(1)
  })

  it('is sparse, so the adjacency list is the right structure', () => {
    const graph = buildCrowdGraph(snapshotAt(0), settings, site)
    expect(graph.averageDegree()).toBeLessThan(6)
  })

  it('every edge cost is non-negative, which is what Dijkstra requires', () => {
    const graph = buildCrowdGraph(snapshotAt(60), settings, site)
    for (const e of graph.edges) expect(e.cost).toBeGreaterThanOrEqual(0)
  })

  it('congestion and cost rise, and capacity falls, as a zone fills up', () => {
    const calm = buildCrowdGraph(snapshotAt(0), settings, site)
    const busy = buildCrowdGraph(snapshotAt(62), settings, site)
    // B3 is the staircase zone the scripted scenario crowds.
    const into = (g) => g.edges.find((e) => e.to === 'Z:B3' && g.getNode(e.from).kind === 'zone')
    expect(into(busy).congestion).toBeGreaterThan(into(calm).congestion)
    expect(into(busy).cost).toBeGreaterThan(into(calm).cost)
    expect(into(busy).capacity).toBeLessThan(into(calm).capacity)
  })

  it('has no exits when the site is not configured, and says so rather than inventing one', () => {
    const graph = buildCrowdGraph(snapshotAt(60), settings, cloneProfile('generic'))
    expect(graph.nodesOfKind('exit')).toHaveLength(0)
    const flow = analyseFlow(graph, 100)
    expect(flow.maxFlow).toBe(0)
    expect(flow.evacSeconds).toBe(Infinity)
  })

  it('handles an empty snapshot without throwing', () => {
    const graph = buildCrowdGraph({ ...emptySnapshot([]), zones: [] }, settings, site)
    expect(graph.nodesOfKind('zone')).toHaveLength(0)
  })
})

describe('risk engine', () => {
  it('risk bands agree with the thresholds', () => {
    const cells = criticalDensity(settings) / settings.critical
    expect(riskBand(settings.critical * cells, settings).band).toBe(3)
    expect(riskBand(settings.warning * cells, settings).band).toBe(2)
    expect(riskBand(0, settings).band).toBe(0)
  })

  it('ranks the crowded staircase zone first in the scripted scenario', () => {
    const graph = buildCrowdGraph(snapshotAt(62), settings, site)
    const { ranked } = rankZones(graph)
    expect(ranked[0].name).toBe('B3')
    expect(ranked[0].rank).toBe(1)
    expect(ranked[0].score).toBeGreaterThan(ranked[ranked.length - 1].score)
  })

  it('merge sort and quick sort produce the identical ranking on real zone data', () => {
    const graph = buildCrowdGraph(snapshotAt(62), settings, site)
    const { merge, quick, agree } = compareSorts(graph)
    expect(agree).toBe(true)
    expect(merge.ranked.map((z) => z.name)).toEqual(quick.ranked.map((z) => z.name))
    expect(merge.stats.comparisons).toBeGreaterThan(0)
    expect(quick.stats.comparisons).toBeGreaterThan(0)
  })
})

describe('flow analysis on the real station', () => {
  it('reports a finite throughput and clearance time', () => {
    const snap = snapshotAt(62)
    const graph = buildCrowdGraph(snap, settings, site)
    const people = graph.nodesOfKind('zone').reduce((a, n) => a + n.people, 0)
    const flow = analyseFlow(graph, people)
    expect(flow.maxFlow).toBeGreaterThan(0)
    expect(flow.evacSeconds).toBeGreaterThan(0)
    expect(Number.isFinite(flow.evacSeconds)).toBe(true)
  })

  it('min cut capacity equals the max flow', () => {
    const graph = buildCrowdGraph(snapshotAt(62), settings, site)
    const flow = analyseFlow(graph, 200)
    expect(flow.cut.capacity).toBeCloseTo(flow.maxFlow, 6)
  })

  it('names at least one real bottleneck, never a book-keeping edge', () => {
    const flow = analyseFlow(buildCrowdGraph(snapshotAt(62), settings, site), 200)
    expect(flow.bottlenecks.length).toBeGreaterThan(0)
    expect(flow.bottlenecks.every((b) => b.kind !== 'source')).toBe(true)
  })

  it('throughput falls as the crowd builds, because congestion cuts link capacity', () => {
    const calm = analyseFlow(buildCrowdGraph(snapshotAt(0), settings, site), 100)
    const busy = analyseFlow(buildCrowdGraph(snapshotAt(62), settings, site), 100)
    expect(busy.maxFlow).toBeLessThan(calm.maxFlow)
  })

  it('adding capacity to a cut link raises throughput; that is the point of the cut', () => {
    const graph = buildCrowdGraph(snapshotAt(62), settings, site)
    const before = analyseFlow(graph, 200)
    const cutIds = new Set(before.cut.cutEdges.map((e) => e.label?.edgeId).filter(Boolean))
    const widened = graph.mapEdges((e) => (cutIds.has(e.id) ? { capacity: e.capacity * 3 } : null))
    const after = analyseFlow(widened, 200)
    expect(after.maxFlow).toBeGreaterThan(before.maxFlow)
  })
})

describe('intervention engine', () => {
  it('generates candidates from the cut, each with a stated reason', () => {
    const d = analyse(snapshotAt(62))
    expect(d.candidates.length).toBeGreaterThan(0)
    for (const c of d.candidates) {
      expect(c.why).toBeTruthy()
      expect(c.cost).toBeGreaterThan(0)
    }
  })

  it('evaluating a plan with extra exit capacity shortens the measured clearance time', () => {
    const snap = snapshotAt(62)
    const d = analyse(snap)
    const exitAction = d.candidates.find((c) => c.kind === 'exit-capacity')
    expect(exitAction).toBeTruthy()
    const after = evaluatePlan(d.graph, d.people, [exitAction])
    expect(after.maxFlow).toBeGreaterThan(d.flow.maxFlow)
    expect(after.evacSeconds).toBeLessThan(d.flow.evacSeconds)
  })

  it('pausing entry lowers the number of people to move, not the throughput', () => {
    const d = analyse(snapshotAt(62))
    const pause = d.candidates.find((c) => c.kind === 'inflow')
    if (!pause) return // no entry feeds a loaded zone in this frame
    const after = evaluatePlan(d.graph, d.people, [pause])
    expect(after.people).toBeLessThan(d.people)
    expect(after.maxFlow).toBeCloseTo(d.flow.maxFlow, 6)
  })

  it('an empty plan reproduces the baseline exactly', () => {
    const d = analyse(snapshotAt(62))
    const base = evaluatePlan(d.graph, d.people, [])
    expect(base.maxFlow).toBeCloseTo(d.flow.maxFlow, 6)
  })
})

describe('the whole pipeline', () => {
  it('produces a decision with every stage filled in', () => {
    const d = analyse(snapshotAt(62), { withBacktracking: true })
    expect(d.focus).toBeTruthy()
    expect(d.ranking.ranked.length).toBe(DEFAULT_ZONES.length)
    expect(d.reach.exits.length).toBeGreaterThan(0)
    expect(d.route.reachable).toBe(true)
    expect(d.flow.maxFlow).toBeGreaterThan(0)
    expect(d.greedy.steps.length).toBeGreaterThan(0)
    expect(d.allocation.dp.feasible).toBe(true)
    expect(d.whatIf.stats.searchSpace).toBeGreaterThan(0)
    expect(d.recommendation.headline).toBeTruthy()
    expect(d.recommendation.lines.length).toBeGreaterThan(2)
  })

  it('times every stage', () => {
    const d = analyse(snapshotAt(62))
    for (const key of ['graph', 'partition', 'sort', 'bfs', 'dfs', 'dijkstra', 'maxflow', 'greedy', 'knapsack']) {
      expect(d.timings[key]).toBeGreaterThanOrEqual(0)
    }
  })

  it('focuses on the staircase zone once the crowd funnels there', () => {
    expect(analyse(snapshotAt(62)).focus.name).toBe('B3')
  })

  it('the recommendation changes as the situation worsens', () => {
    const calm = analyse(snapshotAt(0))
    const crisis = analyse(snapshotAt(62))
    expect(crisis.focus.band).toBeGreaterThan(calm.focus.band)
    expect(crisis.flow.evacSeconds).toBeGreaterThan(calm.flow.evacSeconds)
    expect(crisis.recommendation.headline).not.toBe(calm.recommendation.headline)
  })

  it('the recommended plan is predicted to clear the site faster than doing nothing', () => {
    const d = analyse(snapshotAt(62))
    if (!d.greedy.chosen.length) return
    expect(d.recommendation.after).toBeLessThanOrEqual(d.recommendation.before)
  })

  it('the backtracking plan is never worse than the greedy plan', () => {
    const d = analyse(snapshotAt(62), { withBacktracking: true })
    // Both are scored by the same flow model, so they are directly comparable.
    expect(d.whatIf.best.evacSeconds).toBeLessThanOrEqual(d.greedy.outcome.evacSeconds + 1e-6)
  })

  it('backtracking prunes part of its search space', () => {
    const d = analyse(snapshotAt(62), { withBacktracking: true })
    const { stats } = d.whatIf
    expect(stats.prunedByBudget + stats.prunedByBound + stats.prunedByStaff).toBeGreaterThan(0)
    expect(stats.nodesVisited).toBeLessThan(2 * stats.searchSpace + 2)
  })

  it('the knapsack optimum is never beaten by greedy on estimated risk points', () => {
    const d = analyse(snapshotAt(62))
    expect(d.optimal.best).toBeGreaterThanOrEqual(d.greedy.totalReduction)
  })

  it('the capacity search answers the target-clearance question', () => {
    const d = analyse(snapshotAt(62), { limits: { ...DEFAULT_LIMITS, targetClearanceSeconds: 30 } })
    expect(d.capacityNeeded.needed === null || d.capacityNeeded.needed >= 0).toBe(true)
    if (d.capacityNeeded.needed) expect(d.capacityNeeded.stats.evaluations).toBeLessThan(20)
  })

  it('survives an empty site with no zones and no exits', () => {
    const d = analyseCrowdState({ snap: { ...emptySnapshot([]), zones: [] }, settings, site: cloneProfile('generic') })
    expect(d.people).toBe(0)
    expect(d.recommendation.headline).toMatch(/nothing to analyse/)
  })

  it('survives a configured site with nobody in it', () => {
    const d = analyse({ ...emptySnapshot(DEFAULT_ZONES), zones: DEFAULT_ZONES })
    expect(d.people).toBe(0)
    expect(d.recommendation).toBeTruthy()
  })

  it('reports no reachable exit when the site has none configured', () => {
    const d = analyseCrowdState({ snap: snapshotAt(62), settings, site: cloneProfile('generic') })
    expect(d.route).toBeNull()
    expect(d.flow.maxFlow).toBe(0)
  })

  it('is deterministic: the same snapshot gives the same decision', () => {
    const snap = snapshotAt(62)
    const a = analyse(snap)
    const b = analyse(snap)
    expect(b.flow.maxFlow).toBe(a.flow.maxFlow)
    expect(b.recommendation.lines).toEqual(a.recommendation.lines)
    expect(b.greedy.chosen.map((c) => c.id)).toEqual(a.greedy.chosen.map((c) => c.id))
  })

  it('runs fast enough for the live loop', () => {
    const snap = snapshotAt(62)
    const t0 = performance.now()
    analyse(snap)
    expect(performance.now() - t0).toBeLessThan(400)
  })
})
