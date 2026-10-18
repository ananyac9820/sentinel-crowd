// Merge sort: split the array in half, sort each half recursively, then merge the two sorted halves.
// Sentinel use: rank zones from most to least dangerous.
// Stable (equal items keep their order) and always O(n log n): log n levels of splitting, O(n) merging per level.
// Space O(n) for the merge buffers. Array.prototype.sort is deliberately NOT used.

export function mergeSort(items, compare = (a, b) => a - b, trace = null) {
  return sortRange(items, compare, trace, 0)
}

function sortRange(items, compare, trace, depth) {
  if (items.length <= 1) return items.slice()
  const mid = Math.floor(items.length / 2)
  const leftIn = items.slice(0, mid)
  const rightIn = items.slice(mid)
  trace?.push({ type: 'divide', depth, left: leftIn, right: rightIn })
  const left = sortRange(leftIn, compare, trace, depth + 1)
  const right = sortRange(rightIn, compare, trace, depth + 1)
  const merged = merge(left, right, compare)
  trace?.push({ type: 'merge', depth, left, right, merged })
  return merged
}

export function merge(left, right, compare) {
  const out = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    // `<= 0` takes from the left on ties, which is what makes the sort stable.
    if (compare(left[i], right[j]) <= 0) out.push(left[i++])
    else out.push(right[j++])
  }
  while (i < left.length) out.push(left[i++])
  while (j < right.length) out.push(right[j++])
  return out
}
