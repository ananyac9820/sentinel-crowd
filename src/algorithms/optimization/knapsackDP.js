// 0/1 knapsack by dynamic programming: the OPTIMAL intervention set under an effort budget.
// This is the yardstick the greedy plan is measured against.
//
// PROBLEM        choose a subset of interventions maximising total risk reduction, subject to
//                total cost <= budget. Each intervention is taken once or not at all.
//
// WHY DP WORKS   Optimal substructure: the best solution using items 1..i with budget b either
//                excludes item i (and is then the best using 1..i-1 with budget b) or includes
//                it (and is then item i's value plus the best using 1..i-1 with budget
//                b - cost_i). Overlapping subproblems: the same (i, b) pair is reached by many
//                different choice sequences, so a plain recursion would recompute it
//                exponentially often. The table computes each one once.
//
// STATE          dp[i][b] = maximum risk reduction obtainable from the first i interventions
//                           using at most b units of effort.
// TRANSITION     dp[i][b] = max( dp[i-1][b],                            // skip item i
//                                dp[i-1][b - cost_i] + value_i )        // take item i, if it fits
// BASE CASE      dp[0][b] = 0 for every b -- no items means no reduction.
// ANSWER         dp[n][budget], with the chosen set recovered by walking the table backwards:
//                item i was taken exactly when dp[i][b] != dp[i-1][b].
//
// Time : O(n * budget). Space: O(n * budget) for the table kept so the set can be recovered
//        (a rolling two-row version would be O(budget) but could not reconstruct the choice).
//
// NOTE ON COMPLEXITY: O(n * budget) is *pseudo*-polynomial, not polynomial -- budget is a
// numeric value, not an input length, so it grows exponentially in the number of bits used to
// write the budget down. 0/1 knapsack is NP-hard, which is exactly why greedy remains useful.
// Sentinel's budgets are small integers (staff-minutes), so the table is tiny.

/**
 * @param {Array} items  each { id, label, riskReduction, cost } with integer cost >= 0
 * @param {number} budget integer
 */
export function knapsackDP(items, budget) {
  const stats = { states: 0, transitions: 0 }
  const list = (items ?? []).filter((it) => it && Number.isFinite(it.cost) && it.cost >= 0)
  const cap = Math.max(0, Math.floor(budget))
  const n = list.length
  if (!n || !cap) return { best: 0, chosen: [], table: [], stats, budget: cap }

  // dp has n+1 rows so row 0 can hold the base case.
  const dp = Array.from({ length: n + 1 }, () => new Array(cap + 1).fill(0))

  for (let i = 1; i <= n; i++) {
    const cost = Math.ceil(list[i - 1].cost)
    const value = list[i - 1].riskReduction ?? 0
    for (let b = 0; b <= cap; b++) {
      stats.states++
      const skip = dp[i - 1][b]
      if (cost > b) {
        dp[i][b] = skip // item i cannot fit in budget b at all
        continue
      }
      stats.transitions++
      const take = dp[i - 1][b - cost] + value
      dp[i][b] = Math.max(skip, take)
    }
  }

  // ---- Recover which items were taken, by walking backwards from dp[n][cap] ----
  const chosen = []
  let b = cap
  for (let i = n; i >= 1; i--) {
    if (dp[i][b] !== dp[i - 1][b]) {
      chosen.unshift(list[i - 1])
      b -= Math.ceil(list[i - 1].cost)
    }
  }

  return {
    best: dp[n][cap],
    chosen,
    totalCost: chosen.reduce((a, it) => a + it.cost, 0),
    capacityGain: chosen.reduce((a, it) => a + (it.capacityGain ?? 0), 0),
    table: dp,
    stats,
    budget: cap,
  }
}

export default knapsackDP
