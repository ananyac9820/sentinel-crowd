// Risk model for Sentinel Crowd.
// Kept deliberately simple and explainable: per-zone thresholds, a surge rule,
// and "overall = worst zone, +1 level if any zone is surging".

export const ROWS = ['A', 'B', 'C']
export const COLS = 4
export const ZONE_COUNT = ROWS.length * COLS

export const LEVELS = [
  { key: 'SAFE', label: 'SAFE', color: '#5a9468' },
  { key: 'WATCH', label: 'WATCH', color: '#bf9b3c' },
  { key: 'WARNING', label: 'WARNING', color: '#c06f38' },
  { key: 'CRITICAL', label: 'CRITICAL', color: '#b4463e' },
]
export const INFO_COLOR = '#4a7fab'

export const DEFAULT_SETTINGS = {
  // Simulation numbers are people per zone on a station platform.
  sim: { watch: 8, warning: 13, critical: 18, surgePct: 35, surgeWindow: 20, surgeMin: 4 },
  // A general detector finds far fewer people per frame, so live defaults are lower.
  live: { watch: 3, warning: 5, critical: 8, surgePct: 50, surgeWindow: 20, surgeMin: 2 },
}

export const zoneName = (i) => `${ROWS[Math.floor(i / COLS)]}${(i % COLS) + 1}`

export function zoneLevel(count, s) {
  if (count >= s.critical) return 3
  if (count >= s.warning) return 2
  if (count >= s.watch) return 1
  return 0
}

const thresholdFor = (level, s) => [0, s.watch, s.warning, s.critical][level]

// Exit gates sit along the bottom edge: Gate 1 under column 1, Gate 2 under
// columns 2–3 (next to the staircase), Gate 3 under column 4.
export const gateFor = (i) => {
  const col = i % COLS
  return col === 0 ? 1 : col === 3 ? 3 : 2
}

function neighbours(i) {
  const r = Math.floor(i / COLS)
  const c = i % COLS
  const out = []
  if (r > 0) out.push(i - COLS)
  if (r < ROWS.length - 1) out.push(i + COLS)
  if (c > 0) out.push(i - 1)
  if (c < COLS - 1) out.push(i + 1)
  return out
}

const SMOOTH_WINDOW = 1.5 // seconds, averages out detector flicker
const HISTORY = 130 // seconds of history kept
const TIMELINE = 120 // seconds shown on the chart
const SURGE_COOLDOWN = 30
const ZONE_ALERT_COOLDOWN = 3
const DOWNGRADE_HOLD = 3 // overall level must stay lower this long before easing

export class CrowdEngine {
  constructor(settings) {
    this.settings = settings
    this.reset()
  }

  reset() {
    this.raw = []
    this.smooth = []
    this.zoneAlertLevel = Array(ZONE_COUNT).fill(0)
    this.zoneLastAlertAt = Array(ZONE_COUNT).fill(-1e9)
    this.surgeLastAt = Array(ZONE_COUNT).fill(-1e9)
    this.overall = 0
    this.downSince = null
    this.alerts = []
    this.timeline = []
    this.lastTimelineT = -1e9
    this.seq = 0
    this.snapshot = emptySnapshot()
  }

  pushAlert(a) {
    this.alerts = [{ id: ++this.seq, ...a }, ...this.alerts].slice(0, 60)
  }

  addEvent(message, why, wall) {
    this.pushAlert({ time: wall, zone: 'SITE', severity: -1, title: 'Intervention', message, why })
    this.snapshot = { ...this.snapshot, alerts: this.alerts }
  }

  countsAt(hist, t) {
    // Oldest entry at or after time t.
    for (const h of hist) if (h.t >= t) return h
    return null
  }

  step(counts, t, wall = Date.now()) {
    const s = this.settings
    this.raw.push({ t, counts })
    while (this.raw.length && this.raw[0].t < t - HISTORY) this.raw.shift()

    // Smoothed counts over the last SMOOTH_WINDOW seconds.
    const recent = this.raw.filter((h) => h.t >= t - SMOOTH_WINDOW)
    const sm = Array(ZONE_COUNT).fill(0)
    for (const h of recent) h.counts.forEach((c, i) => (sm[i] += c / recent.length))
    this.smooth.push({ t, counts: sm })
    while (this.smooth.length && this.smooth[0].t < t - HISTORY) this.smooth.shift()

    const shown = sm.map((c) => Math.round(c))
    const levels = shown.map((c) => zoneLevel(c, s))

    // Surge: count rose by >= surgePct % AND >= surgeMin people within surgeWindow seconds.
    const haveWindow = this.smooth[0].t <= t - s.surgeWindow + 0.75
    const past = haveWindow ? this.countsAt(this.smooth, t - s.surgeWindow).counts : null
    // A zone that is already emptying out isn't "surging", even if it's above its level 20s ago.
    const ref3 = this.countsAt(this.smooth, t - 3)?.counts ?? sm
    const surges = Array(ZONE_COUNT).fill(false)
    const surgeInfo = Array(ZONE_COUNT).fill(null)
    if (past) {
      sm.forEach((cur, i) => {
        const inc = cur - past[i]
        const pct = (inc / Math.max(past[i], 1)) * 100
        const stillRising = cur >= ref3[i] - 0.25
        if (inc >= s.surgeMin && pct >= s.surgePct && stillRising) {
          surges[i] = true
          surgeInfo[i] = { from: Math.round(past[i]), to: Math.round(cur), pct: Math.round(pct) }
        }
      })
    }

    // Trend arrows: compare with ~5 seconds ago.
    const ref5 = this.countsAt(this.smooth, t - 5)?.counts ?? sm
    const trends = sm.map((cur, i) => {
      const d = cur - ref5[i]
      const tol = Math.max(0.8, cur * 0.08)
      return d > tol ? 1 : d < -tol ? -1 : 0
    })

    const calmestNeighbour = (i) =>
      neighbours(i).reduce((best, j) => (shown[j] < shown[best] ? j : best), neighbours(i)[0])

    // Zone level-up alerts (with hysteresis so borderline counts don't spam).
    levels.forEach((lvl, i) => {
      const z = zoneName(i)
      const c = shown[i]
      if (lvl > this.zoneAlertLevel[i] && lvl >= 1 && t - this.zoneLastAlertAt[i] >= ZONE_ALERT_COOLDOWN) {
        const th = thresholdFor(lvl, s)
        const msg =
          lvl === 1
            ? `Zone ${z} getting busy: ${c} people. Keep a steward watching this area.`
            : lvl === 2
              ? `Zone ${z} congested: ${c} people. Pause entry and divert flow towards ${zoneName(calmestNeighbour(i))}.`
              : `Zone ${z} at crush-risk density: ${c} people. Open exit gate ${gateFor(i)} and halt platform entry now.`
        this.pushAlert({
          time: wall,
          zone: z,
          severity: lvl,
          title: `${LEVELS[lvl].label} threshold`,
          message: msg,
          why: `Density rule: ${c} people in ${z} ≥ ${LEVELS[lvl].label} threshold of ${th}. Counts are averaged over ${SMOOTH_WINDOW}s to ignore flicker.`,
        })
        this.zoneAlertLevel[i] = lvl
        this.zoneLastAlertAt[i] = t
      } else if (lvl < this.zoneAlertLevel[i] && sm[i] < thresholdFor(this.zoneAlertLevel[i], s) * 0.85) {
        this.zoneAlertLevel[i] = lvl
      }
    })

    // Surge alerts.
    surges.forEach((on, i) => {
      if (!on || t - this.surgeLastAt[i] < SURGE_COOLDOWN) return
      const z = zoneName(i)
      const { from, to, pct } = surgeInfo[i]
      this.pushAlert({
        time: wall,
        zone: z,
        severity: Math.min(3, Math.max(1, levels[i] + 1)),
        title: 'Rapid build-up',
        message: `Zone ${z} density rising fast: up ${pct}% in ${s.surgeWindow}s. Consider opening exit gate ${gateFor(i)}.`,
        why: `Surge rule: ${z} went from ${from} to ${to} people (+${pct}%) in ${s.surgeWindow}s, above the trigger of +${s.surgePct}% and at least +${s.surgeMin} people. A surge bumps overall risk up one level.`,
      })
      this.surgeLastAt[i] = t
    })

    // Overall risk = worst zone, bumped one level if any zone is surging.
    const worst = Math.max(...levels)
    const worstIdx = levels.indexOf(worst)
    const anySurge = surges.some(Boolean)
    const computed = Math.min(3, worst + (anySurge ? 1 : 0))

    if (computed > this.overall) {
      this.overall = computed
      this.downSince = null
      if (computed === 3) {
        const top = shown.indexOf(Math.max(...shown))
        this.pushAlert({
          time: wall,
          zone: 'SITE',
          severity: 3,
          title: 'Site-wide CRITICAL',
          message: `Crush risk building around ${zoneName(top)}. Activate crowd-control protocol: open gate ${gateFor(top)}, stop announcements drawing people to the platform, dispatch officers.`,
          why: `Overall rule: worst zone is ${LEVELS[worst].label} (${zoneName(worstIdx)})${anySurge ? ' and a surge is active, which bumps it up one level' : ''} → CRITICAL.`,
        })
      }
    } else if (computed < this.overall) {
      if (this.downSince === null) this.downSince = t
      if (t - this.downSince >= DOWNGRADE_HOLD) {
        const prev = this.overall
        this.overall = computed
        this.downSince = null
        this.pushAlert({
          time: wall,
          zone: 'SITE',
          severity: computed,
          title: computed === 0 ? 'All clear' : 'Risk easing',
          message:
            computed === 0
              ? 'All zones back to safe density. Keep gates open until the platform fully clears.'
              : `Overall risk eased from ${LEVELS[prev].label} to ${LEVELS[computed].label}. Keep monitoring ${zoneName(worstIdx)}.`,
          why: `Overall rule: worst zone is now ${LEVELS[worst].label}${anySurge ? ' with a surge active' : ' and no surge is active'}. Downgrades wait ${DOWNGRADE_HOLD}s to avoid flip-flopping.`,
        })
      }
    } else {
      this.downSince = null
    }

    // Risk score: 75 = a zone exactly at the critical threshold; +10 for an active surge.
    const zoneScores = sm.map((c) => Math.min(100, (c / s.critical) * 75))
    const score = Math.round(Math.min(100, Math.max(...zoneScores) + (anySurge ? 10 : 0)))
    const people = shown.reduce((a, b) => a + b, 0)

    if (t - this.lastTimelineT >= 1) {
      this.timeline = [...this.timeline, { t, people, risk: score }].filter((p) => p.t >= t - TIMELINE)
      this.lastTimelineT = t
    }

    const top = shown.indexOf(Math.max(...shown))
    this.snapshot = {
      t,
      counts: shown,
      levels,
      trends,
      surges,
      overall: this.overall,
      score,
      people,
      topZone: { name: zoneName(top), count: shown[top], level: levels[top] },
      surgingZones: surges.map((on, i) => (on ? zoneName(i) : null)).filter(Boolean),
      alerts: this.alerts,
      timeline: this.timeline,
    }
    return this.snapshot
  }
}

export function emptySnapshot() {
  return {
    t: 0,
    counts: Array(ZONE_COUNT).fill(0),
    levels: Array(ZONE_COUNT).fill(0),
    trends: Array(ZONE_COUNT).fill(0),
    surges: Array(ZONE_COUNT).fill(false),
    overall: 0,
    score: 0,
    people: 0,
    topZone: { name: '-', count: 0, level: 0 },
    surgingZones: [],
    alerts: [],
    timeline: [],
  }
}
