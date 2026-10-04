// Zones are named rectangles in normalised camera coordinates (0..1).
// The default layout is the 4x3 grid A1..C4; staff can draw their own in Setup.

export const GRID_ROWS = ['A', 'B', 'C']
export const GRID_COLS = 4
export const GRID_CELLS = GRID_ROWS.length * GRID_COLS

// Exit gates along the bottom edge of the platform (x positions), shared with the simulated feed.
export const GATES = [0.15, 0.42, 0.85]

export const nearestGate = (x) => GATES.reduce((best, gx, i) => (Math.abs(gx - x) < Math.abs(GATES[best] - x) ? i : best), 0) + 1

export function gridZones() {
  const zones = []
  for (let r = 0; r < GRID_ROWS.length; r++)
    for (let c = 0; c < GRID_COLS; c++) {
      zones.push({ id: `${GRID_ROWS[r]}${c + 1}`, name: `${GRID_ROWS[r]}${c + 1}`, x: c / GRID_COLS, y: r / GRID_ROWS.length, w: 1 / GRID_COLS, h: 1 / GRID_ROWS.length })
    }
  return finalise(zones)
}

export const DEFAULT_ZONES = gridZones()

// Adds derived fields: gate, neighbours, grid overlap weights.
export function finalise(zones) {
  const out = zones.map((z) => ({ ...z, gate: z.gate ?? nearestGate(z.x + z.w / 2) }))
  out.forEach((z, i) => {
    const touching = []
    out.forEach((o, j) => {
      if (i === j) return
      const tol = 0.02
      const xOverlap = Math.min(z.x + z.w, o.x + o.w) - Math.max(z.x, o.x)
      const yOverlap = Math.min(z.y + z.h, o.y + o.h) - Math.max(z.y, o.y)
      if ((xOverlap > tol && yOverlap > -tol) || (yOverlap > tol && xOverlap > -tol)) touching.push(j)
    })
    if (!touching.length) {
      // Isolated custom zone: use the two nearest zones as neighbours.
      const cx = z.x + z.w / 2
      const cy = z.y + z.h / 2
      out
        .map((o, j) => ({ j, d: i === j ? Infinity : Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .forEach(({ j, d }) => d < Infinity && touching.push(j))
    }
    z.neighbours = touching
    // Fraction of each grid cell's area that lies inside this zone (used to map simulated grid counts).
    z.cellWeights = Array.from({ length: GRID_CELLS }, (_, k) => {
      const cx0 = (k % GRID_COLS) / GRID_COLS
      const cy0 = Math.floor(k / GRID_COLS) / GRID_ROWS.length
      const cw = 1 / GRID_COLS
      const ch = 1 / GRID_ROWS.length
      const ix = Math.max(0, Math.min(z.x + z.w, cx0 + cw) - Math.max(z.x, cx0))
      const iy = Math.max(0, Math.min(z.y + z.h, cy0 + ch) - Math.max(z.y, cy0))
      return (ix * iy) / (cw * ch)
    })
  })
  return out
}

export const isDefaultGrid = (zones) => zones.length === GRID_CELLS && zones.every((z, i) => z.id === DEFAULT_ZONES[i].id && z.custom !== true)

// Simulated grid cells -> zones. Counts are split by area overlap; motion is a count-weighted average.
export function aggregateGrid(grid, zones) {
  const counts = zones.map((z) => z.cellWeights.reduce((sum, wgt, k) => sum + wgt * grid.counts[k], 0))
  const motion = zones.map((z) => {
    let wsum = 0
    const m = { vx: 0, vy: 0, spread: 0, counter: 0 }
    z.cellWeights.forEach((wgt, k) => {
      const w = wgt * Math.max(grid.counts[k], 0.01)
      if (!w) return
      const g = grid.motion[k]
      m.vx += g.vx * w
      m.vy += g.vy * w
      m.spread += g.spread * w
      m.counter += g.counter * w
      wsum += w
    })
    if (!wsum) return null
    return { vx: m.vx / wsum, vy: m.vy / wsum, spread: m.spread / wsum, counter: m.counter / wsum }
  })
  return { counts, motion }
}

const inZone = (z, x, y) => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h

// Live detections -> zones. Each person counts in the first zone containing their centre.
// Motion per zone: mean velocity, velocity spread (standard deviation) and a counter-flow index:
// 0 when everyone moves the same way, 1 when movements cancel out.
export function aggregatePeople(people, zones) {
  const counts = zones.map(() => 0)
  const groups = zones.map(() => [])
  for (const p of people) {
    const i = zones.findIndex((z) => inZone(z, p.x, p.y))
    if (i < 0) continue
    counts[i]++
    if (p.vx != null) groups[i].push(p)
  }
  const motion = groups.map((g) => {
    if (g.length < 2) return null
    const n = g.length
    const vx = g.reduce((a, p) => a + p.vx, 0) / n
    const vy = g.reduce((a, p) => a + p.vy, 0) / n
    const spread = Math.sqrt(g.reduce((a, p) => a + (p.vx - vx) ** 2 + (p.vy - vy) ** 2, 0) / n)
    const meanSpeed = g.reduce((a, p) => a + Math.hypot(p.vx, p.vy), 0) / n
    const counter = meanSpeed > 0.02 && n >= 3 ? Math.max(0, 1 - Math.hypot(vx, vy) / meanSpeed) : 0
    return { vx, vy, spread, counter }
  })
  return { counts, motion }
}
