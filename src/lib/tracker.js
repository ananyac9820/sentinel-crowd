// Lightweight multi-person tracker for Live mode.
// Detections arrive about twice a second. Each detection is matched to the nearest existing
// track (closest pairs first, within a distance a walking person could cover), velocities are
// smoothed, and a person only reports a velocity after being seen in three consecutive samples.
// This keeps detector jitter from looking like crowd turbulence.

const MAX_SPEED = 0.6 // frame heights per second; faster jumps are treated as different people
const MIN_GATE = 0.04
const VELOCITY_EMA = 0.5
const MIN_AGE = 2 // matched this many times before velocity is trusted
const MAX_MISSED = 2

export class Tracker {
  constructor() {
    this.reset()
  }

  reset() {
    this.tracks = []
    this.lastT = null
    this.nextId = 1
  }

  /**
   * @param points [{x, y}] person centres, normalised 0..1
   * @param t      time in seconds (video time, so pauses and slow frames are handled)
   * @param aspect frame width / height, so distances are measured in frame heights
   * @returns      [{x, y, vx?, vy?}] velocities in frame heights per second
   */
  update(points, t, aspect) {
    const dt = this.lastT === null ? null : t - this.lastT
    this.lastT = t
    if (dt === null || dt <= 0 || dt > 3) {
      // First frame, a seek, or a long gap: start fresh.
      this.tracks = points.map((p) => ({ id: this.nextId++, x: p.x, y: p.y, vx: 0, vy: 0, age: 0, missed: 0 }))
      return points.map((p) => ({ x: p.x, y: p.y }))
    }

    const gate = Math.max(MIN_GATE, MAX_SPEED * dt)
    const pairs = []
    points.forEach((p, i) =>
      this.tracks.forEach((tr, j) => {
        const d = Math.hypot((p.x - tr.x) * aspect, p.y - tr.y)
        if (d <= gate) pairs.push({ i, j, d })
      }),
    )
    pairs.sort((a, b) => a.d - b.d)

    const pointTrack = new Array(points.length).fill(null)
    const usedTracks = new Set()
    for (const { i, j } of pairs) {
      if (pointTrack[i] !== null || usedTracks.has(j)) continue
      pointTrack[i] = j
      usedTracks.add(j)
    }

    const out = []
    const next = []
    points.forEach((p, i) => {
      const j = pointTrack[i]
      if (j === null) {
        next.push({ id: this.nextId++, x: p.x, y: p.y, vx: 0, vy: 0, age: 0, missed: 0 })
        out.push({ x: p.x, y: p.y })
        return
      }
      const tr = this.tracks[j]
      const rawVx = ((p.x - tr.x) * aspect) / dt
      const rawVy = (p.y - tr.y) / dt
      const vx = tr.age ? tr.vx + (rawVx - tr.vx) * VELOCITY_EMA : rawVx
      const vy = tr.age ? tr.vy + (rawVy - tr.vy) * VELOCITY_EMA : rawVy
      const updated = { ...tr, x: p.x, y: p.y, vx, vy, age: tr.age + 1, missed: 0 }
      next.push(updated)
      out.push(updated.age >= MIN_AGE ? { x: p.x, y: p.y, vx, vy } : { x: p.x, y: p.y })
    })
    // Keep briefly missed tracks so a person hidden for one frame keeps their identity.
    this.tracks.forEach((tr, j) => {
      if (!usedTracks.has(j) && tr.missed < MAX_MISSED) next.push({ ...tr, missed: tr.missed + 1 })
    })
    this.tracks = next
    return out
  }
}
