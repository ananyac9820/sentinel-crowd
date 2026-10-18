// FIFO queue used by BFS and by Edmonds-Karp's BFS.
// Array.shift() is O(n), so we keep a head index instead: enqueue and dequeue are both O(1).
export class Queue {
  constructor() {
    this.items = []
    this.head = 0
  }

  enqueue(item) {
    this.items.push(item)
  }

  dequeue() {
    if (this.isEmpty()) return undefined
    const item = this.items[this.head]
    this.head++
    // Occasionally drop the consumed prefix so memory does not grow forever.
    if (this.head > 64 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head)
      this.head = 0
    }
    return item
  }

  peek() {
    return this.items[this.head]
  }

  isEmpty() {
    return this.head >= this.items.length
  }

  get size() {
    return this.items.length - this.head
  }
}
