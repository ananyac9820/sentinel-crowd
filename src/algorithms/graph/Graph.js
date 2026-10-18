// Weighted directed graph stored as an adjacency list: node id -> array of outgoing edges.
// An adjacency list uses O(V + E) memory and lets BFS, DFS, Dijkstra and max flow visit
// each node's neighbours without scanning all V nodes (which an adjacency matrix would need).
//
// Edge fields used by Sentinel:
//   distance   metres walked along the connection
//   capacity   people per minute that can safely pass (0 = closed, Infinity = unlimited)
//   congestion 0..100+, how full the destination area is (% of crush density)
//   risk       0..100, danger signals at the destination (alert level, turbulence, counter-flow)
//   cost       crowd-aware cost used by Dijkstra (see crowdGraphBuilder.js)

export class Graph {
  constructor() {
    this.nodes = new Map() // id -> node data
    this.adj = new Map() // id -> outgoing edges
    this.edgeCount = 0
  }

  addNode(id, data = {}) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, ...data })
      this.adj.set(id, [])
    }
    return this.nodes.get(id)
  }

  hasNode(id) {
    return this.nodes.has(id)
  }

  getNode(id) {
    return this.nodes.get(id)
  }

  addEdge(from, to, attrs = {}) {
    if (!this.nodes.has(from)) this.addNode(from)
    if (!this.nodes.has(to)) this.addNode(to)
    const edge = { id: `${from}->${to}`, from, to, distance: 0, capacity: Infinity, congestion: 0, risk: 0, cost: 0, ...attrs }
    this.adj.get(from).push(edge)
    this.edgeCount++
    return edge
  }

  // Two directed edges, one each way. People can walk across the platform in either direction.
  addTwoWayEdge(a, b, attrsAB = {}, attrsBA = attrsAB) {
    return [this.addEdge(a, b, attrsAB), this.addEdge(b, a, attrsBA)]
  }

  neighbours(id) {
    return this.adj.get(id) ?? []
  }

  edges() {
    const all = []
    for (const list of this.adj.values()) all.push(...list)
    return all
  }

  nodeIds() {
    return [...this.nodes.keys()]
  }

  get V() {
    return this.nodes.size
  }

  get E() {
    return this.edgeCount
  }
}

// Closed connections (capacity 0, e.g. a locked gate) cannot be walked.
export const isOpenEdge = (edge) => edge.capacity > 0
