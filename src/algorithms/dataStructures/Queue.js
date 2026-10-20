// FIFO queue with O(1) enqueue and dequeue.
//
// Why not a plain array with shift()? Array.shift() has to move every remaining element
// down one slot, so it costs O(n). A BFS over V nodes would then cost O(V^2) just in
// queue work, which would hide the O(V + E) behaviour the algorithm is supposed to have.
// Keeping a read index instead makes every operation O(1) amortised.

export default class Queue {
  constructor(items = []) {
    this.items = [...items]
    this.head = 0
  }

  enqueue(x) {
    this.items.push(x)
    return this
  }

  dequeue() {
    if (this.isEmpty()) return undefined
    const x = this.items[this.head]
    this.items[this.head] = undefined // let the value be garbage collected
    this.head++
    // Compact once more than half the buffer is dead space, so memory stays O(size).
    if (this.head > 32 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head)
      this.head = 0
    }
    return x
  }

  peek() {
    return this.isEmpty() ? undefined : this.items[this.head]
  }

  get size() {
    return this.items.length - this.head
  }

  isEmpty() {
    return this.size === 0
  }
}
