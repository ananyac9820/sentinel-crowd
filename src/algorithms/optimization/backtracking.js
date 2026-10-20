// Backtracking search over intervention combinations: the "what if" planner.
//
// THE PROBLEM: greedy and the knapsack DP both score an intervention by a single number fixed
// in advance (its risk reduction). But interventions INTERACT. Opening a second staircase adds
// nothing if the corridor feeding it is the real bottleneck; pausing entry helps far more once
// a gate is already open. The only way to score a SET honestly is to rebuild the flow network
// with that whole set applied and measure the resulting evacuation time -- which means the
// objective cannot be decomposed into per-item values, so the DP formulation no longer holds.
//
// THE METHOD: explore the decision tree. At depth i, decide to include intervention i or not;
// at depth n, evaluate the complete set. Each of n interventions is a binary choice, so the
// tree has 2^n leaves. We do not hide that: with 8 candidate actions there are 256 complete
// plans, and the UI reports how many were actually visited.
//
// PRUNING -- the three rules that make it tractable:
//   1. INFEASIBLE PREFIX. Cost and staff only ever grow as the set grows, so once a partial set
//      is over budget every extension of it is too. Cut the whole subtree.
//   2. BOUND. Adding capacity can never make evacuation slower, so the best conceivable result
//      from this branch is the evacuation time with ALL remaining candidates added. That is an
//      optimistic (admissible) bound -- it is never worse than any real descendant. If even
//      that bound cannot beat the best complete plan found so far, cut the subtree. This is the
//      branch-and-bound idea: the bound must be optimistic, or correct answers get discarded.
//   3. SAFETY. A set that strands a zone (leaves it with no route to an exit) is rejected
//      outright, and so is any extension of it that keeps the offending closure.
//
// ORDERING: candidates are examined in descending capacity gain. Finding a good plan early
// makes the bound in rule 2 tight sooner, which prunes far more of the tree. The answer is the
// same either way; only the node count changes.
//
// Time : O(2^n) worst case, times the cost of one evaluate() call (a max flow). Pruning
//        typically cuts this by a large factor but changes no worst-case bound -- an adversarial
//        input where every subset is feasible and no bound ever bites still visits every node.
// Space: O(n) for the recursion stack and the current partial set.

/**
 * @param {Array} candidates each { id, label, cost, staff, capacityGain, ... }
 * @param {object} config
 *   evaluate(subset)      => { evacSeconds, risk, ... }  the real objective, usually a max flow
 *   bound(subset, rest)   => optimistic evacSeconds for any completion (lower is better)
 *   isSafe(subset)        => boolean, rejects plans that strand a zone
 *   budget, staff, maxActions
 *   nodeLimit             hard stop so the UI can never hang on a huge candidate list
 */
export function planByBacktracking(candidates, { evaluate, bound, isSafe, budget = Infinity, staff = Infinity, maxActions = Infinity, nodeLimit = 20000 } = {}) {
  const stats = { nodesVisited: 0, leavesEvaluated: 0, prunedByBudget: 0, prunedByBound: 0, prunedByStaff: 0, rejectedUnsafe: 0, maxDepth: 0, searchSpace: 0, limitHit: false }
  // Most promising first, so the bound tightens early (see ORDERING above).
  const items = [...(candidates ?? [])].sort((a, b) => (b.capacityGain ?? 0) - (a.capacityGain ?? 0))
  const n = items.length
  stats.searchSpace = n ? 2 ** n : 0

  const baseline = evaluate([])
  let best = { subset: [], ...baseline, cost: 0, staff: 0 }
  const explored = [] // a trace of the search, for the tree view in the Algorithm Lab

  const recurse = (i, subset, cost, staffUsed) => {
    if (stats.nodesVisited >= nodeLimit) {
      stats.limitHit = true
      return
    }
    stats.nodesVisited++
    stats.maxDepth = Math.max(stats.maxDepth, subset.length)

    // ---- Complete assignment: score it ----
    if (i === n) {
      stats.leavesEvaluated++
      const result = evaluate(subset)
      const better = result.evacSeconds < best.evacSeconds - 1e-9 || (Math.abs(result.evacSeconds - best.evacSeconds) <= 1e-9 && cost < best.cost)
      explored.push({ depth: subset.length, ids: subset.map((s) => s.id), evacSeconds: result.evacSeconds, cost, outcome: better ? 'new best' : 'evaluated' })
      if (better) best = { subset: [...subset], ...result, cost, staff: staffUsed }
      return
    }

    const rest = items.slice(i)
    // ---- Rule 2: branch-and-bound on the optimistic completion ----
    if (bound) {
      const optimistic = bound(subset, rest)
      if (optimistic >= best.evacSeconds - 1e-9) {
        stats.prunedByBound++
        explored.push({ depth: subset.length, ids: subset.map((s) => s.id), pruned: 'bound', bound: optimistic, best: best.evacSeconds })
        return
      }
    }

    const iv = items[i]

    // ---- Branch A: take intervention i ----
    const nextCost = cost + (iv.cost ?? 0)
    const nextStaff = staffUsed + (iv.staff ?? 0)
    if (nextCost > budget) {
      stats.prunedByBudget++ // rule 1: cost never decreases, so no extension can fit either
      explored.push({ depth: subset.length + 1, ids: [...subset.map((s) => s.id), iv.id], pruned: 'budget', cost: nextCost, budget })
    } else if (nextStaff > staff) {
      stats.prunedByStaff++
      explored.push({ depth: subset.length + 1, ids: [...subset.map((s) => s.id), iv.id], pruned: 'staff', staff: nextStaff })
    } else if (subset.length + 1 > maxActions) {
      stats.prunedByBudget++
      explored.push({ depth: subset.length + 1, ids: [...subset.map((s) => s.id), iv.id], pruned: 'action limit' })
    } else {
      subset.push(iv)
      if (isSafe && !isSafe(subset)) {
        stats.rejectedUnsafe++ // rule 3
        explored.push({ depth: subset.length, ids: subset.map((s) => s.id), pruned: 'would strand a zone' })
      } else {
        recurse(i + 1, subset, nextCost, nextStaff)
      }
      subset.pop() // undo the choice: this is the "backtrack"
    }

    // ---- Branch B: skip intervention i ----
    recurse(i + 1, subset, cost, staffUsed)
  }

  recurse(0, [], 0, 0)

  return {
    best,
    baseline,
    improvementSeconds: Math.max(0, baseline.evacSeconds - best.evacSeconds),
    explored: explored.slice(0, 400), // the trace is for display only
    stats,
  }
}

export default planByBacktracking
