// Binary min-heap (priority queue) used by Dijkstra.
// The smallest priority is always at index 0.
// push and pop are O(log n) because each only walks one root-to-leaf path.
export class MinHeap {
  constructor() {
    this.heap = [] // entries: { priority, value }
  }

  push(value, priority) {
    this.heap.push({ priority, value })
    this.siftUp(this.heap.length - 1)
  }

  pop() {
    if (this.heap.length === 0) return undefined
    const top = this.heap[0]
    const last = this.heap.pop()
    if (this.heap.length > 0) {
      this.heap[0] = last
      this.siftDown(0)
    }
    return top
  }

  peek() {
    return this.heap[0]
  }

  isEmpty() {
    return this.heap.length === 0
  }

  get size() {
    return this.heap.length
  }

  siftUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.heap[parent].priority <= this.heap[i].priority) break
      ;[this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]]
      i = parent
    }
  }

  siftDown(i) {
    const n = this.heap.length
    while (true) {
      const left = 2 * i + 1
      const right = left + 1
      let smallest = i
      if (left < n && this.heap[left].priority < this.heap[smallest].priority) smallest = left
      if (right < n && this.heap[right].priority < this.heap[smallest].priority) smallest = right
      if (smallest === i) break
      ;[this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]]
      i = smallest
    }
  }
}
