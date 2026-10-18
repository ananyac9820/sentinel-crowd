// Binary search on a sorted array: halve the search range each step. O(log n) time, O(1) space.

// Classic exact-match search. Returns the index of target, or -1.
export function binarySearch(sorted, target, key = (x) => x) {
  let lo = 0
  let hi = sorted.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const v = key(sorted[mid])
    if (v === target) return mid
    if (v < target) lo = mid + 1
    else hi = mid - 1
  }
  return -1
}

// Sentinel use: find which risk band a density falls into.
// `thresholds` are sorted by `min` ascending; returns the LAST band whose min <= value,
// plus the probes made, so the UI can show the search.
export function findBand(thresholds, value) {
  let lo = 0
  let hi = thresholds.length - 1
  let found = -1
  const probes = []
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const ok = thresholds[mid].min <= value
    probes.push({ index: mid, min: thresholds[mid].min, ok })
    if (ok) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return { index: found, band: found >= 0 ? thresholds[found] : null, probes }
}
