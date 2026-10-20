// Merge sort: the divide-and-conquer sort used to rank zones by danger.
//
// DIVIDE  : split the array in half (no work beyond computing the midpoint).
// CONQUER : sort each half by recursing; a run of length 0 or 1 is already sorted.
// COMBINE : merge the two sorted halves in one linear pass.
//
// Recurrence: T(n) = 2T(n/2) + O(n).  By the Master Theorem (a = 2, b = 2, f(n) = n,
// so n^log_b(a) = n^1 = f(n), case 2) this gives T(n) = O(n log n).
//
// Time : O(n log n) in the best, average AND worst case -- the split is always even, so
//        the input order cannot degrade it. This is why it is the safe default for the
//        live zone ranking, which must stay predictable while a crowd is building.
// Space: O(n) for the merge buffers plus O(log n) recursion depth.
// Stable: equal elements keep their original order, because the merge prefers the left run
//        on a tie. That matters here -- zones with equal risk stay in zone-name order
//        instead of jumping around the table on every frame.

/**
 * @param {Array} input      items to sort (not modified)
 * @param {Function} compare (a, b) => negative if a comes first
 * @returns {{ sorted: Array, stats: { comparisons: number, merges: number, writes: number, depth: number } }}
 */
export function mergeSort(input, compare = (a, b) => a - b) {
  const stats = { comparisons: 0, merges: 0, writes: 0, depth: 0 }
  if (!Array.isArray(input)) return { sorted: [], stats }
  const sorted = sort([...input], 0, stats, compare)
  return { sorted, stats }
}

function sort(arr, depth, stats, compare) {
  stats.depth = Math.max(stats.depth, depth)
  if (arr.length <= 1) return arr // base case: nothing to divide

  const mid = Math.floor(arr.length / 2) // DIVIDE
  const left = sort(arr.slice(0, mid), depth + 1, stats, compare) // CONQUER
  const right = sort(arr.slice(mid), depth + 1, stats, compare)
  return merge(left, right, stats, compare) // COMBINE
}

// One linear pass over both runs. Each comparison moves exactly one element across,
// so merging two runs of total length n costs n writes and at most n - 1 comparisons.
function merge(left, right, stats, compare) {
  stats.merges++
  const out = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    stats.comparisons++
    // "<= 0" keeps the sort stable: on a tie the left run wins.
    if (compare(left[i], right[j]) <= 0) out.push(left[i++])
    else out.push(right[j++])
    stats.writes++
  }
  while (i < left.length) {
    out.push(left[i++])
    stats.writes++
  }
  while (j < right.length) {
    out.push(right[j++])
    stats.writes++
  }
  return out
}

export default mergeSort
