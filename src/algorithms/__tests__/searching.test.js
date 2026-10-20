import { describe, expect, it } from 'vitest'
import { binarySearch, lowerBound, bandOf, binarySearchPredicate } from '../searching/binarySearch.js'

describe('binarySearch', () => {
  it('finds an element that is present', () => {
    const arr = [1, 3, 5, 7, 9, 11]
    expect(binarySearch(arr, 7).index).toBe(3)
    expect(binarySearch(arr, 1).index).toBe(0)
    expect(binarySearch(arr, 11).index).toBe(5)
  })

  it('returns -1 for an absent element', () => {
    expect(binarySearch([1, 3, 5], 4).index).toBe(-1)
    expect(binarySearch([1, 3, 5], 0).index).toBe(-1)
    expect(binarySearch([1, 3, 5], 99).index).toBe(-1)
  })

  it('handles empty and single-element arrays', () => {
    expect(binarySearch([], 1).index).toBe(-1)
    expect(binarySearch([5], 5).index).toBe(0)
    expect(binarySearch([5], 4).index).toBe(-1)
  })

  it('takes at most ceil(log2(n)) + 1 steps', () => {
    const n = 100000
    const arr = Array.from({ length: n }, (_, i) => i * 2)
    const { stats } = binarySearch(arr, 199998)
    expect(stats.steps).toBeLessThanOrEqual(Math.ceil(Math.log2(n)) + 1)
  })

  it('rejects non-array input', () => {
    expect(binarySearch(null, 1).index).toBe(-1)
  })
})

describe('lowerBound', () => {
  it('returns the insertion point for an absent value', () => {
    expect(lowerBound([1, 3, 5, 7], 4).index).toBe(2)
    expect(lowerBound([1, 3, 5, 7], 0).index).toBe(0)
    expect(lowerBound([1, 3, 5, 7], 99).index).toBe(4)
  })

  it('returns the first matching index when duplicates exist', () => {
    expect(lowerBound([1, 2, 2, 2, 5], 2).index).toBe(1)
  })
})

describe('bandOf: risk band from sorted thresholds', () => {
  const thresholds = [8, 13, 18] // watch, warning, critical

  it('assigns the right band on each side of every threshold', () => {
    expect(bandOf(thresholds, 0).band).toBe(0)
    expect(bandOf(thresholds, 7).band).toBe(0)
    expect(bandOf(thresholds, 8).band).toBe(1) // at the threshold counts as reaching it
    expect(bandOf(thresholds, 12).band).toBe(1)
    expect(bandOf(thresholds, 13).band).toBe(2)
    expect(bandOf(thresholds, 17).band).toBe(2)
    expect(bandOf(thresholds, 18).band).toBe(3)
    expect(bandOf(thresholds, 500).band).toBe(3)
  })

  it('matches a plain linear scan for every value in range', () => {
    const linear = (v) => (v >= 18 ? 3 : v >= 13 ? 2 : v >= 8 ? 1 : 0)
    for (let v = 0; v <= 30; v += 0.5) expect(bandOf(thresholds, v).band).toBe(linear(v))
  })

  it('handles an empty threshold list', () => {
    expect(bandOf([], 42).band).toBe(0)
  })
})

describe('binarySearchPredicate: search over the answer space', () => {
  it('finds the smallest value satisfying a monotone predicate', () => {
    const { value } = binarySearchPredicate(0, 1000, (x) => x >= 137)
    expect(value).toBe(137)
  })

  it('returns 0 when the predicate already holds at the bottom', () => {
    expect(binarySearchPredicate(0, 100, () => true).value).toBe(0)
  })

  it('returns null when the predicate never holds', () => {
    expect(binarySearchPredicate(0, 100, () => false).value).toBeNull()
  })

  it('uses about log2(range) evaluations, not range of them', () => {
    const { stats } = binarySearchPredicate(0, 2000, (x) => x >= 1337)
    expect(stats.evaluations).toBeLessThan(2 + Math.ceil(Math.log2(2001)) + 1)
  })

  it('handles an inverted range', () => {
    expect(binarySearchPredicate(10, 5, () => true).value).toBeNull()
  })
})
