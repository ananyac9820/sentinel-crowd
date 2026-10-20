import { describe, expect, it } from 'vitest'
import Graph from '../graph/Graph.js'
import { bfs, bfsPath, reachableExits } from '../graph/bfs.js'
import { dfs, dangerRegions, disconnectsExits } from '../graph/dfs.js'
import { dijkstra, shortestPath, safestRoute } from '../graph/dijkstra.js'

// A small station used by most tests:
//
//   Z1 --- Z2 --- Z3 --- X1 (exit)
//    |             |
//   Z4 ----------- +
//    |
//   X2 (exit)
//
// Z1->Z2->Z3->X1 is three hops; Z1->Z4->X2 is two.
function station({ costs = {} } = {}) {
  const g = new Graph({ directed: true })
  g.addNode({ id: 'Z1', kind: 'zone', name: 'Z1', x: 0, y: 0, people: 10, level: 3 })
  g.addNode({ id: 'Z2', kind: 'zone', name: 'Z2', x: 1, y: 0, people: 8, level: 2 })
  g.addNode({ id: 'Z3', kind: 'zone', name: 'Z3', x: 2, y: 0, people: 2, level: 0 })
  g.addNode({ id: 'Z4', kind: 'zone', name: 'Z4', x: 0, y: 1, people: 9, level: 2 })
  g.addNode({ id: 'X1', kind: 'exit', name: 'Gate 1', x: 3, y: 0 })
  g.addNode({ id: 'X2', kind: 'exit', name: 'Gate 2', x: 0, y: 2 })
  const link = (a, b, cost, distance = 10, capacity = 60) => {
    g.addEdge(a, b, { cost, distance, capacity })
    g.addEdge(b, a, { cost, distance, capacity })
  }
  link('Z1', 'Z2', costs.z1z2 ?? 1)
  link('Z2', 'Z3', costs.z2z3 ?? 1)
  link('Z3', 'Z4', costs.z3z4 ?? 1)
  link('Z1', 'Z4', costs.z1z4 ?? 1)
  link('Z3', 'X1', costs.z3x1 ?? 1)
  link('Z4', 'X2', costs.z4x2 ?? 1)
  return g
}

describe('Graph', () => {
  it('counts nodes and edges and exposes an adjacency list', () => {
    const g = station()
    expect(g.nodeCount).toBe(6)
    expect(g.edgeCount).toBe(12) // 6 undirected links stored as 12 directed edges
    expect(g.neighbours('Z1').map((e) => e.to).sort()).toEqual(['Z2', 'Z4'])
  })

  it('mirrors edges only when built undirected', () => {
    const g = new Graph({ directed: false })
    g.addNode({ id: 'a' }).addNode({ id: 'b' })
    g.addEdge('a', 'b', { cost: 1 })
    expect(g.edgeCount).toBe(2)
    expect(g.getEdge('b', 'a')).toBeTruthy()
  })

  it('refuses an edge to an unknown node and a node with no id', () => {
    const g = new Graph()
    g.addNode({ id: 'a' })
    expect(() => g.addEdge('a', 'ghost', {})).toThrow(/unknown node ghost/)
    expect(() => g.addNode({})).toThrow(/needs an id/)
  })

  it('withoutEdges returns a copy and leaves the original intact', () => {
    const g = station()
    const reduced = g.withoutEdges((e) => e.from === 'Z3' && e.to === 'X1')
    expect(reduced.edgeCount).toBe(11)
    expect(g.edgeCount).toBe(12)
  })

  it('is sparse: average degree stays small', () => {
    expect(station().averageDegree()).toBeLessThan(4)
  })
})

describe('BFS', () => {
  it('finds the fewest-hop distance to every node', () => {
    const { hops } = bfs(station(), 'Z1')
    expect(hops.get('Z1')).toBe(0)
    expect(hops.get('Z2')).toBe(1)
    expect(hops.get('Z4')).toBe(1)
    expect(hops.get('Z3')).toBe(2)
    expect(hops.get('X2')).toBe(2)
    expect(hops.get('X1')).toBe(3)
  })

  it('rebuilds a fewest-hop path', () => {
    const { parent } = bfs(station(), 'Z1')
    expect(bfsPath(parent, 'X1')).toEqual(['Z1', 'Z2', 'Z3', 'X1'])
  })

  it('groups nodes into frontier layers', () => {
    const { levels } = bfs(station(), 'Z1')
    expect(levels[0]).toEqual(['Z1'])
    expect(levels[1].sort()).toEqual(['Z2', 'Z4'])
  })

  it('visits every node once and every edge once', () => {
    const g = station()
    const { stats } = bfs(g, 'Z1')
    expect(stats.visited).toBe(g.nodeCount)
    expect(stats.edgesExamined).toBe(g.edgeCount)
  })

  it('handles a single isolated node', () => {
    const g = new Graph()
    g.addNode({ id: 'only', kind: 'zone', name: 'only' })
    const { order, reached } = bfs(g, 'only')
    expect(order).toEqual(['only'])
    expect(reached.size).toBe(1)
  })

  it('handles a disconnected graph: unreachable nodes are absent', () => {
    const g = station()
    g.addNode({ id: 'Island', kind: 'zone', name: 'Island' })
    g.addNode({ id: 'X9', kind: 'exit', name: 'Sealed gate' })
    g.addEdge('Island', 'X9', { cost: 1 })
    const { reached } = bfs(g, 'Z1')
    expect(reached.has('Island')).toBe(false)
    const { exits, unreachable } = reachableExits(g, 'Z1')
    expect(exits.map((e) => e.name)).toEqual(['Gate 2', 'Gate 1']) // 2 hops before 3 hops
    expect(unreachable).toEqual(['Sealed gate'])
  })

  it('returns an empty result for an unknown source', () => {
    const { order, stats } = bfs(station(), 'nope')
    expect(order).toEqual([])
    expect(stats.visited).toBe(0)
  })

  it('respects blocked edges', () => {
    const g = station()
    const { reached } = bfs(g, 'Z1', { blocked: (e) => e.from === 'Z1' })
    expect(reached.size).toBe(1)
  })
})

describe('DFS', () => {
  it('reaches everything a connected graph holds', () => {
    const { reached } = dfs(station(), 'Z1')
    expect(reached.size).toBe(6)
  })

  it('visits each node exactly once', () => {
    const { order } = dfs(station(), 'Z1')
    expect(new Set(order).size).toBe(order.length)
  })

  it('goes deep before wide', () => {
    // From Z1 the first neighbour is Z2, so DFS must reach Z3 before coming back for Z4.
    const { order } = dfs(station(), 'Z1')
    expect(order.indexOf('Z3')).toBeLessThan(order.indexOf('Z4'))
  })

  it('finds connected components of the dangerous subgraph', () => {
    const g = station()
    // Z1 (level 3) and Z2 (level 2) touch, so they are ONE region. Z4 (level 2) also touches Z1.
    const { regions } = dangerRegions(g, (n) => n?.kind === 'zone' && (n.level ?? 0) >= 2)
    expect(regions).toHaveLength(1)
    expect(regions[0].names.sort()).toEqual(['Z1', 'Z2', 'Z4'])
    expect(regions[0].people).toBe(27)
    expect(regions[0].worstLevel).toBe(3)
  })

  it('separates regions that do not touch', () => {
    const g = new Graph()
    g.addNode({ id: 'A', kind: 'zone', name: 'A', level: 3, people: 5 })
    g.addNode({ id: 'B', kind: 'zone', name: 'B', level: 0, people: 1 })
    g.addNode({ id: 'C', kind: 'zone', name: 'C', level: 3, people: 7 })
    g.addEdge('A', 'B', {})
    g.addEdge('B', 'C', {})
    const { regions } = dangerRegions(g, (n) => (n.level ?? 0) >= 2)
    expect(regions).toHaveLength(2)
    expect(regions[0].people).toBe(7) // biggest body of people first
  })

  it('returns no regions when nothing is dangerous', () => {
    expect(dangerRegions(station(), () => false).regions).toEqual([])
  })

  it('detects a closure that strands a zone', () => {
    const g = new Graph()
    g.addNode({ id: 'Z1', kind: 'zone', name: 'Z1' })
    g.addNode({ id: 'Z2', kind: 'zone', name: 'Z2' })
    g.addNode({ id: 'X1', kind: 'exit', name: 'Gate' })
    g.addEdge('Z1', 'Z2', {})
    g.addEdge('Z2', 'Z1', {})
    g.addEdge('Z2', 'X1', {}) // the only way out, for both zones
    expect(disconnectsExits(g, () => false).safe).toBe(true)
    const cut = disconnectsExits(g, (e) => e.from === 'Z2' && e.to === 'X1')
    expect(cut.safe).toBe(false)
    expect(cut.stranded.sort()).toEqual(['Z1', 'Z2'])
  })

  it('allows a closure when a parallel route exists', () => {
    // Z1 can leave via Z2->X1 or via Z4->X2, so closing one does not strand it.
    expect(disconnectsExits(station(), (e) => e.from === 'Z3' && e.to === 'X1').safe).toBe(true)
  })
})

describe('Dijkstra', () => {
  it('computes shortest costs on uniform weights', () => {
    const { dist } = dijkstra(station(), 'Z1')
    expect(dist.get('Z1')).toBe(0)
    expect(dist.get('Z2')).toBe(1)
    expect(dist.get('Z3')).toBe(2)
    expect(dist.get('X1')).toBe(3)
  })

  it('prefers a longer hop count when it is cheaper', () => {
    // Make the direct Z1->Z4 link expensive; going round via Z2 and Z3 must then win.
    const g = station({ costs: { z1z4: 10 } })
    const { dist, parent } = dijkstra(g, 'Z1')
    expect(dist.get('Z4')).toBe(3) // Z1->Z2->Z3->Z4
    expect(shortestPath(parent, 'Z4')).toEqual(['Z1', 'Z2', 'Z3', 'Z4'])
  })

  it('leaves unreachable nodes out of the distance map', () => {
    const g = station()
    g.addNode({ id: 'Island', kind: 'zone', name: 'Island' })
    expect(dijkstra(g, 'Z1').dist.has('Island')).toBe(false)
  })

  it('handles a single node and an unknown source', () => {
    const g = new Graph()
    g.addNode({ id: 'solo', kind: 'zone', name: 'solo' })
    expect(dijkstra(g, 'solo').dist.get('solo')).toBe(0)
    expect(dijkstra(g, 'missing').dist.size).toBe(0)
  })

  it('rejects negative weights rather than returning a wrong answer', () => {
    const g = station()
    g.addEdge('Z1', 'Z3', { cost: -5 })
    expect(() => dijkstra(g, 'Z1')).toThrow(/negative weight/)
  })

  it('settles every node at most once', () => {
    const g = station()
    const { stats, settledOrder } = dijkstra(g, 'Z1')
    expect(new Set(settledOrder).size).toBe(settledOrder.length)
    expect(stats.settled).toBeLessThanOrEqual(g.nodeCount)
  })

  it('stops early once all targets are settled', () => {
    const all = dijkstra(station(), 'Z1')
    const targeted = dijkstra(station(), 'Z1', { targets: ['Z2'] })
    expect(targeted.stats.settled).toBeLessThan(all.stats.settled)
  })

  it('agrees with BFS when every edge costs the same', () => {
    const g = station()
    const d = dijkstra(g, 'Z1')
    const b = bfs(g, 'Z1')
    for (const id of b.hops.keys()) expect(d.dist.get(id)).toBe(b.hops.get(id))
  })

  it('safestRoute picks a longer but safer path over the shortest one', () => {
    // Z1 -> Z4 -> X2 is short in metres but runs through a congested, risky zone.
    const g = new Graph({ directed: true })
    g.addNode({ id: 'Z1', kind: 'zone', name: 'Z1' })
    g.addNode({ id: 'Z4', kind: 'zone', name: 'Z4 (crush)' })
    g.addNode({ id: 'Z2', kind: 'zone', name: 'Z2' })
    g.addNode({ id: 'Z3', kind: 'zone', name: 'Z3' })
    g.addNode({ id: 'X1', kind: 'exit', name: 'Gate 1' })
    // Short and dangerous: 2 edges, 20 m, high cost.
    g.addEdge('Z1', 'Z4', { cost: 6, distance: 10, capacity: 20 })
    g.addEdge('Z4', 'X1', { cost: 6, distance: 10, capacity: 20 })
    // Long and calm: 3 edges, 90 m, low cost.
    g.addEdge('Z1', 'Z2', { cost: 1, distance: 30, capacity: 80 })
    g.addEdge('Z2', 'Z3', { cost: 1, distance: 30, capacity: 80 })
    g.addEdge('Z3', 'X1', { cost: 1, distance: 30, capacity: 80 })

    const route = safestRoute(g, 'Z1')
    expect(route.reachable).toBe(true)
    expect(route.safest.path).toEqual(['Z1', 'Z2', 'Z3', 'X1'])
    expect(route.safest.distance).toBe(90)
    expect(route.shortest.path).toEqual(['Z1', 'Z4', 'X1'])
    expect(route.shortest.distance).toBe(20)
    expect(route.differs).toBe(true)
    // The safe route really is cheaper on the safety cost model.
    expect(route.safest.cost).toBeLessThan(route.shortest.cost)
  })

  it('safestRoute reports unreachable when no exit can be reached', () => {
    const g = new Graph()
    g.addNode({ id: 'Z1', kind: 'zone', name: 'Z1' })
    g.addNode({ id: 'X1', kind: 'exit', name: 'Sealed' })
    expect(safestRoute(g, 'Z1').reachable).toBe(false)
  })

  it('safestRoute returns null when no exit exists at all', () => {
    const g = new Graph()
    g.addNode({ id: 'Z1', kind: 'zone', name: 'Z1' })
    expect(safestRoute(g, 'Z1')).toBeNull()
  })

  it('lists alternative exits in cost order', () => {
    const route = safestRoute(station(), 'Z1')
    const costs = route.alternatives.map((a) => a.cost)
    expect(costs).toEqual([...costs].sort((a, b) => a - b))
  })
})
