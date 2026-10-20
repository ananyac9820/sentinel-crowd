import { describe, expect, it } from 'vitest'
import FlowNetwork from '../flow/FlowNetwork.js'
import { edmondsKarp } from '../flow/edmondsKarp.js'
import { fordFulkerson } from '../flow/fordFulkerson.js'
import { minCut, bottlenecks } from '../flow/minCut.js'

// The textbook CLRS network. Known maximum flow: 23.
function clrs() {
  const n = new FlowNetwork()
  n.addEdge('s', 'v1', 16)
  n.addEdge('s', 'v2', 13)
  n.addEdge('v1', 'v3', 12)
  n.addEdge('v2', 'v1', 4)
  n.addEdge('v2', 'v4', 14)
  n.addEdge('v3', 'v2', 9)
  n.addEdge('v3', 't', 20)
  n.addEdge('v4', 'v3', 7)
  n.addEdge('v4', 't', 4)
  return n
}

describe('FlowNetwork', () => {
  it('creates a zero-capacity partner for every forward edge', () => {
    const n = new FlowNetwork()
    const e = n.addEdge('a', 'b', 10)
    expect(e.partner.capacity).toBe(0)
    expect(e.partner.to).toBe(n.node('a'))
  })

  it('pushing flow gives the partner undo capacity', () => {
    const n = new FlowNetwork()
    const e = n.addEdge('a', 'b', 10)
    n.push(e, 4)
    expect(n.residual(e)).toBe(6)
    expect(n.residual(e.partner)).toBe(4) // 4 units can be taken back
  })
})

describe('Edmonds-Karp', () => {
  it('finds the known maximum flow of the CLRS network', () => {
    expect(edmondsKarp(clrs(), 's', 't').maxFlow).toBe(23)
  })

  it('returns 0 for a disconnected sink', () => {
    const n = new FlowNetwork()
    n.addEdge('s', 'a', 10)
    n.node('t')
    expect(edmondsKarp(n, 's', 't').maxFlow).toBe(0)
  })

  it('returns 0 when a zero-capacity edge is the only route', () => {
    const n = new FlowNetwork()
    n.addEdge('s', 'a', 10)
    n.addEdge('a', 't', 0)
    expect(edmondsKarp(n, 's', 't').maxFlow).toBe(0)
  })

  it('is limited by the tightest link in a chain', () => {
    const n = new FlowNetwork()
    n.addEdge('s', 'a', 100)
    n.addEdge('a', 'b', 20) // the bottleneck
    n.addEdge('b', 't', 100)
    expect(edmondsKarp(n, 's', 't').maxFlow).toBe(20)
  })

  it('adds parallel routes together', () => {
    const n = new FlowNetwork()
    n.addEdge('s', 'a', 30)
    n.addEdge('s', 'b', 40)
    n.addEdge('a', 't', 30)
    n.addEdge('b', 't', 40)
    expect(edmondsKarp(n, 's', 't').maxFlow).toBe(70)
  })

  it('handles source equal to sink and unknown nodes', () => {
    expect(edmondsKarp(clrs(), 's', 's').maxFlow).toBe(0)
    expect(edmondsKarp(clrs(), 'ghost', 't').maxFlow).toBe(0)
  })

  it('records augmenting paths that add up to the maximum', () => {
    const { maxFlow, augmentingPaths } = edmondsKarp(clrs(), 's', 't')
    expect(augmentingPaths.length).toBeGreaterThan(0)
    expect(augmentingPaths.reduce((a, p) => a + p.pushed, 0)).toBe(maxFlow)
    expect(augmentingPaths[augmentingPaths.length - 1].totalAfter).toBe(maxFlow)
  })

  it('uses BFS, so each augmenting path is a fewest-hop path', () => {
    const { augmentingPaths } = edmondsKarp(clrs(), 's', 't')
    // Shortest augmenting paths never get shorter as the algorithm proceeds.
    const hops = augmentingPaths.map((p) => p.hops)
    expect(hops).toEqual([...hops].sort((a, b) => a - b))
  })

  it('needs the reverse edges: a network where a naive fill would stop short', () => {
    // Without undoable flow, routing s->a->b->t first blocks the better pairing.
    const n = new FlowNetwork()
    n.addEdge('s', 'a', 10)
    n.addEdge('s', 'b', 10)
    n.addEdge('a', 'b', 1)
    n.addEdge('a', 't', 10)
    n.addEdge('b', 't', 10)
    expect(edmondsKarp(n, 's', 't').maxFlow).toBe(20)
  })

  it('agrees with Ford-Fulkerson on the same network', () => {
    expect(fordFulkerson(clrs(), 's', 't').maxFlow).toBe(edmondsKarp(clrs(), 's', 't').maxFlow)
  })
})

describe('Ford-Fulkerson', () => {
  it('finds the same maximum on several networks', () => {
    const chain = () => {
      const n = new FlowNetwork()
      n.addEdge('s', 'a', 7)
      n.addEdge('a', 'b', 5)
      n.addEdge('b', 't', 9)
      return n
    }
    expect(fordFulkerson(chain(), 's', 't').maxFlow).toBe(5)
    expect(fordFulkerson(new FlowNetwork(), 's', 't').maxFlow).toBe(0)
  })
})

describe('min cut', () => {
  it('capacity equals the maximum flow (max-flow min-cut theorem)', () => {
    const n = clrs()
    const { maxFlow } = edmondsKarp(n, 's', 't')
    const cut = minCut(n, 's')
    expect(cut.capacity).toBe(maxFlow)
  })

  it('splits the nodes with the source on one side and the sink on the other', () => {
    const n = clrs()
    edmondsKarp(n, 's', 't')
    const cut = minCut(n, 's')
    expect(cut.sourceSide).toContain('s')
    expect(cut.sinkSide).toContain('t')
    expect(cut.sourceSide).not.toContain('t')
  })

  it('every cut edge is saturated', () => {
    const n = clrs()
    edmondsKarp(n, 's', 't')
    for (const e of minCut(n, 's').cutEdges) expect(e.saturated).toBe(true)
  })

  it('names the bottleneck link in a chain', () => {
    const n = new FlowNetwork()
    n.addEdge('Z1', 'Z4', 100, { text: 'Z1 to Z4', kind: 'corridor' })
    n.addEdge('Z4', 'StairB', 20, { text: 'Z4 to Staircase B', kind: 'corridor' })
    n.addEdge('StairB', 'T', 100, { text: 'Staircase B throughput', kind: 'gate' })
    const { maxFlow } = edmondsKarp(n, 'Z1', 'T')
    expect(maxFlow).toBe(20)
    const found = bottlenecks(minCut(n, 'Z1'))
    expect(found).toHaveLength(1)
    expect(found[0].label).toBe('Z4 to Staircase B')
    expect(found[0].capacity).toBe(20)
  })

  it('does not blame a congested link that has a parallel alternative', () => {
    // The narrow a->t link is NOT the bottleneck: flow reroutes through b.
    const n = new FlowNetwork()
    n.addEdge('s', 'a', 100, { text: 's to a' })
    n.addEdge('s', 'b', 100, { text: 's to b' })
    n.addEdge('a', 't', 5, { text: 'narrow but bypassable' })
    n.addEdge('b', 't', 95, { text: 'wide alternative' })
    n.addEdge('a', 'b', 100, { text: 'crossover' })
    edmondsKarp(n, 's', 't')
    const found = bottlenecks(minCut(n, 's'))
    // Both exit links are saturated and together form the cut, at 100 total.
    expect(found.reduce((a, b) => a + b.capacity, 0)).toBe(100)
  })

  it('reports the whole graph as the source side when the sink is unreachable', () => {
    const n = new FlowNetwork()
    n.addEdge('s', 'a', 10)
    n.node('t')
    edmondsKarp(n, 's', 't')
    const cut = minCut(n, 's')
    expect(cut.capacity).toBe(0)
    expect(cut.sinkSide).toContain('t')
  })

  it('drops the unbounded book-keeping edges from the bottleneck report', () => {
    const n = new FlowNetwork()
    n.addUnbounded('S', 'Z1', { text: 'people waiting' })
    n.addEdge('Z1', 'X', 15, { text: 'Z1 to Gate', kind: 'corridor' })
    n.addEdge('X', 'T', 100, { text: 'Gate throughput', kind: 'gate' })
    edmondsKarp(n, 'S', 'T')
    const found = bottlenecks(minCut(n, 'S'))
    expect(found.every((b) => b.label !== 'people waiting')).toBe(true)
    expect(found[0].capacity).toBe(15)
  })
})
