// Residual flow network, stored as the classic "edge + paired reverse edge" adjacency list.
//
// Every edge u->v with capacity c gets a partner edge v->u with capacity 0. Pushing f units
// along u->v subtracts f from its residual capacity and ADDS f to the partner's. The partner
// therefore represents "undo up to f units of flow", which is what lets an augmenting path
// cancel an earlier bad routing decision. Without those reverse edges a greedy path-filling
// loop can get stuck below the true maximum.
//
// Modelling choice for Sentinel (people per minute, not people):
//   super source S -> each zone holding people   capacity: effectively unbounded
//   zone -> zone / corridor                      capacity: how many people/min the link passes
//   exit -> super sink T                         capacity: the gate's own throughput
// The maximum S->T flow is then the station's evacuation THROUGHPUT in people per minute, and
// it depends on the current crowd because link capacities shrink as congestion rises.
// Clearance time follows as peopleWaiting / maxFlow.
//
// The S edges are left unbounded on purpose: if they were capped by zone occupancy, the
// min cut would often be "the zones themselves", which is not an actionable bottleneck.
// Leaving them unbounded forces the cut onto real corridors and gates, which is what staff
// can actually open or widen.

const BIG = 1e9 // stands in for an unbounded capacity; larger than any realistic people/min

export default class FlowNetwork {
  constructor() {
    this.index = new Map() // node id -> integer index (array indices keep the inner loop fast)
    this.names = [] // integer index -> node id
    this.graph = [] // index -> array of edge records
    this.edgeList = [] // every forward edge, in insertion order
  }

  get size() {
    return this.names.length
  }

  node(id) {
    if (this.index.has(id)) return this.index.get(id)
    const i = this.names.length
    this.index.set(id, i)
    this.names.push(id)
    this.graph.push([])
    return i
  }

  /**
   * Adds a forward edge and its zero-capacity partner.
   * @param label  what this edge is in the real station, used in the bottleneck report
   */
  addEdge(fromId, toId, capacity, label = {}) {
    const u = this.node(fromId)
    const v = this.node(toId)
    const forward = { to: v, from: u, capacity: Math.max(0, capacity), flow: 0, isReverse: false, label }
    const backward = { to: u, from: v, capacity: 0, flow: 0, isReverse: true, label }
    forward.partner = backward
    backward.partner = forward
    this.graph[u].push(forward)
    this.graph[v].push(backward)
    this.edgeList.push(forward)
    return forward
  }

  addUnbounded(fromId, toId, label = {}) {
    return this.addEdge(fromId, toId, BIG, { ...label, unbounded: true })
  }

  residual(edge) {
    return edge.capacity - edge.flow
  }

  /** Pushes f units along an edge and gives its partner the matching undo capacity. */
  push(edge, f) {
    edge.flow += f
    edge.partner.flow -= f
  }

  reset() {
    for (const list of this.graph) for (const e of list) e.flow = 0
  }

  /** Forward edges carrying flow, biggest first: "where the crowd is actually going". */
  usedEdges() {
    return this.edgeList.filter((e) => e.flow > 0).sort((a, b) => b.flow - a.flow)
  }

  static get UNBOUNDED() {
    return BIG
  }
}
