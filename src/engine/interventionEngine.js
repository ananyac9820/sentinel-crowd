// Builds the candidate interventions from the live situation, and turns a chosen set into a
// flow network so its effect can be measured rather than asserted.
//
// Every candidate is generated FROM the graph and the min cut, not from a fixed list:
//   * "Open <exit>" exists only for exits that actually appear in the cut, or that serve the
//     dangerous region. Opening a gate the crowd cannot reach would gain nothing, and the flow
//     model would correctly score it at zero -- so it is not offered.
//   * "Widen <link>" exists only for the cut edges. Widening a link outside the cut provably
//     cannot raise throughput (max-flow min-cut), so offering it would be misleading.
//   * "Pause entry at <entry>" exists only where an entry feeds a zone that is already loaded.
//   * "Make <link> one-way" exists only where counter-flow was actually detected.
//
// riskReduction and cost are ESTIMATES, and the UI says so. What is computed, not estimated, is
// the effect on evacuation throughput: `evaluatePlan` rebuilds the flow network with the plan
// applied and runs Edmonds-Karp, so the clearance time attached to any plan is a real result.

import FlowNetwork from '../algorithms/flow/FlowNetwork.js'
import { edmondsKarp } from '../algorithms/flow/edmondsKarp.js'
import { minCut, bottlenecks } from '../algorithms/flow/minCut.js'
import { disconnectsExits } from '../algorithms/graph/dfs.js'
import { MODEL } from './crowdGraphBuilder.js'

export const SOURCE = 'SUPER:source'
export const SINK = 'SUPER:sink'

/**
 * Builds the evacuation flow network from a crowd graph.
 *
 * super source -> every zone holding people   (unbounded: "these people need to leave")
 * zone -> zone / zone -> exit                 (people per minute the link passes)
 * exit -> super sink                          (the gate's own throughput)
 *
 * The source edges are left unbounded on purpose. If they were capped by occupancy the minimum
 * cut would often be the zones themselves, which staff cannot widen; leaving them unbounded
 * forces the cut onto real corridors and gates.
 */
export function buildFlowNetwork(graph, { extraExitCapacity, capacityScale } = {}) {
  const net = new FlowNetwork()
  net.node(SOURCE)
  net.node(SINK)

  for (const node of graph.nodesOfKind('zone')) {
    net.node(node.id)
    if (node.people > 0) net.addUnbounded(SOURCE, node.id, { text: `people waiting in ${node.name}`, kind: 'source' })
  }

  for (const edge of graph.edges) {
    const from = graph.getNode(edge.from)
    const to = graph.getNode(edge.to)
    if (from.kind === 'entry' || to.kind === 'entry') continue // entries bring people IN, not out
    const scale = capacityScale?.(edge) ?? 1
    net.addEdge(edge.from, edge.to, edge.capacity * scale, {
      text: `${from.name} to ${to.name}`,
      kind: to.kind === 'exit' ? 'exit-link' : 'corridor',
      zoneId: from.kind === 'zone' ? from.id : null,
      edgeId: edge.id,
    })
  }

  for (const exit of graph.nodesOfKind('exit')) {
    const extra = extraExitCapacity?.get(exit.pointId) ?? 0
    const throughput = (exit.opened === false ? 0 : MODEL.EXIT_WIDTH_M * MODEL.SPECIFIC_FLOW) + extra
    net.addEdge(exit.id, SINK, throughput, { text: `${exit.name} throughput`, kind: 'gate', exitId: exit.pointId, exitName: exit.name })
  }

  return net
}

/**
 * Max flow, min cut and clearance time for a graph as it stands.
 * @returns {{ maxFlow (people/min), evacSeconds, cut, bottlenecks, augmentingPaths, stats }}
 */
export function analyseFlow(graph, people, options = {}) {
  const net = buildFlowNetwork(graph, options)
  const flow = edmondsKarp(net, SOURCE, SINK, { recordPaths: options.recordPaths !== false })
  const cut = minCut(net, SOURCE)
  return {
    network: net,
    maxFlow: flow.maxFlow,
    // Clearance time = people / throughput. A throughput of zero means they cannot get out at
    // all, which is reported as Infinity rather than silently as a large number.
    evacSeconds: flow.maxFlow > 0 ? (people / flow.maxFlow) * 60 : Infinity,
    cut,
    bottlenecks: bottlenecks(cut),
    augmentingPaths: flow.augmentingPaths,
    stats: { flow: flow.stats, cut: cut.stats },
  }
}

/**
 * The candidate interventions for the current situation.
 * @param context { graph, bottlenecks, dangerRegion, closedExits, people, maxFlow }
 */
export function buildInterventions({ graph, bottlenecks: bn = [], dangerRegion, maxFlow = 0, warranted = true }) {
  const out = []
  // Nothing is wrong, so nothing is proposed. A minimum cut always exists -- even an empty,
  // perfectly safe site has one -- so the cut by itself is not a reason to act. Offering actions
  // unconditionally would make the recommendation meaningless at SAFE.
  if (!warranted) return out
  const cutExitIds = new Set(bn.filter((b) => b.kind === 'gate').map((b) => b.to))
  const dangerZoneIds = new Set(dangerRegion?.nodes ?? [])

  // ---- 1. Open or widen an exit ----
  // Offered for exits in the cut, and for exits serving the dangerous region. Both are places
  // where extra gate throughput can actually be used.
  for (const exit of graph.nodesOfKind('exit')) {
    const servesDanger = graph.edges.some((e) => e.to === exit.id && dangerZoneIds.has(e.from))
    const inCut = cutExitIds.has(exit.id) || bn.some((b) => b.to === exit.id)
    if (!servesDanger && !inCut) continue
    const gain = Math.round(MODEL.EXIT_WIDTH_M * MODEL.SPECIFIC_FLOW * 0.5) // one more lane
    out.push({
      id: `open:${exit.pointId}`,
      label: exit.opened === false ? `Open ${exit.name}` : `Add a lane at ${exit.name}`,
      kind: 'exit-capacity',
      target: exit.pointId,
      targetName: exit.name,
      capacityGain: gain,
      // Estimated: proportional to how much of the current throughput this adds.
      riskReduction: Math.min(40, Math.round((gain / Math.max(gain, maxFlow)) * 55) + (inCut ? 10 : 0)),
      cost: exit.opened === false ? 6 : 4,
      staff: 2,
      timeToEffect: exit.opened === false ? 90 : 45,
      why: inCut
        ? `${exit.name} is on the minimum cut, so its throughput is part of what limits the whole site. Widening a link inside the cut is the only kind of widening that can raise the maximum flow.`
        : `${exit.name} serves the dangerous region, so extra throughput there can be used by the people who need it.`,
    })
  }

  // ---- 2. Widen or relieve a corridor on the cut ----
  for (const b of bn.filter((x) => x.kind === 'corridor').slice(0, 3)) {
    out.push({
      id: `relieve:${b.id}`,
      label: `Relieve ${b.label}`,
      kind: 'corridor-capacity',
      target: b.id,
      targetName: b.label,
      capacityGain: Math.max(8, Math.round(b.capacity * 0.6)),
      riskReduction: Math.min(35, 12 + Math.round(b.capacity / 4)),
      cost: 5,
      staff: 3,
      timeToEffect: 60,
      why: `${b.label} is a minimum-cut edge carrying only ${b.capacity} people per minute. Clearing it (removing obstructions, stewarding it as a single stream) raises the cut capacity, and by the max-flow min-cut theorem that is what raises total throughput.`,
    })
  }

  // ---- 3. Pause entry where an entry feeds a loaded zone ----
  for (const entry of graph.nodesOfKind('entry')) {
    const feeds = graph.neighbours(entry.id).map((e) => graph.getNode(e.to))
    const loaded = feeds.filter((z) => (z?.load ?? 0) > 0.5)
    if (!loaded.length) continue
    out.push({
      id: `pause:${entry.pointId}`,
      label: `Pause entry at ${entry.name}`,
      kind: 'inflow',
      target: entry.pointId,
      targetName: entry.name,
      // Holding people back does not widen anything, so it adds no evacuation throughput. It
      // reduces the number of people who have to be evacuated, which the flow model sees as a
      // smaller numerator rather than a bigger denominator.
      capacityGain: 0,
      peopleHeldBack: Math.round(loaded.reduce((a, z) => a + z.people, 0) * 0.3),
      riskReduction: Math.min(30, 10 + Math.round(loaded.reduce((a, z) => a + z.load, 0) * 12)),
      cost: 3,
      staff: 2,
      timeToEffect: 30,
      why: `${entry.name} feeds ${loaded.map((z) => z.name).join(', ')}, already above half the critical density. Pausing inflow does not raise throughput; it lowers the number of people who still have to get out.`,
    })
  }

  // ---- 4. Make a counter-flow link one-way ----
  for (const zone of graph.nodesOfKind('zone').filter((z) => z.counterFlow)) {
    out.push({
      id: `oneway:${zone.id}`,
      label: `Make movement one-way in ${zone.name}`,
      kind: 'one-way',
      target: zone.id,
      targetName: zone.name,
      // Opposing streams waste width. Removing the opposition recovers part of it.
      capacityGain: Math.round(
        graph
          .neighbours(zone.id)
          .reduce((a, e) => a + e.capacity, 0) * 0.15,
      ),
      riskReduction: 22,
      cost: 2,
      staff: 1,
      timeToEffect: 25,
      why: `Counter-flow was detected in ${zone.name}. Two streams passing through one width achieve less than one stream using all of it, so holding a single direction recovers part of the lost capacity. Opposing flows at stairs and gates are a common crush trigger.`,
    })
  }

  // Deterministic order so the same situation always yields the same catalogue.
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Applies a set of interventions to the model and measures the result with a real max flow.
 * This is the function greedy, the DP and the backtracking search are all scored against, so
 * every number any of them reports comes from the same computation.
 */
export function evaluatePlan(graph, people, subset) {
  const extraExitCapacity = new Map()
  const corridorBoost = new Map()
  const openedPoints = new Set()
  let heldBack = 0

  for (const iv of subset ?? []) {
    if (iv.kind === 'exit-capacity') {
      extraExitCapacity.set(iv.target, (extraExitCapacity.get(iv.target) ?? 0) + iv.capacityGain)
      openedPoints.add(iv.target)
    } else if (iv.kind === 'corridor-capacity') {
      corridorBoost.set(iv.target, (corridorBoost.get(iv.target) ?? 0) + iv.capacityGain)
    } else if (iv.kind === 'one-way') {
      for (const e of graph.neighbours(iv.target)) corridorBoost.set(e.id, (corridorBoost.get(e.id) ?? 0) + e.capacity * 0.15)
    } else if (iv.kind === 'inflow') {
      heldBack += iv.peopleHeldBack ?? 0
    }
  }

  // Opening a closed exit also restores the zone-to-exit approach link, which the builder gave
  // zero capacity while the gate was shut. `baseCapacity` is the approach's congestion-adjusted
  // capacity, computed when the graph was built.
  const adjusted = graph.mapEdges((e) => {
    const boost = corridorBoost.get(e.id) ?? 0
    const to = graph.getNode(e.to)
    const reopened = to.kind === 'exit' && openedPoints.has(to.pointId) && e.capacity <= 0
    if (reopened) return { capacity: (e.baseCapacity ?? MODEL.MIN_CAPACITY) + boost }
    // An opened or widened gate also gets a wider approach: the extra lane has to be walked to.
    if (to.kind === 'exit' && extraExitCapacity.has(to.pointId)) return { capacity: e.capacity + extraExitCapacity.get(to.pointId) + boost }
    return boost ? { capacity: e.capacity + boost } : null
  })
  for (const node of adjusted.nodesOfKind('exit')) if (openedPoints.has(node.pointId)) node.opened = true

  const peopleToMove = Math.max(0, people - heldBack)
  const result = analyseFlow(adjusted, peopleToMove, { extraExitCapacity, recordPaths: false })
  return {
    maxFlow: result.maxFlow,
    evacSeconds: result.evacSeconds,
    people: peopleToMove,
    heldBack,
    bottlenecks: result.bottlenecks,
    graph: adjusted,
  }
}

/**
 * An optimistic lower bound on evacuation time for ANY completion of a partial plan: assume
 * every remaining candidate is taken, so all their capacity and all their held-back people
 * count. Admissible because neither extra capacity nor fewer people can ever make evacuation
 * slower, so no real descendant can beat this. Required for the branch-and-bound pruning to be
 * correct rather than merely fast.
 */
export function boundEvacSeconds(graph, people, chosen, rest, currentMaxFlow) {
  const gain = [...chosen, ...rest].reduce((a, iv) => a + (iv.capacityGain ?? 0), 0)
  const held = [...chosen, ...rest].reduce((a, iv) => a + (iv.peopleHeldBack ?? 0), 0)
  const flow = currentMaxFlow + gain
  if (flow <= 0) return Infinity
  return (Math.max(0, people - held) / flow) * 60
}

/** Would this plan strand a zone? Only closures can, so plans without one are always safe. */
export function planIsSafe(graph, subset) {
  const closures = (subset ?? []).filter((iv) => iv.kind === 'close-link')
  if (!closures.length) return true
  const ids = new Set(closures.map((iv) => iv.target))
  return disconnectsExits(graph, (e) => ids.has(e.id)).safe
}
