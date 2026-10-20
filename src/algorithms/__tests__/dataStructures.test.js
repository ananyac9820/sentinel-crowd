import { describe, expect, it } from 'vitest'
import Queue from '../dataStructures/Queue.js'
import Stack from '../dataStructures/Stack.js'
import MinHeap from '../dataStructures/MinHeap.js'

describe('Queue', () => {
  it('returns items in arrival order', () => {
    const q = new Queue()
    q.enqueue('a').enqueue('b').enqueue('c')
    expect([q.dequeue(), q.dequeue(), q.dequeue()]).toEqual(['a', 'b', 'c'])
  })

  it('reports empty correctly and tolerates dequeue on empty', () => {
    const q = new Queue()
    expect(q.isEmpty()).toBe(true)
    expect(q.dequeue()).toBeUndefined()
    expect(q.peek()).toBeUndefined()
  })

  it('stays correct across the internal compaction', () => {
    const q = new Queue()
    const n = 500
    for (let i = 0; i < n; i++) q.enqueue(i)
    const out = []
    for (let i = 0; i < n; i++) out.push(q.dequeue())
    expect(out).toEqual([...Array(n).keys()])
    expect(q.size).toBe(0)
  })

  it('interleaves enqueue and dequeue without losing order', () => {
    const q = new Queue([1, 2])
    expect(q.dequeue()).toBe(1)
    q.enqueue(3)
    expect([q.dequeue(), q.dequeue()]).toEqual([2, 3])
  })
})

describe('Stack', () => {
  it('returns items in reverse order', () => {
    const s = new Stack()
    s.push(1).push(2).push(3)
    expect([s.pop(), s.pop(), s.pop()]).toEqual([3, 2, 1])
  })

  it('handles empty', () => {
    const s = new Stack()
    expect(s.isEmpty()).toBe(true)
    expect(s.pop()).toBeUndefined()
  })
})

describe('MinHeap', () => {
  it('always pops the smallest priority', () => {
    const h = new MinHeap()
    const priorities = [5, 3, 9, 1, 7, 1, 8, 0, 42, -3]
    priorities.forEach((p, i) => h.push(`n${i}`, p))
    const popped = []
    while (!h.isEmpty()) popped.push(h.pop().priority)
    expect(popped).toEqual([...priorities].sort((a, b) => a - b))
  })

  it('maintains the heap property on a large random input', () => {
    const h = new MinHeap()
    for (let i = 0; i < 2000; i++) h.push(i, Math.sin(i) * 1000)
    let last = -Infinity
    while (!h.isEmpty()) {
      const { priority } = h.pop()
      expect(priority).toBeGreaterThanOrEqual(last)
      last = priority
    }
  })

  it('is empty-safe and counts its own operations', () => {
    const h = new MinHeap()
    expect(h.pop()).toBeUndefined()
    expect(h.peek()).toBeUndefined()
    h.push('a', 1)
    h.push('b', 0)
    expect(h.stats.pushes).toBe(2)
    expect(h.stats.comparisons).toBeGreaterThan(0)
    expect(h.pop().key).toBe('b')
  })
})
