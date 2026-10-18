// Backtracking "what-if" planner: the exact answer that the greedy plan is compared against.
// It walks the include / exclude decision tree for every intervention, and prunes a branch as soon
// as adding an intervention would exceed the budget (none of that subtree can be valid).
//
// Time O(2^m * T_obj) in the worst case (m interventions, every subset within budget).
// That is exponential, which is fine for Sentinel's handful of actions but is exactly why the
// greedy method exists for larger action sets. Space O(m) for the recursion.

export function backtrackBest({ candidates, objective, budget = Infinity }) {
  let best = null
  let explored = 0
  let pruned = 0

  const visit = (i, chosen, cost) => {
    if (i === candidates.length) {
      explored++
      const value = objective(chosen)
      // Lower objective wins; on a tie prefer the cheaper plan, then the smaller one.
      if (!best || value < best.value - 1e-9 || (Math.abs(value - best.value) <= 1e-9 && (cost < best.cost || (cost === best.cost && chosen.length < best.selected.length)))) {
        best = { selected: [...chosen], value, cost }
      }
      return
    }
    const c = candidates[i]
    if (cost + c.cost <= budget) {
      chosen.push(c)
      visit(i + 1, chosen, cost + c.cost)
      chosen.pop()
    } else {
      pruned++ // the whole "include c" subtree is over budget
    }
    visit(i + 1, chosen, cost)
  }

  visit(0, [], 0)
  return { ...best, explored, pruned, total: 2 ** candidates.length }
}
