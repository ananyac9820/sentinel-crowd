import { describe, expect, it } from 'vitest'
import { mergeSort } from '../sorting/mergeSort.js'
import { quickSort } from '../sorting/quickSort.js'
import { makeRandom } from '../analysis/benchmark.js'

const byScoreDesc = (a, b) => b.score - a.score
const zones = (scores) => scores.map((score, i) => ({ id: `Z${i}`, score }))

describe.each([
  ['mergeSort', mergeSort],
  ['quickSort', quickSort],
])('%s', (name, sort) => {
  it('sorts numbers ascending', () => {
    expect(sort([5, 2, 9, 1, 5, 6]).sorted).toEqual([1, 2, 5, 5, 6, 9])
  })

  it('ranks zones by descending risk', () => {
    const input = zones([82, 41, 95, 63])
    const { sorted } = sort(input, byScoreDesc)
    expect(sorted.map((z) => z.score)).toEqual([95, 82, 63, 41])
  })

  it('handles empty input', () => {
    expect(sort([]).sorted).toEqual([])
  })

  it('handles a single element', () => {
    expect(sort([7]).sorted).toEqual([7])
  })

  it('handles all-equal input', () => {
    expect(sort([3, 3, 3, 3]).sorted).toEqual([3, 3, 3, 3])
  })

  it('handles already-sorted and reverse-sorted input', () => {
    const asc = [...Array(200).keys()]
    expect(sort(asc).sorted).toEqual(asc)
    expect(sort([...asc].reverse()).sorted).toEqual(asc)
  })

  it('handles negative values and duplicates', () => {
    expect(sort([0, -5, 3, -5, 3, 1]).sorted).toEqual([-5, -5, 0, 1, 3, 3])
  })

  it('rejects non-array input instead of throwing', () => {
    expect(sort(null).sorted).toEqual([])
    expect(sort(undefined).sorted).toEqual([])
  })

  it('does not modify the caller input', () => {
    const input = [3, 1, 2]
    sort(input)
    expect(input).toEqual([3, 1, 2])
  })

  it('agrees with the built-in sort on 1000 random values', () => {
    const rand = makeRandom(99)
    const input = Array.from({ length: 1000 }, () => Math.round(rand() * 10000))
    expect(sort(input).sorted).toEqual([...input].sort((a, b) => a - b))
  })

  it('reports operation counts', () => {
    const { stats } = sort([5, 1, 4, 2, 8])
    expect(stats.comparisons).toBeGreaterThan(0)
  })
})

describe('merge sort specifics', () => {
  it('is stable: equal keys keep their input order', () => {
    const input = [
      { name: 'A1', score: 50 },
      { name: 'B2', score: 50 },
      { name: 'C3', score: 90 },
      { name: 'D4', score: 50 },
    ]
    const { sorted } = mergeSort(input, byScoreDesc)
    expect(sorted.map((z) => z.name)).toEqual(['C3', 'A1', 'B2', 'D4'])
  })

  it('recursion depth is about log2(n)', () => {
    const { stats } = mergeSort([...Array(1024).keys()].reverse())
    // ceil(log2(1024)) = 10 divisions, so the deepest frame is at depth 10.
    expect(stats.depth).toBe(10)
  })

  it('uses at most n*log2(n) comparisons', () => {
    const n = 512
    const { stats } = mergeSort([...Array(n).keys()].reverse())
    expect(stats.comparisons).toBeLessThanOrEqual(n * Math.log2(n))
  })
})

describe('quick sort specifics', () => {
  it('median-of-three avoids the quadratic depth that last-element pivoting hits', () => {
    const sortedInput = [...Array(600).keys()]
    const median = quickSort(sortedInput, (a, b) => a - b, { pivot: 'median-of-three' })
    const last = quickSort(sortedInput, (a, b) => a - b, { pivot: 'last' })
    expect(median.sorted).toEqual(sortedInput)
    expect(last.sorted).toEqual(sortedInput)
    // Already-sorted input is the documented worst case for last-element pivoting: every
    // partition peels off one element, so the depth grows with n rather than with log n.
    expect(last.stats.depth).toBeGreaterThan(median.stats.depth * 10)
    expect(median.stats.depth).toBeLessThan(4 * Math.log2(sortedInput.length))
  })

  it('both sorts produce the same order on the same zone data', () => {
    const rand = makeRandom(5)
    const input = Array.from({ length: 300 }, (_, i) => ({ id: `Z${i}`, score: Math.round(rand() * 100) }))
    // Total order via a tie-break, so the unstable sort has no freedom to differ.
    const cmp = (a, b) => b.score - a.score || a.id.localeCompare(b.id)
    expect(quickSort(input, cmp).sorted.map((z) => z.id)).toEqual(mergeSort(input, cmp).sorted.map((z) => z.id))
  })
})
