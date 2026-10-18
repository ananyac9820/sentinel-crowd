// "Emergency Crowd Surge": the deterministic demo state for the DAA engine.
// It is the existing scripted station scenario (simulation.js) replayed with NO automatic response
// up to 0:58, when the train has arrived, the B3 staircase has counter-flow and the platform is
// CRITICAL. No random numbers are involved, so every load gives exactly the same crowd state.
import { CrowdEngine, DEFAULT_SETTINGS } from '../lib/risk.js'
import { aggregateGrid, DEFAULT_ZONES, finalise } from '../lib/zones.js'
import { sideGrid, stepSimulation, STATION_CAMERAS } from '../lib/simulation.js'
import { cloneProfile } from '../lib/site.js'

export const EMERGENCY_T = 58
export const EMERGENCY_NAME = 'Emergency Crowd Surge'
const STEP = 0.5

export const SIDE_IDS = STATION_CAMERAS.filter((c) => !c.main).map((c) => c.id)

export function makeSideEngines() {
  return Object.fromEntries(
    SIDE_IDS.map((id) => {
      const short = STATION_CAMERAS.find((c) => c.id === id).short
      return [id, new CrowdEngine(DEFAULT_SETTINGS.sim, finalise(DEFAULT_ZONES.map((z) => ({ ...z, name: `${short} ${z.id}` }))))]
    }),
  )
}

// Steps the main and side engines from t = 0 to `toT` exactly like the dashboard clock does.
export function replayScenario({ engine, sideEngines, zones, toT = EMERGENCY_T, plan = [], wallStart = 0 }) {
  engine.reset()
  Object.values(sideEngines).forEach((e) => e.reset())
  let result = null
  let sideSnaps = {}
  for (let i = 0; i * STEP <= toT + 1e-9; i++) {
    const t = i * STEP
    const prev = i === 0 ? -1 : t - STEP
    result = stepSimulation(engine, prev, t, wallStart + t * 1000, plan, (g) => aggregateGrid(g, zones))
    sideSnaps = {}
    for (const id of SIDE_IDS) {
      const g = sideGrid(id, t, plan)
      sideSnaps[id] = sideEngines[id].step(g.counts, t, wallStart + t * 1000, g.motion)
    }
  }
  return { t: toT, grid: result.grid, snap: result.snap, sideSnaps }
}

// Stand-alone version for tests and scripts: fresh engines, default zones and settings, station site.
export function loadEmergencyState() {
  const zones = DEFAULT_ZONES
  const site = cloneProfile('station')
  const engine = new CrowdEngine(DEFAULT_SETTINGS.sim, zones, site)
  const { snap, sideSnaps } = replayScenario({ engine, sideEngines: makeSideEngines(), zones })
  return { snap, sideSnaps, zones, site, settings: DEFAULT_SETTINGS.sim }
}
