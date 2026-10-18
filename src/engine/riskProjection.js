// Projected risk: replays the deterministic simulation with the EXISTING risk model (CrowdEngine)
// up to `horizon` seconds after now, once without and once with the proposed actions.
// This is an independent check of the graph-based plan, using Sentinel's own alert rules.
// Only meaningful in Simulation mode (a live camera cannot be replayed into the future).
import { CrowdEngine } from '../lib/risk.js'
import { aggregateGrid } from '../lib/zones.js'
import { simGrid } from '../lib/simulation.js'

const STEP = 0.5 // seconds, same tick as the dashboard

export function projectSimRisk({ tNow, basePlan = [], extra = [], zones, settings, site, horizon = 20 }) {
  const plan = [...basePlan, ...extra.filter((type) => !basePlan.some((iv) => iv.type === type)).map((type) => ({ type, at: tNow }))]
  const engine = new CrowdEngine(settings, zones, site)
  const end = tNow + horizon
  for (let t = 0; t <= end + 1e-9; t += STEP) {
    const agg = aggregateGrid(simGrid(t, plan), zones)
    engine.step(agg.counts, t, t * 1000, agg.motion)
  }
  const s = engine.snapshot
  return { score: s.score, level: s.overall, people: s.people, at: end }
}
