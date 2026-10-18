// LIFO stack used by the iterative DFS. push and pop are O(1).
export class Stack {
  constructor() {
    this.items = []
  }

  push(item) {
    this.items.push(item)
  }

  pop() {
    return this.items.pop()
  }

  peek() {
    return this.items[this.items.length - 1]
  }

  isEmpty() {
    return this.items.length === 0
  }

  get size() {
    return this.items.length
  }

  toArray() {
    return [...this.items]
  }
}
