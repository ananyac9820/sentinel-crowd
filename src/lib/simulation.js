// Scripted 90-second scenario: evening rush on Platform 2 of a busy junction.
// A delayed train is announced, the crowd funnels toward the staircase (B3), a train arrives and
// passengers push up the stairs against the crowd, alerts escalate to CRITICAL, and an intervention
// (by default, opening Gate 2 at 1:06) brings the risk back down.
//
// The script is deterministic so every demo run is identical. Interventions can also be applied
// by hand ("what if" buttons); each one reduces the crowd from the moment it is applied.

import { GRID_CELLS, GRID_COLS } from './zones.js'

export const SIM_DURATION = 90
export const AUTO_INTERVENTION_AT = 66

export const PHASES = [
  { t: 0, label: 'Normal evening flow' },
  { t: 18, label: 'Train delay announced, platform filling' },
  { t: 36, label: 'Crowd funnelling toward staircase (B3)' },
  { t: 46, label: 'Train arrives: passengers pushing up the stairs against the crowd' },
  { t: 54, label: 'Crush risk at staircase' },
]

// What-if actions. `effect(cell)` is the share of the extra crowd in that cell the action removes;
// `tau` is how fast it works (seconds).
export const INTERVENTIONS = {
  gate2: {
    label: 'Open exit gate 2',
    short: 'Gate 2 opened',
    message: 'Station control opened exit gate 2. People near the staircase are leaving through it.',
    tau: 6,
    effect: (k) => {
      const r = Math.floor(k / GRID_COLS)
      const c = k % GRID_COLS
      if ((c === 1 || c === 2) && r > 0) return 0.92
      if (c === 1 || c === 2) return 0.6
      return 0.4
    },
  },
  pauseEntry: {
    label: 'Pause entry',
    short: 'Entry paused',
    message: 'Entry to Platform 2 paused at the concourse. No new people are coming onto the platform.',
    tau: 18,
    freezesGrowth: true,
    effect: () => 0.4,
  },
  redirect: {
    label: 'Redirect to Platform 3',
    short: 'Redirected to PF-3',
    message: 'Announcement made: the delayed service will leave from Platform 3. People are moving across the footbridge.',
    tau: 10,
    effect: (k) => (Math.floor(k / GRID_COLS) === 0 ? 0.3 : 0.5),
  },
}

// Crowd without any intervention: it keeps building after the train arrives.
// Row-major A1..A4, B1..B4, C1..C4: [time, people].
const KEYS = [
  [[0, 2], [18, 3], [45, 6], [62, 7], [90, 7]], // A1
  [[0, 3], [18, 4], [45, 6], [62, 7], [90, 7]], // A2
  [[0, 3], [18, 4], [45, 6], [62, 7], [90, 8]], // A3
  [[0, 2], [18, 3], [45, 5], [62, 6], [90, 6]], // A4
  [[0, 3], [18, 4], [45, 6], [62, 7], [90, 7]], // B1
  [[0, 3], [18, 5], [40, 7], [52, 11], [62, 14], [70, 15], [90, 16]], // B2
  [[0, 4], [18, 5], [34, 7], [42, 11], [50, 16], [56, 20], [62, 24], [70, 25], [90, 27]], // B3
  [[0, 3], [18, 4], [45, 6], [62, 7], [90, 7]], // B4
  [[0, 2], [18, 3], [45, 5], [62, 6], [90, 6]], // C1
  [[0, 3], [18, 4], [45, 6], [62, 7], [90, 8]], // C2
  [[0, 3], [18, 4], [42, 7], [54, 11], [63, 14], [70, 15], [90, 16]], // C3
  [[0, 2], [18, 3], [45, 5], [62, 6], [90, 6]], // C4
]
const FLOOR = KEYS.map((k) => k[0][1])

// Velocity spread (how chaotic movement is, in frame heights per second) and counter-flow (0..1).
const CALM_SPREAD = 0.01
const SPREAD_KEYS = {
  6: [[0, 0.01], [38, 0.014], [42, 0.022], [46, 0.045], [52, 0.06], [62, 0.065], [90, 0.065]], // B3
  5: [[0, 0.01], [44, 0.012], [54, 0.03], [62, 0.04], [90, 0.04]], // B2
  10: [[0, 0.01], [44, 0.014], [52, 0.035], [62, 0.045], [90, 0.045]], // C3
}
const COUNTER_KEYS = {
  6: [[0, 0], [44, 0.05], [48, 0.62], [56, 0.75], [90, 0.72]], // B3
  10: [[0, 0], [45, 0.05], [49, 0.66], [58, 0.7], [90, 0.68]], // C3
}
const STAIRS = { x: 0.625, y: 0.95 }

const ease = (x) => x * x * (3 - 2 * x)

function interp(keys, t) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let k = 1; k < keys.length; k++) {
    const [t1, v1] = keys[k]
    const [t0, v0] = keys[k - 1]
    if (t <= t1) return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0))
  }
  return keys[keys.length - 1][1]
}

const progress = (iv, t) => (t < iv.at ? 0 : 1 - Math.exp(-(t - iv.at) / INTERVENTIONS[iv.type].tau))

// Remaining share of the "extra" crowd in cell k after all interventions applied so far.
function remaining(k, t, interventions) {
  let keep = 1
  for (const iv of interventions) keep *= 1 - INTERVENTIONS[iv.type].effect(k) * progress(iv, t)
  return keep
}

function baseTime(t, interventions) {
  const pause = interventions.find((iv) => INTERVENTIONS[iv.type].freezesGrowth && t >= iv.at)
  return pause ? Math.min(t, pause.at) : t
}

// Default plan: Gate 2 opens automatically at 1:06 so the stage demo is always the same.
export const defaultPlan = () => [{ type: 'gate2', at: AUTO_INTERVENTION_AT, auto: true }]

/** Platform 2 (CAM-03): people and motion per grid cell. */
export function simGrid(t, interventions = defaultPlan()) {
  const tt = Math.min(t, SIM_DURATION)
  const tb = Math.min(baseTime(t, interventions), SIM_DURATION)
  const counts = KEYS.map((keys, k) => {
    const extra = Math.max(0, interp(keys, tb) - FLOOR[k]) * remaining(k, t, interventions)
    const jitter = 0.3 * Math.sin(t * 0.9 + k * 1.7) + 0.15 * Math.sin(t * 2.3 + k * 0.6)
    return Math.max(0, Math.round(FLOOR[k] + extra + jitter))
  })
  const motion = KEYS.map((_, k) => {
    const keep = remaining(k, t, interventions)
    const spreadPeak = SPREAD_KEYS[k] ? interp(SPREAD_KEYS[k], tt) : CALM_SPREAD
    const spread = CALM_SPREAD + (spreadPeak - CALM_SPREAD) * keep
    const counter = (COUNTER_KEYS[k] ? interp(COUNTER_KEYS[k], tt) : 0) * keep
    // Everyone drifts toward the staircase; dense cells move slower.
    const cx = ((k % GRID_COLS) + 0.5) / GRID_COLS
    const cy = (Math.floor(k / GRID_COLS) + 0.5) / 3
    const dx = STAIRS.x - cx
    const dy = STAIRS.y - cy
    const d = Math.hypot(dx, dy) || 1
    const speed = 0.035 / (1 + counts[k] / 12)
    return { vx: (dx / d) * speed, vy: (dy / d) * speed, spread, counter }
  })
  return { counts, motion }
}

// People an intervention has moved off Platform 2 by time t.
function displaced(type, t, interventions) {
  const iv = interventions.find((x) => x.type === type)
  if (!iv || t < iv.at) return null
  const tb = Math.min(baseTime(t, interventions), SIM_DURATION)
  let total = 0
  for (let k = 0; k < GRID_CELLS; k++) {
    const extra = Math.max(0, interp(KEYS[k], tb) - FLOOR[k])
    total += extra * INTERVENTIONS[type].effect(k) * progress(iv, t)
  }
  return { total, since: t - iv.at }
}

// People held back at the concourse because entry is paused.
function blocked(t, interventions) {
  const iv = interventions.find((x) => x.type === 'pauseEntry')
  if (!iv || t < iv.at) return 0
  const now = Math.min(t, SIM_DURATION)
  let total = 0
  for (let k = 0; k < GRID_CELLS; k++) total += Math.max(0, interp(KEYS[k], now) - interp(KEYS[k], Math.min(iv.at, SIM_DURATION)))
  return total
}

// Cameras on the station map. Only CAM-03 has a video view; the others report numbers.
export const STATION_CAMERAS = [
  { id: 'CAM-01', name: 'Main concourse', short: 'Concourse' },
  { id: 'CAM-02', name: 'Footbridge', short: 'Footbridge' },
  { id: 'CAM-03', name: 'Platform 2', short: 'Platform 2', main: true },
  { id: 'CAM-04', name: 'Platform 3', short: 'Platform 3' },
]

const SIDE_BASE = {
  'CAM-01': [[0, 30], [20, 34], [40, 42], [70, 44], [90, 38]],
  'CAM-02': [[0, 14], [30, 18], [60, 22], [90, 20]],
  'CAM-04': [[0, 18], [40, 22], [90, 22]],
}
const CELL_SHARE = [0.06, 0.08, 0.09, 0.07, 0.08, 0.1, 0.11, 0.08, 0.07, 0.09, 0.09, 0.08] // sums to 1

export function sideGrid(camId, t, interventions = defaultPlan()) {
  let total = interp(SIDE_BASE[camId], Math.min(t, SIM_DURATION))
  if (camId === 'CAM-01') total += blocked(t, interventions) * 0.9
  if (camId === 'CAM-02') {
    const d = displaced('gate2', t, interventions)
    if (d) total += d.total * 0.6 * Math.exp(-d.since / 35)
    const r = displaced('redirect', t, interventions)
    if (r) total += r.total * 0.7 * Math.exp(-r.since / 15)
  }
  if (camId === 'CAM-04') {
    const r = displaced('redirect', t, interventions)
    if (r) total += r.total * 0.85 * (1 - Math.exp(-r.since / 12))
  }
  const counts = CELL_SHARE.map((s, k) => Math.max(0, Math.round(total * s + 0.3 * Math.sin(t * 0.7 + k * 2.1))))
  return { counts, motion: Array.from({ length: GRID_CELLS }, () => ({ vx: 0, vy: 0, spread: CALM_SPREAD, counter: 0 })) }
}

export function phaseAt(t, interventions = defaultPlan()) {
  const applied = interventions.filter((iv) => t >= iv.at).sort((a, b) => a.at - b.at)
  if (applied.length) {
    const last = applied[applied.length - 1]
    const since = t - last.at
    return { label: since < 12 ? `Action taken: ${INTERVENTIONS[last.type].short}` : since < 20 ? 'Crowd dispersing' : 'Crowd back to normal levels' }
  }
  let p = PHASES[0]
  for (const ph of PHASES) if (t >= ph.t) p = ph
  return p
}

// Runs one simulation tick for the main camera. Logs interventions as alerts when they take effect.
export function stepSimulation(engine, prevT, t, wall, interventions = defaultPlan(), aggregate) {
  const grid = simGrid(t, interventions)
  const input = aggregate ? aggregate(grid) : grid
  engine.step(input.counts, t, wall, input.motion)
  for (const iv of interventions) {
    if (prevT < iv.at && t >= iv.at) {
      const def = INTERVENTIONS[iv.type]
      engine.addEvent(
        def.message,
        iv.auto
          ? 'Scripted response at 1:06 in the demo scenario. Turn off "Auto response" to try your own actions.'
          : 'Action chosen by the operator with a what-if button. This is not a model rule.',
        wall,
        def.short,
      )
    }
  }
  return { grid, snap: engine.snapshot }
}
