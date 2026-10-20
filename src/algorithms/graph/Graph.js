// Weighted directed graph stored as an adjacency list.
//
// Why an adjacency list and not a matrix? A station layout is sparse: a zone touches three
// to eight neighbours no matter how many zones exist, so E is O(V) in practice. An adjacency
// matrix would cost O(V^2) memory and force every traversal to scan V entries per node even
// though almost all of them are empty. With a list, BFS and DFS visit each edge once and run
// in O(V + E), and Dijkstra's relaxation loop touches exactly the real edges.
//
// Directed, because crowd movement is not symmetric: a one-way staircase, a gate that only
// lets people out, or a corridor made one-way by an intervention all need an edge in one
// direction only. Two-way corridors are stored as two opposite edges.
//
// Each edge carries the physical quantities Sentinel measures or configures:
//   distance  metres between the two node centres
//   walkTime  seconds to cross at the current crowd speed
//   capacity  people per minute the link can pass (used by the flow network)
//   congestion 0..1 how full the destination already is
//   risk      0..1 how dangerous the destination is (level, turbulence, counter-flow)
//   flow      people per minute currently moving along it (filled in by max flow)
// `cost` is derived from those by the weight function in crowdGraphBuilder.js.
//
// Costs: addNode O(1), addEdge O(1), neighbours O(1) lookup + O(deg) iteration,
//        memory O(V + E).

export default class Graph {
  constructor({ directed = true } = {}) {
    this.directed = directed
    this.nodes = new Map() // id -> node object
    this.adjacency = new Map() // id -> array of edges leaving that node
    this.edges = [] // flat list, handy for drawing and for the flow network
  }

  get nodeCount() {
    return this.nodes.size
  }

  get edgeCount() {
    return this.edges.length
  }

  /** @param {object} node must have an `id`; anything else (kind, x, y, people...) is kept. */
  addNode(node) {
    if (!node || node.id == null) throw new Error('Graph.addNode: node needs an id')
    if (!this.nodes.has(node.id)) this.adjacency.set(node.id, [])
    this.nodes.set(node.id, { ...this.nodes.get(node.id), ...node })
    return this
  }

  getNode(id) {
    return this.nodes.get(id)
  }

  hasNode(id) {
    return this.nodes.has(id)
  }

  nodeIds() {
    return [...this.nodes.keys()]
  }

  nodeList() {
    return [...this.nodes.values()]
  }

  /**
   * Adds a directed edge from -> to. When the graph was built with directed: false the
   * reverse edge is added too (it gets its own attribute object, so congestion and risk can
   * legitimately differ by direction).
   */
  addEdge(from, to, attrs = {}) {
    if (!this.nodes.has(from) || !this.nodes.has(to)) throw new Error(`Graph.addEdge: unknown node ${this.nodes.has(from) ? to : from}`)
    const edge = this.link(from, to, attrs)
    // An undirected graph stores the mirror explicitly, with its own attribute object so that
    // congestion and risk can differ by direction. `link` is used rather than a recursive
    // addEdge call, which would mirror the mirror forever.
    if (!this.directed) this.link(to, from, attrs)
    return edge
  }

  link(from, to, attrs) {
    const edge = { id: `${from}->${to}`, from, to, cost: 0, distance: 0, walkTime: 0, capacity: 0, congestion: 0, risk: 0, flow: 0, ...attrs }
    this.adjacency.get(from).push(edge)
    this.edges.push(edge)
    return edge
  }

  /** Edges leaving `id`. Returns the live array, so traversals must not mutate it. */
  neighbours(id) {
    return this.adjacency.get(id) ?? []
  }

  getEdge(from, to) {
    return this.neighbours(from).find((e) => e.to === to)
  }

  /** Degree sum / node count: reported in the UI as evidence the graph really is sparse. */
  averageDegree() {
    return this.nodes.size ? this.edges.length / this.nodes.size : 0
  }

  /** Every node whose `kind` matches, e.g. nodesOfKind('exit'). */
  nodesOfKind(kind) {
    return this.nodeList().filter((n) => n.kind === kind)
  }

  /**
   * A copy with some edges removed, used to answer "what if we close this corridor?"
   * without disturbing the live graph. O(V + E).
   */
  withoutEdges(predicate) {
    const copy = new Graph({ directed: true }) // already-expanded edges, so never re-mirror
    for (const n of this.nodeList()) copy.addNode({ ...n })
    for (const e of this.edges) if (!predicate(e)) copy.addEdge(e.from, e.to, { ...e })
    return copy
  }

  /** A copy with every edge's attributes passed through `update`. O(V + E). */
  mapEdges(update) {
    const copy = new Graph({ directed: true })
    for (const n of this.nodeList()) copy.addNode({ ...n })
    for (const e of this.edges) copy.addEdge(e.from, e.to, { ...e, ...(update(e) ?? {}) })
    return copy
  }
}
