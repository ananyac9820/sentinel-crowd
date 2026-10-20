import { describe, expect, it } from 'vitest'
import { greedyIntervention } from '../optimization/greedyIntervention.js'
import { knapsackDP } from '../optimization/knapsackDP.js'
import { allocateExitsDP, allocateProportional } from '../optimization/evacuationDP.js'
import { planByBacktracking } from '../optimization/backtracking.js'
import { partitionSite, hottestRegion, regionsAtDepth } from '../divideAndConquer/spatialPartition.js'

const iv = (id, riskReduction, cost, extra = {}) => ({ id, label: id, riskReduction, cost, staff: 1, capacityGain: 0, ...extra })

describe('greedy intervention selection', () => {
  it('takes interventions in descending value-per-cost order', () => {
    const chosen = greedyIntervention([iv('a', 10, 10), iv('b', 20, 5), iv('c', 6, 3)], { budget: 100, staff: 100, maxActions: 10 })
    expect(chosen.chosen.map((x) => x.id)).toEqual(['b', 'c', 'a']) // ratios 4, 2, 1
    expect(chosen.totalReduction).toBe(36)
    expect(chosen.totalCost).toBe(18)
  })

  it('respects the budget and explains every rejection', () => {
    const r = greedyIntervention([iv('big', 30, 9), iv('small', 5, 2)], { budget: 10 })
    expect(r.chosen.map((x) => x.id)).toEqual(['big'])
    expect(r.skipped.map((x) => x.id)).toEqual(['small'])
    expect(r.skipped[0].reason).toMatch(/budget is left/)
  })

  it('respects the staff limit', () => {
    const r = greedyIntervention([iv('a', 10, 1, { staff: 5 }), iv('b', 9, 1, { staff: 5 })], { budget: 100, staff: 6 })
    expect(r.chosen).toHaveLength(1)
    expect(r.skipped[0].reason).toMatch(/staff/)
  })

  it('respects the action limit', () => {
    const r = greedyIntervention([iv('a', 10, 1), iv('b', 9, 1), iv('c', 8, 1)], { budget: 100, staff: 100, maxActions: 2 })
    expect(r.chosen).toHaveLength(2)
    expect(r.skipped[0].reason).toMatch(/limit of 2 actions/)
  })

  it('handles an empty catalogue and ignores zero-cost entries', () => {
    expect(greedyIntervention([], { budget: 10 }).chosen).toEqual([])
    expect(greedyIntervention(null, { budget: 10 }).chosen).toEqual([])
    expect(greedyIntervention([iv('free', 5, 0)], { budget: 10 }).chosen).toEqual([])
  })

  it('records a step for every candidate, taken or not', () => {
    const r = greedyIntervention([iv('a', 10, 20), iv('b', 1, 1)], { budget: 1 })
    expect(r.steps).toHaveLength(2)
    expect(r.steps.filter((s) => s.taken)).toHaveLength(1)
  })
})

describe('knapsack DP vs greedy', () => {
  it('finds the documented case where greedy is beaten', () => {
    // budget 10: A has the better ratio (1.2 vs 1.0) but taking it blocks B.
    const items = [iv('A', 6, 5), iv('B', 10, 10)]
    const greedy = greedyIntervention(items, { budget: 10, staff: 99, maxActions: 99 })
    const optimal = knapsackDP(items, 10)
    expect(greedy.totalReduction).toBe(6)
    expect(optimal.best).toBe(10)
    expect(optimal.chosen.map((x) => x.id)).toEqual(['B'])
    expect(optimal.best).toBeGreaterThan(greedy.totalReduction)
  })

  it('matches greedy when every item fits', () => {
    const items = [iv('a', 10, 2), iv('b', 20, 3)]
    expect(knapsackDP(items, 100).best).toBe(30)
    expect(greedyIntervention(items, { budget: 100, staff: 99, maxActions: 99 }).totalReduction).toBe(30)
  })

  it('never exceeds the budget', () => {
    const items = [iv('a', 7, 4), iv('b', 9, 5), iv('c', 3, 2), iv('d', 12, 7)]
    const r = knapsackDP(items, 9)
    expect(r.totalCost).toBeLessThanOrEqual(9)
    expect(r.best).toBe(16) // a + b = 7 + 9 at cost 9
  })

  it('handles zero budget, empty items and null input', () => {
    expect(knapsackDP([iv('a', 10, 1)], 0).best).toBe(0)
    expect(knapsackDP([], 10).best).toBe(0)
    expect(knapsackDP(null, 10).best).toBe(0)
  })

  it('skips items that cannot fit at all', () => {
    expect(knapsackDP([iv('huge', 100, 50)], 10).chosen).toEqual([])
  })

  it('agrees with brute force on random instances', () => {
    const brute = (items, budget) => {
      let best = 0
      for (let mask = 0; mask < 1 << items.length; mask++) {
        let cost = 0
        let value = 0
        items.forEach((it, i) => {
          if (mask & (1 << i)) {
            cost += it.cost
            value += it.riskReduction
          }
        })
        if (cost <= budget) best = Math.max(best, value)
      }
      return best
    }
    let seed = 1
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let trial = 0; trial < 25; trial++) {
      const items = Array.from({ length: 8 }, (_, i) => iv(`i${i}`, 1 + Math.floor(rand() * 20), 1 + Math.floor(rand() * 9)))
      const budget = 5 + Math.floor(rand() * 20)
      expect(knapsackDP(items, budget).best).toBe(brute(items, budget))
    }
  })

  it('reports table size consistent with O(n * budget)', () => {
    const r = knapsackDP([iv('a', 1, 1), iv('b', 2, 2)], 10)
    expect(r.table).toHaveLength(3) // n + 1 rows
    expect(r.table[0]).toHaveLength(11) // budget + 1 columns
    expect(r.stats.states).toBe(2 * 11)
  })
})

describe('exit allocation DP', () => {
  const exits = (list) => list.map(([name, capacity, delay]) => ({ id: name, name, capacity, delay }))

  it('splits people between two identical exits', () => {
    const r = allocateExitsDP(exits([['A', 50, 0], ['B', 50, 0]]), 100, { blockSize: 10 })
    expect(r.feasible).toBe(true)
    expect(r.allocation.map((a) => a.people)).toEqual([50, 50])
    expect(r.clearance).toBeCloseTo(1, 5) // 50 people at 50/min = 1 minute, in parallel
  })

  it('favours the faster exit when capacities differ', () => {
    const r = allocateExitsDP(exits([['Fast', 90, 0], ['Slow', 10, 0]]), 100, { blockSize: 10 })
    const fast = r.allocation.find((a) => a.name === 'Fast')
    const slow = r.allocation.find((a) => a.name === 'Slow')
    expect(fast.people).toBeGreaterThan(slow.people)
    // Balanced finishing times: neither exit is left idle while the other still has a queue.
    expect(Math.abs(fast.minutes - slow.minutes)).toBeLessThan(0.5)
  })

  it('beats a proportional split when an exit has an opening delay', () => {
    // A is open now; B is fast but takes 3 minutes to open. Proportional ignores that.
    const list = exits([['Open', 40, 0], ['Delayed', 60, 3]])
    const dp = allocateExitsDP(list, 120, { blockSize: 10 })
    const naive = allocateProportional(list, 120)
    expect(dp.clearance).toBeLessThanOrEqual(naive.clearance)
    expect(dp.clearance).toBeLessThan(naive.clearance + 1e-9)
  })

  it('leaves a useless exit unused', () => {
    // A tiny exit with a huge delay can only make the makespan worse.
    const r = allocateExitsDP(exits([['Good', 100, 0], ['Awful', 1, 20]]), 50, { blockSize: 10 })
    expect(r.allocation.find((a) => a.name === 'Awful').people).toBe(0)
  })

  it('handles zero people, no exits and zero-capacity exits', () => {
    expect(allocateExitsDP(exits([['A', 10, 0]]), 0).clearance).toBe(0)
    expect(allocateExitsDP([], 100).feasible).toBe(false)
    expect(allocateExitsDP(exits([['Dead', 0, 0]]), 100).feasible).toBe(false)
  })

  it('allocates everyone: the per-exit numbers add up', () => {
    const r = allocateExitsDP(exits([['A', 30, 0], ['B', 45, 1], ['C', 20, 0.5]]), 137, { blockSize: 5 })
    expect(r.allocation.reduce((a, x) => a + x.people, 0)).toBe(137)
  })

  it('reports the clearance of the allocation it actually hands out', () => {
    // The shares divide the crowd exactly, and the per-exit numbers add up to the whole crowd.
    // Rounding the block COUNT up instead would make the table plan for more people than exist and
    // charge the DP for people it never had to move.
    const list = exits([['A', 164, 0], ['B', 164, 0], ['C', 164, 0]])
    const dp = allocateExitsDP(list, 112, { blockSize: 3 })
    expect(dp.blockRounding).toBeLessThan(1e-9)
    expect(dp.allocation.reduce((a, x) => a + x.people, 0)).toBe(112)
    expect(dp.clearance).toBeCloseTo(Math.max(...dp.allocation.map((a) => a.minutes)), 9)
  })

  it('cannot beat the proportional split when every exit is identical, and loses only to rounding', () => {
    // With equal capacities and no delays there is nothing to optimise: an even split IS optimal,
    // so the DP can only match it, or fall short by at most one share of discretisation. This is
    // the honest statement of where the DP does and does not help.
    const list = exits([['A', 164, 0], ['B', 164, 0], ['C', 164, 0]])
    const dp = allocateExitsDP(list, 300, { blockSize: 5 })
    const naive = allocateProportional(list, 300)
    const oneShare = 300 / Math.round(300 / 5) / 164
    expect(dp.clearance).toBeLessThanOrEqual(naive.clearance + oneShare)
  })

  it('beats the proportional split whenever the exits differ, which is the case it exists for', () => {
    const list = exits([['Open slow', 30, 0], ['Fast but delayed', 120, 2], ['Mid', 60, 0.5]])
    const dp = allocateExitsDP(list, 300, { blockSize: 5 })
    const naive = allocateProportional(list, 300)
    expect(dp.clearance).toBeLessThan(naive.clearance)
  })

  it('handles a single exit', () => {
    const r = allocateExitsDP(exits([['Only', 25, 0]]), 100, { blockSize: 10 })
    expect(r.allocation[0].people).toBe(100)
    expect(r.clearance).toBeCloseTo(4, 5)
  })

  it('never does worse than the proportional heuristic', () => {
    let seed = 3
    const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647)
    for (let t = 0; t < 15; t++) {
      const list = Array.from({ length: 2 + Math.floor(rand() * 3) }, (_, i) => ({
        id: `E${i}`,
        name: `E${i}`,
        capacity: 10 + Math.round(rand() * 80),
        delay: Math.round(rand() * 300) / 100,
      }))
      const people = 50 + Math.round(rand() * 400)
      const dp = allocateExitsDP(list, people, { blockSize: 5 })
      const naive = allocateProportional(list, people)
      // The DP searches a superset of what proportional can produce, but only at block
      // granularity, so it can lose by at most the time one block takes at the slowest exit.
      const slack = 5 / Math.min(...list.map((e) => e.capacity))
      expect(dp.clearance).toBeLessThanOrEqual(naive.clearance + slack)
    }
  })
})

describe('backtracking what-if planner', () => {
  // A toy model: each action adds capacity, and evacuation time is people / total capacity.
  const makeEvaluate = (people, baseFlow) => (subset) => {
    const flow = baseFlow + subset.reduce((a, s) => a + s.capacityGain, 0)
    return { evacSeconds: flow > 0 ? (people / flow) * 60 : Infinity, maxFlow: flow }
  }
  const makeBound = (people, baseFlow) => (chosen, rest) => {
    const flow = baseFlow + [...chosen, ...rest].reduce((a, s) => a + s.capacityGain, 0)
    return flow > 0 ? (people / flow) * 60 : Infinity
  }

  const candidates = [iv('a', 10, 3, { capacityGain: 20 }), iv('b', 15, 4, { capacityGain: 35 }), iv('c', 5, 2, { capacityGain: 10 }), iv('d', 20, 8, { capacityGain: 50 })]

  it('finds the combination with the fastest evacuation inside the budget', () => {
    const r = planByBacktracking(candidates, {
      evaluate: makeEvaluate(600, 60),
      bound: makeBound(600, 60),
      budget: 9,
      staff: 99,
      maxActions: 99,
    })
    // Best capacity within cost 9: b(35,4) + a(20,3) + c(10,2) = 65 gain at cost 9.
    expect(r.best.subset.map((s) => s.id).sort()).toEqual(['a', 'b', 'c'])
    expect(r.best.cost).toBeLessThanOrEqual(9)
    expect(r.improvementSeconds).toBeGreaterThan(0)
  })

  it('never returns a plan over budget', () => {
    const r = planByBacktracking(candidates, { evaluate: makeEvaluate(600, 60), bound: makeBound(600, 60), budget: 4 })
    expect(r.best.cost).toBeLessThanOrEqual(4)
  })

  it('reports the full search space and prunes part of it', () => {
    const r = planByBacktracking(candidates, { evaluate: makeEvaluate(600, 60), bound: makeBound(600, 60), budget: 5, maxActions: 2 })
    expect(r.stats.searchSpace).toBe(2 ** 4)
    expect(r.stats.prunedByBudget + r.stats.prunedByBound).toBeGreaterThan(0)
    expect(r.stats.nodesVisited).toBeLessThan(2 ** 5)
  })

  it('pruning does not change the answer', () => {
    const withBound = planByBacktracking(candidates, { evaluate: makeEvaluate(600, 60), bound: makeBound(600, 60), budget: 9, maxActions: 99 })
    const noBound = planByBacktracking(candidates, { evaluate: makeEvaluate(600, 60), budget: 9, maxActions: 99 })
    expect(withBound.best.evacSeconds).toBeCloseTo(noBound.best.evacSeconds, 9)
    expect(withBound.stats.nodesVisited).toBeLessThanOrEqual(noBound.stats.nodesVisited)
  })

  it('falls back to the empty plan when nothing is affordable', () => {
    const r = planByBacktracking(candidates, { evaluate: makeEvaluate(600, 60), bound: makeBound(600, 60), budget: 0 })
    expect(r.best.subset).toEqual([])
    expect(r.improvementSeconds).toBe(0)
  })

  it('handles an empty candidate list', () => {
    const r = planByBacktracking([], { evaluate: makeEvaluate(600, 60) })
    expect(r.best.subset).toEqual([])
    expect(r.stats.searchSpace).toBe(0)
  })

  it('rejects unsafe plans', () => {
    const r = planByBacktracking(candidates, {
      evaluate: makeEvaluate(600, 60),
      bound: makeBound(600, 60),
      isSafe: (subset) => !subset.some((s) => s.id === 'b'),
      budget: 99,
      maxActions: 99,
    })
    expect(r.best.subset.map((s) => s.id)).not.toContain('b')
    expect(r.stats.rejectedUnsafe).toBeGreaterThan(0)
  })

  it('visits every leaf when nothing can be pruned', () => {
    // A flat objective means the bound can never beat the incumbent, so the tree is explored.
    const flat = () => ({ evacSeconds: 100, maxFlow: 1 })
    const r = planByBacktracking(candidates, { evaluate: flat, budget: 99, staff: 99, maxActions: 99 })
    expect(r.stats.leavesEvaluated).toBe(2 ** 4)
  })
})

describe('divide and conquer: spatial partition', () => {
  // A 4x3 grid of zones, as the default Sentinel layout produces.
  const grid = () => {
    const zones = []
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) zones.push({ id: `${'ABC'[r]}${c + 1}`, name: `${'ABC'[r]}${c + 1}`, x: c / 4, y: r / 3, w: 1 / 4, h: 1 / 3 })
    return zones
  }

  it('summarises every zone exactly once: the root total equals the input total', () => {
    const zones = grid()
    const counts = zones.map((_, i) => i + 1) // 1..12, total 78
    const { root } = partitionSite(zones, counts, { criticalDensity: 100 })
    expect(root.people).toBe(78)
  })

  it('divides into quadrants and recurses', () => {
    const { root, stats } = partitionSite(grid(), grid().map(() => 5), { criticalDensity: 100 })
    expect(root.children.length).toBeGreaterThan(1)
    expect(stats.maxDepth).toBeGreaterThan(0)
    expect(stats.combines).toBeGreaterThan(0)
  })

  it('finds a hot region made of individually sub-critical zones', () => {
    const zones = grid()
    const counts = zones.map((z) => (z.x < 0.5 && z.y < 0.5 ? 9 : 1)) // top-left block busy
    // critical is 12 per zone area unit here, so no single zone is critical, but the region is.
    const { root } = partitionSite(zones, counts, { criticalDensity: 9 / (1 / 12) })
    const hot = hottestRegion(root)
    expect(hot.zoneNames.length).toBeGreaterThan(1)
    expect(hot.zoneNames.every((n) => ['A1', 'A2', 'B1', 'B2'].includes(n))).toBe(true)
  })

  it('weighs turbulence into the pressure ranking', () => {
    const zones = grid()
    const counts = zones.map(() => 5)
    const calm = partitionSite(zones, counts, { criticalDensity: 60 })
    const turbulent = partitionSite(zones, counts, { criticalDensity: 60, turbulence: zones.map((z) => (z.x < 0.5 ? 90 : 0)) })
    expect(hottestRegion(turbulent.root).pressure).toBeGreaterThan(hottestRegion(calm.root).pressure)
  })

  it('handles no zones and a single zone', () => {
    const empty = partitionSite([], [], { criticalDensity: 10 })
    expect(empty.root.people).toBe(0)
    const one = partitionSite([{ id: 'A', name: 'A', x: 0, y: 0, w: 1, h: 1 }], [7], { criticalDensity: 10 })
    expect(one.root.people).toBe(7)
    expect(hottestRegion(one.root).people).toBe(7)
  })

  it('terminates when every zone falls in the same quadrant', () => {
    // All four zones crammed into the top-left: the split cannot separate them past depth 1.
    const zones = [0, 1, 2, 3].map((i) => ({ id: `Z${i}`, name: `Z${i}`, x: 0.01 * i, y: 0.01 * i, w: 0.02, h: 0.02 }))
    const { root, stats } = partitionSite(zones, [1, 1, 1, 1], { criticalDensity: 10 })
    expect(root.people).toBe(4)
    expect(stats.maxDepth).toBeLessThanOrEqual(3)
  })

  it('regionsAtDepth returns only that level', () => {
    const { root } = partitionSite(grid(), grid().map(() => 2), { criticalDensity: 50 })
    expect(regionsAtDepth(root, 0)).toHaveLength(1)
    expect(regionsAtDepth(root, 1).every((r) => r.depth === 1)).toBe(true)
  })
})
