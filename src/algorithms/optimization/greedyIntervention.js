// Greedy intervention selection.
//
// THE PROBLEM: several interventions are available (open a gate, pause entry, make a corridor
// one-way, redirect a platform...). Each removes some predicted risk and costs some staff
// effort. Only a limited amount of effort is available right now. Which ones are ordered?
//
// THE GREEDY RULE: at every step take the available intervention with the best
// riskReduction / cost ratio that still fits in the remaining budget, commit to it, and never
// reconsider. This is the fractional-knapsack rule applied to an indivisible problem.
//
// WHY GREEDY IS THE RIGHT CHOICE *HERE*: during a developing crush the decision has to be made
// in the time it takes to read it. Greedy is O(n log n) -- one sort, one pass -- and produces a
// prioritised ORDER, not just a set, which is exactly what a radio instruction needs: "open
// Gate 2 first, then pause entry". It also degrades gracefully: if staff only manage the first
// two actions, those were the two best-value ones.
//
// WHERE GREEDY FAILS: this is a 0/1 knapsack problem, and the greedy ratio rule is NOT optimal
// for it. A cheap, high-ratio pick can spend budget that a bigger item needed. With a budget
// of 10 effort units:
//      A: reduction 6,  cost 5    ratio 1.20   <- greedy takes this first
//      B: reduction 10, cost 10   ratio 1.00
//   greedy: takes A, then B no longer fits (5 + 10 > 10), and stops at 6 risk points.
//   optimal: skip A, take B alone, for 10 risk points.
// The ratio rule IS optimal for the FRACTIONAL knapsack, where half of B could be taken; it is
// the indivisibility of "open a gate" that breaks it. This exact case is a unit test.
// Sentinel therefore runs the DP optimum (knapsackDP.js) alongside greedy and shows the gap.
// Greedy is presented as the fast response; the DP result as the optimal plan.
//
// Time : O(n log n) for the sort plus O(n) for the pass. With the ratios recomputed after each
//        pick (`recompute: true`) it becomes O(n^2), still trivial for a handful of actions.
// Space: O(n).

import { mergeSort } from '../sorting/mergeSort.js'

/**
 * @param {Array} interventions each { id, label, riskReduction, cost, staff, timeToEffect, ... }
 * @param {object} limits { budget, staff, maxActions }
 * @returns {{ chosen, skipped, steps, totalReduction, totalCost, stats }}
 */
export function greedyIntervention(interventions, { budget = Infinity, staff = Infinity, maxActions = Infinity } = {}) {
  const stats = { candidatesConsidered: 0, sortComparisons: 0, picks: 0, rejected: 0 }
  const items = (interventions ?? []).filter((iv) => iv && iv.cost > 0)

  // Sort once by value density, best first. Merge sort keeps ties in catalogue order, so the
  // recommended sequence is stable from frame to frame instead of flickering.
  const ranked = mergeSort(
    items.map((iv) => ({ ...iv, ratio: iv.riskReduction / iv.cost })),
    (a, b) => b.ratio - a.ratio,
  )
  stats.sortComparisons = ranked.stats.comparisons

  const chosen = []
  const skipped = []
  const steps = []
  let spent = 0
  let staffUsed = 0
  let reduction = 0

  for (const iv of ranked.sorted) {
    stats.candidatesConsidered++
    const overBudget = spent + iv.cost > budget
    const overStaff = staffUsed + (iv.staff ?? 0) > staff
    const overCount = chosen.length >= maxActions
    if (overBudget || overStaff || overCount) {
      stats.rejected++
      const reason = overCount ? `already at the limit of ${maxActions} actions` : overBudget ? `costs ${iv.cost} but only ${budget - spent} of the effort budget is left` : `needs ${iv.staff} staff but only ${staff - staffUsed} are free`
      skipped.push({ ...iv, reason })
      steps.push({ step: steps.length + 1, id: iv.id, label: iv.label, ratio: iv.ratio, taken: false, reason })
      continue
    }
    spent += iv.cost
    staffUsed += iv.staff ?? 0
    reduction += iv.riskReduction
    chosen.push(iv)
    stats.picks++
    steps.push({
      step: steps.length + 1,
      id: iv.id,
      label: iv.label,
      ratio: iv.ratio,
      taken: true,
      reduction: iv.riskReduction,
      cost: iv.cost,
      runningReduction: reduction,
      runningCost: spent,
      reason: `best remaining value: ${iv.riskReduction} risk points for ${iv.cost} effort (${iv.ratio.toFixed(2)} per unit)`,
    })
  }

  return {
    chosen,
    skipped,
    steps,
    totalReduction: reduction,
    totalCost: spent,
    totalStaff: staffUsed,
    capacityGain: chosen.reduce((a, iv) => a + (iv.capacityGain ?? 0), 0),
    stats,
  }
}

export default greedyIntervention
