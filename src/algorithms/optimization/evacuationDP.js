// Exit allocation by dynamic programming: how many people to send to each exit.
//
// PROBLEM        P people have to leave through m exits. Exit j passes cap_j people per minute
//                once it is working, and takes delay_j minutes to become usable (a closed gate
//                has to be unlocked and staffed; an already-open one has delay 0). Sending a
//                people to exit j therefore takes
//                        time_j(a) = delay_j + a / cap_j     minutes   (and 0 if a = 0)
//                The queues drain in parallel, so the site is clear when the LAST exit finishes:
//                        clearance = max over j of time_j(a_j)
//                Minimise that clearance subject to sum of a_j = P. This is a makespan
//                minimisation -- the same shape as scheduling jobs on unequal machines.
//
// WHY NOT JUST SPLIT BY CAPACITY? The obvious heuristic -- give each exit a share proportional
// to its capacity -- ignores the delays. A fast gate that takes 2 minutes to open may deserve
// fewer people than its capacity suggests, or none at all. The DP finds the split that balances
// the finishing times; the engine reports both so the difference is visible.
//
// WHY DP WORKS   Optimal substructure: in an optimal allocation, whatever number a is given to
//                exit 1, the remaining P - a people must themselves be allocated optimally
//                across exits 2..m -- otherwise swapping in the better sub-allocation would
//                lower the overall maximum. Overlapping subproblems: "allocate p people across
//                exits j..m" recurs for the same (j, p) along many different branches.
//
// STATE          dp[j][p] = the smallest achievable clearance time when exits j..m-1 are
//                           available and p blocks of people still have to be placed.
// TRANSITION     dp[j][p] = min over a = 0..p of  max( time_j(a), dp[j+1][p-a] )
// BASE CASE      dp[m][0] = 0            (no exits left and nobody left: done)
//                dp[m][p] = Infinity     (p > 0: people with nowhere to go -- infeasible)
// ANSWER         dp[0][P/blockSize], with the per-exit numbers recovered from a stored choice
//                table.
//
// People are counted in BLOCKS (default 5) to keep the table small; that is a deliberate
// discretisation, and the reported numbers are therefore multiples of the block size.
//
// Time : O(m * K^2) where K = ceil(P / blockSize) -- K+1 values of p per exit, and the inner
//        min scans up to K splits. Space: O(m * K) for the table and the choice table.

const EPS = 1e-9

/**
 * @param {Array} exits  each { id, name, capacity (people/min), delay (minutes, default 0) }
 * @param {number} people
 * @param {object} options { blockSize }
 */
export function allocateExitsDP(exits, people, { blockSize = 5 } = {}) {
  const stats = { states: 0, transitions: 0, blocks: 0, blockSize }
  const list = (exits ?? []).filter((e) => e && e.capacity > 0)
  const m = list.length
  const total = Math.max(0, Math.round(people))
  if (!m) return { feasible: false, clearance: Infinity, allocation: [], stats, reason: 'no usable exit' }
  if (!total) return { feasible: true, clearance: 0, allocation: list.map((e) => ({ ...e, people: 0, minutes: 0 })), stats }

  // People are discretised into K equal shares so the table stays small. `blockSize` is the
  // requested granularity; the share actually used is total/K, which divides the crowd EXACTLY.
  // Rounding K*blockSize up instead would make the table plan for more people than exist, and the
  // DP would then be charged for people it never had to move -- enough, on small crowds, to make
  // it look worse than the proportional split it beats.
  const K = Math.max(1, Math.round(total / blockSize))
  const share = total / K
  stats.blocks = K
  stats.blockSize = Math.round(share * 10) / 10

  // timeFor(j, blocks) -- minutes for exit j to pass that many shares of people.
  const timeFor = (j, blocks) => {
    if (blocks === 0) return 0 // an unused exit never becomes the bottleneck
    return (list[j].delay ?? 0) + (blocks * share) / list[j].capacity
  }

  // dp[j][p], with row m as the base case.
  const dp = Array.from({ length: m + 1 }, () => new Array(K + 1).fill(Infinity))
  const choice = Array.from({ length: m + 1 }, () => new Array(K + 1).fill(0))
  dp[m][0] = 0 // base case: nobody left, no exits left

  for (let j = m - 1; j >= 0; j--) {
    for (let p = 0; p <= K; p++) {
      stats.states++
      let best = Infinity
      let bestA = 0
      for (let a = 0; a <= p; a++) {
        stats.transitions++
        const rest = dp[j + 1][p - a]
        if (rest === Infinity) continue // that remainder cannot be placed at all
        const candidate = Math.max(timeFor(j, a), rest)
        if (candidate < best - EPS) {
          best = candidate
          bestA = a
        }
      }
      dp[j][p] = best
      choice[j][p] = bestA
    }
  }

  const clearance = dp[0][K]
  if (clearance === Infinity) return { feasible: false, clearance: Infinity, allocation: [], stats, reason: 'exits cannot absorb everyone' }

  // ---- Recover the allocation by replaying the stored choices forwards ----
  const allocation = []
  let left = K
  let assignedPeople = 0
  for (let j = 0; j < m; j++) {
    const blocks = choice[j][left]
    left -= blocks
    // Shares are fractional, so they are rounded to whole people here; the last exit to receive
    // anyone absorbs the rounding, which keeps the per-exit numbers adding up to `total`.
    const headcount = left === 0 ? total - assignedPeople : Math.min(Math.round(blocks * share), total - assignedPeople)
    assignedPeople += headcount
    allocation.push({
      id: list[j].id,
      name: list[j].name,
      capacity: list[j].capacity,
      delay: list[j].delay ?? 0,
      blocks,
      people: headcount,
      minutes: headcount ? (list[j].delay ?? 0) + headcount / list[j].capacity : 0,
    })
  }

  // The table optimises over whole blocks, so it plans for K*blockSize people, which can be a
  // little more than `total`. Reporting that figure would charge the DP for rounding it did not
  // actually incur, and can make it look worse than the proportional split it beats. The reported
  // clearance is therefore the makespan of the allocation that is actually handed out, computed
  // the same way the proportional comparison computes its own. `tableClearance` keeps the raw
  // value from dp[0][K] for inspection.
  const realised = Math.max(0, ...allocation.map((a) => a.minutes))

  return {
    feasible: true,
    clearance: realised, // minutes until the last person is out
    tableClearance: clearance,
    blockRounding: Math.abs(K * share - total), // zero by construction; kept as a guard
    allocation,
    used: allocation.filter((a) => a.people > 0),
    table: dp,
    stats,
  }
}

/**
 * The naive comparison: split people in proportion to capacity, ignoring delays.
 * O(m). Reported next to the DP answer so the improvement is a measured number.
 */
export function allocateProportional(exits, people) {
  const list = (exits ?? []).filter((e) => e && e.capacity > 0)
  const totalCapacity = list.reduce((a, e) => a + e.capacity, 0)
  if (!totalCapacity) return { clearance: Infinity, allocation: [] }
  let assigned = 0
  const allocation = list.map((e, i) => {
    const headcount = i === list.length - 1 ? Math.max(0, people - assigned) : Math.round((people * e.capacity) / totalCapacity)
    assigned += headcount
    return { id: e.id, name: e.name, capacity: e.capacity, delay: e.delay ?? 0, people: headcount, minutes: headcount ? (e.delay ?? 0) + headcount / e.capacity : 0 }
  })
  return { clearance: Math.max(0, ...allocation.map((a) => a.minutes)), allocation }
}

export default allocateExitsDP
