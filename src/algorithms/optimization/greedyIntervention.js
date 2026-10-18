// Greedy intervention selection.
// At every step, try each remaining affordable intervention, measure its benefit with the CURRENT
// plan already applied (so the benefit is marginal, not stand-alone), and take the one with the
// best benefit / cost ratio. Stop when nothing helps, the budget runs out, or the goal is met.
//
// Greedy is fast and usually good, but it commits to the locally best step and never reconsiders,
// so it is NOT guaranteed to find the best combination. backtrackingPlanner.js checks it exactly.
//
// `objective(selected)` returns a value to MINIMISE (Sentinel: estimated evacuation time).
// Time: O(k * m) objective evaluations for k steps and m candidates (k <= m), so O(m^2 * T_obj)
// in the worst case. In Sentinel T_obj is one Edmonds-Karp run, O(V * E^2).

const EPS = 1e-9

export function greedySelect({ candidates, objective, budget = Infinity, isGoodEnough = () => false }) {
  const selected = []
  const steps = []
  let spent = 0
  let current = objective([])
  const initial = current
  let evaluations = 1
  let stopReason = 'No remaining intervention improves the objective'

  while (true) {
    if (isGoodEnough(current)) {
      stopReason = 'Goal reached'
      break
    }
    const remaining = candidates.filter((c) => !selected.includes(c))
    if (!remaining.length) {
      stopReason = 'All interventions used'
      break
    }
    const considered = remaining.map((c) => {
      const affordable = spent + c.cost <= budget
      if (!affordable) return { candidate: c, affordable, gain: null, ratio: null }
      const value = objective([...selected, c])
      evaluations++
      const gain = current - value
      return { candidate: c, affordable, gain, ratio: gain / c.cost, value }
    })
    let best = null
    for (const option of considered) {
      if (!option.affordable || option.gain <= EPS) continue
      if (!best || option.ratio > best.ratio + EPS) best = option
    }
    if (!best) {
      if (considered.every((o) => !o.affordable)) stopReason = 'Budget exhausted'
      break
    }
    selected.push(best.candidate)
    spent += best.candidate.cost
    steps.push({ chosen: best.candidate, gain: best.gain, ratio: best.ratio, before: current, after: best.value, spent, considered })
    current = best.value
  }

  return { selected, steps, initial, final: current, spent, evaluations, stopReason }
}
