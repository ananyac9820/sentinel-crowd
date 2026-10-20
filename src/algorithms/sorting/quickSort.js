// Quick sort: the in-place divide-and-conquer alternative for ranking zones by danger.
//
// DIVIDE  : partition the range around a pivot so that everything left of the pivot is
//           <= it and everything right of it is >= it. The pivot is now in its final place,
//           so unlike merge sort the real work happens BEFORE the recursion.
// CONQUER : sort the two sides by recursing.
// COMBINE : nothing to do -- the array is already in order once both sides are sorted.
//
// Time : O(n log n) average, O(n^2) worst case. The worst case happens when every pivot is
//        the smallest or largest remaining element, so one side is empty and the recursion
//        depth becomes n. An already-sorted array does exactly that if you always pick the
//        last element, which is a realistic input here: zone risks are often already nearly
//        sorted from the previous frame. Median-of-three pivot selection avoids that trap.
// Space: O(log n) average for the recursion stack (O(n) worst case). No merge buffers, so it
//        allocates far less than merge sort -- the trade-off for losing the worst-case bound.
// Not stable: partitioning swaps distant elements, so equal risks can change relative order.
//
// Sentinel uses merge sort for the live zone ranking (predictable and stable) and offers
// quick sort in the Algorithm Lab so the two can be compared on the same real zone data.

const SORT_LAST = 'last'
const SORT_MEDIAN = 'median-of-three'

/**
 * @param {Array} input      items to sort (not modified)
 * @param {Function} compare (a, b) => negative if a comes first
 * @param {object} options   { pivot: 'median-of-three' | 'last' }
 */
export function quickSort(input, compare = (a, b) => a - b, { pivot = SORT_MEDIAN } = {}) {
  const stats = { comparisons: 0, swaps: 0, partitions: 0, depth: 0 }
  if (!Array.isArray(input)) return { sorted: [], stats }
  const arr = [...input]
  sort(arr, 0, arr.length - 1, 0, stats, compare, pivot)
  return { sorted: arr, stats }
}

function sort(arr, lo, hi, depth, stats, compare, pivot) {
  if (lo >= hi) return // base case: 0 or 1 element
  stats.depth = Math.max(stats.depth, depth)
  const p = partition(arr, lo, hi, stats, compare, pivot)
  sort(arr, lo, p - 1, depth + 1, stats, compare, pivot)
  sort(arr, p + 1, hi, depth + 1, stats, compare, pivot)
}

// Lomuto partition. `i` marks the end of the "<= pivot" prefix.
function partition(arr, lo, hi, stats, compare, pivotRule) {
  stats.partitions++
  if (pivotRule === SORT_MEDIAN) choosePivot(arr, lo, hi, stats, compare)
  const pivot = arr[hi]
  let i = lo
  for (let j = lo; j < hi; j++) {
    stats.comparisons++
    if (compare(arr[j], pivot) < 0) {
      swap(arr, i, j, stats)
      i++
    }
  }
  swap(arr, i, hi, stats) // put the pivot in its final position
  return i
}

// Median of first, middle and last, moved to the end so the partition above can use it.
// Costs three comparisons but makes the O(n^2) worst case very unlikely on real data.
function choosePivot(arr, lo, hi, stats, compare) {
  const mid = lo + Math.floor((hi - lo) / 2)
  stats.comparisons += 3
  if (compare(arr[mid], arr[lo]) < 0) swap(arr, lo, mid, stats)
  if (compare(arr[hi], arr[lo]) < 0) swap(arr, lo, hi, stats)
  // arr[lo] now holds the smallest of the three, so the median is the smaller of mid and hi.
  if (compare(arr[mid], arr[hi]) < 0) swap(arr, mid, hi, stats) // median ends up at hi
}

function swap(arr, a, b, stats) {
  if (a === b) return
  stats.swaps++
  const tmp = arr[a]
  arr[a] = arr[b]
  arr[b] = tmp
}

export default quickSort
