// Binary min-heap used as the priority queue in Dijkstra's algorithm.
//
// The heap is stored in one array; for the node at index i:
//   parent(i)      = (i - 1) >> 1
//   leftChild(i)   = 2i + 1
//   rightChild(i)  = 2i + 2
// The heap property is "every parent's priority <= both children's priorities", so the
// smallest priority is always at index 0.
//
// Costs: push O(log n), pop O(log n), peek O(1), space O(n).
//
// Why this matters for Dijkstra: scanning an array for the cheapest unvisited node costs
// O(V) per step, giving O(V^2) overall. With a heap each extraction is O(log V) and each
// relaxation is one O(log V) push, giving O((V + E) log V) -- much better on the sparse
// graphs a station layout produces (every zone touches only a handful of neighbours).

export default class MinHeap {
  constructor() {
    this.heap = [] // entries: { key, priority }
    this.stats = { pushes: 0, pops: 0, comparisons: 0, swaps: 0 }
  }

  get size() {
    return this.heap.length
  }

  isEmpty() {
    return this.heap.length === 0
  }

  peek() {
    return this.heap[0]
  }

  push(key, priority) {
    this.stats.pushes++
    this.heap.push({ key, priority })
    this.siftUp(this.heap.length - 1)
    return this
  }

  pop() {
    if (!this.heap.length) return undefined
    this.stats.pops++
    const top = this.heap[0]
    const last = this.heap.pop()
    if (this.heap.length) {
      this.heap[0] = last
      this.siftDown(0)
    }
    return top
  }

  // Move a too-small entry up until its parent is no larger than it.
  siftUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1
      this.stats.comparisons++
      if (this.heap[parent].priority <= this.heap[i].priority) break
      this.swap(i, parent)
      i = parent
    }
  }

  // Move a too-large entry down, always following the smaller child.
  siftDown(i) {
    const n = this.heap.length
    for (;;) {
      const left = 2 * i + 1
      const right = left + 1
      let smallest = i
      if (left < n) {
        this.stats.comparisons++
        if (this.heap[left].priority < this.heap[smallest].priority) smallest = left
      }
      if (right < n) {
        this.stats.comparisons++
        if (this.heap[right].priority < this.heap[smallest].priority) smallest = right
      }
      if (smallest === i) break
      this.swap(i, smallest)
      i = smallest
    }
  }

  swap(a, b) {
    this.stats.swaps++
    const tmp = this.heap[a]
    this.heap[a] = this.heap[b]
    this.heap[b] = tmp
  }
}
