// LIFO stack. Used by the iterative DFS so the traversal depth is bounded by heap memory
// instead of the JavaScript call stack (a recursive DFS over a large graph can overflow it).

export default class Stack {
  constructor(items = []) {
    this.items = [...items]
  }

  push(x) {
    this.items.push(x)
    return this
  }

  pop() {
    return this.items.pop()
  }

  peek() {
    return this.items[this.items.length - 1]
  }

  get size() {
    return this.items.length
  }

  isEmpty() {
    return this.items.length === 0
  }
}
