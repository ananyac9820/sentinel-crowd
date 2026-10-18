// Zone ranking for the decision engine, built on Sentinel's existing risk model (lib/risk.js).
//   - Merge sort ranks zones from most to least dangerous.
//   - Binary search finds each zone's alert band in the sorted threshold list. It uses the same
//     rule as risk.js zoneLevel (people per standard zone area vs WATCH / WARNING / CRITICAL).
import { mergeSort } from '../algorithms/sorting/mergeSort.js'
import { findBand } from '../algorithms/searching/binarySearch.js'
import { GRID_CELLS } from '../lib/zones.js'
import { LEVELS } from '../lib/risk.js'
import { zoneDensityPct } from './crowdGraphBuilder.js'

export const thresholdBands = (settings) => [
  { min: 0, level: 0, label: LEVELS[0].label },
  { min: settings.watch, level: 1, label: LEVELS[1].label },
  { min: settings.warning, level: 2, label: LEVELS[2].label },
  { min: settings.critical, level: 3, label: LEVELS[3].label },
]

// Most dangerous first: higher density, then more people, then turbulence.
export const byDanger = (a, b) => b.density - a.density || b.people - a.people || b.turbulence - a.turbulence

export function rankZones(snap, settings, trace = null) {
  const bands = thresholdBands(settings)
  const items = snap.zones.map((z, i) => {
    const people = snap.counts[i] ?? 0
    const perArea = Math.round(people / Math.max(0.15, z.w * z.h * GRID_CELLS))
    const search = findBand(bands, perArea)
    return {
      id: z.id,
      name: z.name,
      people,
      perArea,
      density: Math.round(zoneDensityPct(z, people, settings)),
      turbulence: snap.turbulence?.[i] ?? 0,
      band: search.band,
      probes: search.probes,
    }
  })
  return { before: items, ranked: mergeSort(items, byDanger, trace), bands }
}
