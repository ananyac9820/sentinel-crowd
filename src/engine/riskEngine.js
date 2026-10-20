// Risk scoring and zone ranking.
//
// Two jobs, each handed to the algorithm that fits it:
//   1. BAND LOOKUP (binary search). A density has to be placed into SAFE / WATCH / WARNING /
//      CRITICAL. The thresholds are ascending by construction, so this is a search over sorted
//      data; `bandOf` returns how many thresholds the value has reached.
//   2. RANKING (merge sort). Zones are ordered by a danger score so the table, the alerts and
//      the decision engine all agree on which zone is worst. Merge sort is used for the live
//      ranking because it is stable -- equal scores keep zone order instead of flickering --
//      and because its O(n log n) bound holds on the nearly-sorted input consecutive frames
//      produce, which is precisely quick sort's worst case.
//
// The danger score is a HEURISTIC, deliberately so, and the UI labels it as one. It weighs
// density load, turbulence, counter-flow and the forecast into a single comparable number. The
// algorithmic claims in Sentinel are about the ORDERING and the decisions downstream of it, not
// about the score formula being the one true measure of danger.

import { mergeSort } from '../algorithms/sorting/mergeSort.js'
import { quickSort } from '../algorithms/sorting/quickSort.js'
import { bandOf } from '../algorithms/searching/binarySearch.js'
import { criticalDensity } from './crowdGraphBuilder.js'

/** Ascending thresholds, in people per unit normalised area. */
export const densityThresholds = (settings) => {
  const cells = criticalDensity(settings) / settings.critical // = GRID_CELLS
  return [settings.watch * cells, settings.warning * cells, settings.critical * cells]
}

/**
 * Risk band for one density, by binary search over the thresholds.
 * @returns {{ band: 0|1|2|3, stats: object }}
 */
export function riskBand(density, settings) {
  return bandOf(densityThresholds(settings), density)
}

/**
 * Danger score 0..100+ for one zone. Higher is worse.
 *   load        how full it is relative to the CRITICAL density (the dominant term)
 *   turbulence  crowd pressure, which precedes a crush
 *   counterflow opposing streams, a known crush trigger
 *   forecast    a zone about to go critical is more urgent than one sitting still
 */
export function dangerScore(node, { forecast } = {}) {
  const load = Math.max(0, node.load ?? 0)
  let score = Math.min(100, load * 75) // 75 points at exactly the critical density
  score += (node.turbulence ?? 0) * 0.15 // up to 15
  if (node.counterFlow) score += 8
  if (node.surge) score += 5
  // A forecast of "critical in 10 s" adds more than "critical in 50 s".
  if (forecast != null && forecast > 0) score += Math.max(0, 12 * (1 - forecast / 60))
  return Math.round(score * 10) / 10
}

/**
 * Ranks the zones of a graph by danger.
 * @param {object} options { algorithm: 'merge' | 'quick', forecast: number[] }
 * @returns {{ ranked, byZoneIndex, algorithm, stats }}
 */
export function rankZones(graph, { algorithm = 'merge', forecast = [] } = {}) {
  const items = graph.nodesOfKind('zone').map((n) => ({
    id: n.id,
    name: n.name,
    zoneIndex: n.zoneIndex,
    people: n.people,
    load: n.load,
    level: n.level,
    turbulence: n.turbulence,
    counterFlow: n.counterFlow,
    forecast: forecast[n.zoneIndex] ?? null,
    score: dangerScore(n, { forecast: forecast[n.zoneIndex] }),
  }))

  // Descending by score. The tie-break on name keeps the order fully determined, so two
  // different sorts of the same data must agree -- which is what makes them comparable.
  const compare = (a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const run = algorithm === 'quick' ? quickSort(items, compare) : mergeSort(items, compare)

  const ranked = run.sorted.map((z, i) => ({ ...z, rank: i + 1 }))
  const byZoneIndex = new Map(ranked.map((z) => [z.zoneIndex, z.rank]))
  return { ranked, byZoneIndex, algorithm: algorithm === 'quick' ? 'Quick sort' : 'Merge sort', stats: run.stats }
}

/** Runs both sorts on the same zone data so the Algorithm Lab can compare them honestly. */
export function compareSorts(graph, { forecast = [] } = {}) {
  const merge = rankZones(graph, { algorithm: 'merge', forecast })
  const quick = rankZones(graph, { algorithm: 'quick', forecast })
  return {
    merge,
    quick,
    // Both must produce the identical order; if they ever disagree the comparator is not a
    // total order and the comparison is meaningless. The UI shows this check.
    agree: merge.ranked.map((z) => z.id).join('|') === quick.ranked.map((z) => z.id).join('|'),
  }
}
