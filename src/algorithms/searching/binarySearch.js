// Binary search on sorted data. Three variants, all iterative.
//
// Time : O(log n) -- each step halves the remaining range, so at most ceil(log2(n)) steps.
//        Best case O(1) when the middle element is the answer.
// Space: O(1) iterative. A recursive version would cost O(log n) stack frames for no gain.
//
// Where Sentinel uses each one:
//   lowerBound()        -> which risk band a zone's density falls into (risk.js / riskEngine.js).
//                          The thresholds are sorted by construction, so a linear if-chain is
//                          doing a sequential search over sorted data -- exactly what binary
//                          search replaces. With 4 bands the saving is tiny; the point is that
//                          the band count is configurable and the search does not care.
//   binarySearchPredicate() -> the smallest extra exit capacity that brings predicted evacuation
//                          time under a target. The predicate "is evacuation fast enough with
//                          +x people/min?" is monotone (more capacity never makes evacuation
//                          slower), and that monotonicity is the only thing binary search needs:
//                          it does not require a sorted array, just a sorted answer space.

/**
 * Classic exact-match search.
 * @returns index of `target`, or -1 if absent.
 */
export function binarySearch(sorted, target, compare = (a, b) => a - b) {
  const stats = { comparisons: 0, steps: 0 }
  if (!Array.isArray(sorted) || !sorted.length) return { index: -1, stats }
  let lo = 0
  let hi = sorted.length - 1
  while (lo <= hi) {
    stats.steps++
    // (lo + hi) can overflow in fixed-width integer languages; the shift form is the habit.
    const mid = lo + ((hi - lo) >> 1)
    stats.comparisons++
    const c = compare(sorted[mid], target)
    if (c === 0) return { index: mid, stats }
    if (c < 0) lo = mid + 1
    else hi = mid - 1
  }
  return { index: -1, stats }
}

/**
 * First index whose value is >= target (the insertion point). Never returns -1, so it is the
 * right variant for bucketing a measurement into bands.
 * @returns {{ index: number, stats: object }} index in [0, sorted.length]
 */
export function lowerBound(sorted, target, compare = (a, b) => a - b) {
  const stats = { comparisons: 0, steps: 0 }
  if (!Array.isArray(sorted)) return { index: 0, stats }
  let lo = 0
  let hi = sorted.length // note: one past the end, because the answer may be "after everything"
  while (lo < hi) {
    stats.steps++
    const mid = lo + ((hi - lo) >> 1)
    stats.comparisons++
    if (compare(sorted[mid], target) < 0) lo = mid + 1
    else hi = mid
  }
  return { index: lo, stats }
}

/**
 * Band lookup: how many of the ascending `thresholds` a value has reached.
 * A value below every threshold gives 0; a value at or above all of them gives thresholds.length.
 * Implemented as an upper bound (first threshold strictly greater than the value).
 */
export function bandOf(thresholds, value) {
  const { index, stats } = lowerBound(thresholds, value, (th, v) => (th <= v ? -1 : 1))
  return { band: index, stats }
}

/**
 * Binary search over an integer answer space for the smallest x in [lo, hi] with ok(x) true.
 * Requires ok() to be monotone: once it is true it stays true for larger x.
 * @returns {{ value: number|null, stats: { steps: number, evaluations: number } }}
 */
export function binarySearchPredicate(lo, hi, ok) {
  const stats = { steps: 0, evaluations: 0 }
  const test = (x) => {
    stats.evaluations++
    return ok(x)
  }
  if (lo > hi) return { value: null, stats }
  if (!test(hi)) return { value: null, stats } // not achievable anywhere in the range
  let best = hi
  while (lo < hi) {
    stats.steps++
    const mid = lo + Math.floor((hi - lo) / 2)
    if (test(mid)) {
      best = mid
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return { value: Math.min(best, lo), stats }
}

export default binarySearch
