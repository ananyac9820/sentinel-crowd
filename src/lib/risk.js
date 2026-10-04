// Risk model for Sentinel Crowd.
// Kept deliberately simple and explainable:
//   1. density thresholds per zone
//   2. surge: a zone filling fast
//   3. forecast: seconds until a zone reaches CRITICAL at its current growth rate
//   4. turbulence: crowd pressure = density x variance of movement (Helbing et al., 2007)
//   5. counter-flow: movements in a zone cancelling each other out
// Overall risk = worst zone level, raised one level while any zone has a surge, turbulence or counter-flow.

import { DEFAULT_ZONES, GRID_CELLS } from './zones.js'

export const LEVELS = [
  { key: 'SAFE', label: 'SAFE', color: '#2f7a45' },
  { key: 'WATCH', label: 'WATCH', color: '#9a7410' },
  { key: 'WARNING', label: 'WARNING', color: '#b4561a' },
  { key: 'CRITICAL', label: 'CRITICAL', color: '#b02a22' },
]
export const INFO_COLOR = '#111111'

export const DEFAULT_SETTINGS = {
  // Simulation numbers are people per zone on a station platform.
  sim: { watch: 8, warning: 13, critical: 18, surgePct: 35, surgeWindow: 20, surgeMin: 4, turbulence: 60, counterFlow: 55 },
  // A general detector finds far fewer people per frame, so live defaults are lower.
  live: { watch: 3, warning: 5, critical: 8, surgePct: 50, surgeWindow: 20, surgeMin: 2, turbulence: 60, counterFlow: 55 },
}

export function zoneLevel(count, s) {
  if (count >= s.critical) return 3
  if (count >= s.warning) return 2
  if (count >= s.watch) return 1
  return 0
}

const thresholdFor = (level, s) => [0, s.watch, s.warning, s.critical][level]

const SMOOTH_WINDOW = 1.5 // seconds, averages out detector flicker
const HISTORY = 130 // seconds of history kept
const TIMELINE = 120 // seconds shown on the chart
const SURGE_COOLDOWN = 30
const ZONE_ALERT_COOLDOWN = 3
const DOWNGRADE_HOLD = 3 // overall level must stay lower this long before easing
const FORECAST_WINDOW = 10 // seconds of history used to estimate each zone's growth rate
const FORECAST_MIN_RATE = 0.15 // people per second; slower growth is treated as steady
const FORECAST_HORIZON = 60 // only show forecasts within this many seconds
const FORECAST_ALERT_AT = 25 // raise a forecast alert when CRITICAL is this close
const MOTION_COOLDOWN = 30
const MOTION_HOLD = 1.5 // turbulence / counter-flow must persist this long before alerting
const MOTION_EMA = 0.35
const REF_SPREAD = 0.05 // movement spread (frame heights per second) treated as fully chaotic

export class CrowdEngine {
  constructor(settings, zones = DEFAULT_ZONES) {
    this.settings = settings
    this.zones = zones
    this.reset()
  }

  setZones(zones) {
    this.zones = zones
    this.reset()
  }

  reset() {
    const n = this.zones.length
    this.raw = []
    this.smooth = []
    this.zoneAlertLevel = Array(n).fill(0)
    this.zoneLastAlertAt = Array(n).fill(-1e9)
    this.surgeLastAt = Array(n).fill(-1e9)
    this.forecastLastAt = Array(n).fill(-1e9)
    this.turbLastAt = Array(n).fill(-1e9)
    this.counterLastAt = Array(n).fill(-1e9)
    this.turbSince = Array(n).fill(null)
    this.counterSince = Array(n).fill(null)
    this.motionEma = Array(n).fill(null)
    this.firstWarningAt = Array(n).fill(null)
    this.reachedCritical = Array(n).fill(false)
    this.leadTimes = []
    this.overall = 0
    this.downSince = null
    this.alerts = []
    this.timeline = []
    this.lastTimelineT = -1e9
    this.lastT = null
    this.stats = { peakPeople: 0, peakScore: 0, levelSeconds: [0, 0, 0, 0], startWall: null, endWall: null }
    this.seq = 0
    this.snapshot = emptySnapshot(this.zones)
  }

  pushAlert(a) {
    this.alerts = [{ id: ++this.seq, ...a }, ...this.alerts].slice(0, 80)
  }

  addEvent(message, why, wall, title = 'Intervention') {
    this.pushAlert({ time: wall, zone: 'SITE', severity: -1, kind: 'action', title, message, why })
    this.snapshot = { ...this.snapshot, alerts: this.alerts }
  }

  countsAt(hist, t) {
    // Oldest entry at or after time t.
    for (const h of hist) if (h.t >= t) return h
    return null
  }

  markWarning(i, t) {
    if (this.firstWarningAt[i] === null && !this.reachedCritical[i]) this.firstWarningAt[i] = t
  }

  step(counts, t, wall = Date.now(), motion = null) {
    const s = this.settings
    const Z = this.zones
    const n = Z.length
    const name = (i) => Z[i].name
    if (this.stats.startWall === null) this.stats.startWall = wall
    this.stats.endWall = wall

    this.raw.push({ t, counts })
    while (this.raw.length && this.raw[0].t < t - HISTORY) this.raw.shift()

    // Smoothed counts over the last SMOOTH_WINDOW seconds.
    const recent = this.raw.filter((h) => h.t >= t - SMOOTH_WINDOW)
    const sm = Array(n).fill(0)
    for (const h of recent) h.counts.forEach((c, i) => (sm[i] += c / recent.length))
    this.smooth.push({ t, counts: sm })
    while (this.smooth.length && this.smooth[0].t < t - HISTORY) this.smooth.shift()

    const shown = sm.map((c) => Math.round(c))
    // Zones can differ in size, so levels use density: people per standard grid-cell area.
    const af = Z.map((z) => Math.max(0.15, z.w * z.h * GRID_CELLS))
    const levels = shown.map((c, i) => zoneLevel(Math.round(c / af[i]), s))

    // ---- Surge: count rose by >= surgePct % AND >= surgeMin people within surgeWindow seconds ----
    const haveWindow = this.smooth[0].t <= t - s.surgeWindow + 0.75
    const past = haveWindow ? this.countsAt(this.smooth, t - s.surgeWindow).counts : null
    // A zone that is already emptying out isn't "surging", even if it's above its level 20s ago.
    const ref3 = this.countsAt(this.smooth, t - 3)?.counts ?? sm
    const surges = Array(n).fill(false)
    const surgeInfo = Array(n).fill(null)
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

    // ---- Trend arrows: compare with ~5 seconds ago ----
    const ref5 = this.countsAt(this.smooth, t - 5)?.counts ?? sm
    const trends = sm.map((cur, i) => {
      const d = cur - ref5[i]
      const tol = Math.max(0.8, cur * 0.08)
      return d > tol ? 1 : d < -tol ? -1 : 0
    })

    // ---- Forecast: least-squares growth rate, projected to the CRITICAL threshold ----
    const win = this.smooth.filter((h) => h.t >= t - FORECAST_WINDOW)
    const haveForecastWindow = win.length >= 6 && win[0].t <= t - FORECAST_WINDOW * 0.8
    const rates = Array(n).fill(0)
    const forecast = sm.map((cur, i) => {
      if (!haveForecastWindow || cur >= s.critical * af[i] || levels[i] < 1) return null
      const m = win.length
      const mt = win.reduce((a, h) => a + h.t, 0) / m
      const mc = win.reduce((a, h) => a + h.counts[i], 0) / m
      let num = 0
      let den = 0
      for (const h of win) {
        num += (h.t - mt) * (h.counts[i] - mc)
        den += (h.t - mt) ** 2
      }
      const rate = den ? num / den : 0
      rates[i] = rate
      if (rate < FORECAST_MIN_RATE || !(cur >= ref3[i] - 0.25)) return null
      const eta = (s.critical * af[i] - cur) / rate
      return eta <= FORECAST_HORIZON ? Math.max(1, Math.round(eta)) : null
    })

    // ---- Motion: smoothed flow, turbulence (crowd pressure) and counter-flow ----
    const mo = Z.map((_, i) => {
      const m = motion?.[i]
      const prev = this.motionEma[i]
      if (!m) return (this.motionEma[i] = prev ? { ...prev, counter: prev.counter * (1 - MOTION_EMA) } : null)
      const next = prev
        ? {
            vx: prev.vx + (m.vx - prev.vx) * MOTION_EMA,
            vy: prev.vy + (m.vy - prev.vy) * MOTION_EMA,
            spread: prev.spread + (m.spread - prev.spread) * MOTION_EMA,
            counter: prev.counter + (m.counter - prev.counter) * MOTION_EMA,
          }
        : { ...m }
      return (this.motionEma[i] = next)
    })
    const turbulence = mo.map((m, i) => {
      if (!m || sm[i] < 3) return 0
      const pressure = (sm[i] / (s.critical * af[i])) * (m.spread / REF_SPREAD) ** 2
      return Math.round(Math.min(100, pressure * 100))
    })
    const counterIdx = mo.map((m, i) => (m && sm[i] >= 3 ? Math.round(m.counter * 100) : 0))
    const held = (since, on, i) => {
      if (!on) return (since[i] = null), false
      if (since[i] === null) since[i] = t
      return t - since[i] >= MOTION_HOLD
    }
    const turbulent = turbulence.map((v, i) => held(this.turbSince, v >= s.turbulence && levels[i] >= 1, i))
    const counterFlow = counterIdx.map((v, i) => held(this.counterSince, v >= s.counterFlow && levels[i] >= 1, i))

    const calmestNeighbour = (i) => {
      const nb = Z[i].neighbours?.length ? Z[i].neighbours : [...Array(n).keys()].filter((j) => j !== i)
      return nb.reduce((best, j) => (shown[j] < shown[best] ? j : best), nb[0])
    }

    // ---- Zone level-up alerts (with hysteresis so borderline counts don't spam) ----
    levels.forEach((lvl, i) => {
      const z = name(i)
      const c = shown[i]
      if (lvl > this.zoneAlertLevel[i] && lvl >= 1 && t - this.zoneLastAlertAt[i] >= ZONE_ALERT_COOLDOWN) {
        const th = Math.round(thresholdFor(lvl, s) * af[i])
        const msg =
          lvl === 1
            ? `Zone ${z} getting busy: ${c} people. Keep a steward watching this area.`
            : lvl === 2
              ? `Zone ${z} congested: ${c} people. Pause entry and divert flow towards ${name(calmestNeighbour(i))}.`
              : `Zone ${z} at crush-risk density: ${c} people. Open exit gate ${Z[i].gate} and halt platform entry now.`
        this.pushAlert({
          time: wall,
          zone: z,
          severity: lvl,
          kind: 'level',
          title: `${LEVELS[lvl].label} threshold`,
          message: msg,
          why: `Density rule: ${c} people in ${z} is at or above the ${LEVELS[lvl].label} threshold of ${th}. Counts are averaged over ${SMOOTH_WINDOW}s to ignore flicker.`,
        })
        this.zoneAlertLevel[i] = lvl
        this.zoneLastAlertAt[i] = t
      } else if (lvl < this.zoneAlertLevel[i] && sm[i] < thresholdFor(this.zoneAlertLevel[i], s) * af[i] * 0.85) {
        this.zoneAlertLevel[i] = lvl
      }
    })

    // ---- Surge alerts ----
    surges.forEach((on, i) => {
      if (!on || t - this.surgeLastAt[i] < SURGE_COOLDOWN) return
      const z = name(i)
      const { from, to, pct } = surgeInfo[i]
      this.markWarning(i, t)
      this.pushAlert({
        time: wall,
        zone: z,
        severity: Math.min(3, Math.max(1, levels[i] + 1)),
        kind: 'surge',
        title: 'Rapid build-up',
        message: `Zone ${z} density rising fast: up ${pct}% in ${s.surgeWindow}s. Consider opening exit gate ${Z[i].gate}.`,
        why: `Surge rule: ${z} went from ${from} to ${to} people (+${pct}%) in ${s.surgeWindow}s, above the trigger of +${s.surgePct}% and at least +${s.surgeMin} people. A surge raises overall risk by one level.`,
      })
      this.surgeLastAt[i] = t
    })

    // ---- Forecast alerts ----
    forecast.forEach((eta, i) => {
      if (eta === null || eta > FORECAST_ALERT_AT || levels[i] < 1 || t - this.forecastLastAt[i] < SURGE_COOLDOWN) return
      const z = name(i)
      const from = Math.round(win[0].counts[i])
      this.markWarning(i, t)
      this.pushAlert({
        time: wall,
        zone: z,
        severity: Math.min(3, levels[i] + 1),
        kind: 'forecast',
        title: 'Forecast',
        message: `Zone ${z} on course to reach crush density in about ${eta}s. Prepare to open exit gate ${Z[i].gate} and slow entry now.`,
        why: `Forecast rule: ${z} grew from ${from} to ${shown[i]} people over the last ${FORECAST_WINDOW}s (about +${rates[i].toFixed(1)} people per second). At that rate it crosses the CRITICAL threshold of ${Math.round(s.critical * af[i])} in about ${eta}s. Forecast alerts fire when the projection is under ${FORECAST_ALERT_AT}s.`,
      })
      this.forecastLastAt[i] = t
    })

    // ---- Turbulence alerts ----
    turbulent.forEach((on, i) => {
      if (!on || t - this.turbLastAt[i] < MOTION_COOLDOWN) return
      const z = name(i)
      const pctOfCritical = Math.round((sm[i] / (s.critical * af[i])) * 100)
      this.markWarning(i, t)
      this.pushAlert({
        time: wall,
        zone: z,
        severity: Math.min(3, Math.max(2, levels[i] + 1)),
        kind: 'turbulence',
        title: 'Crowd turbulence',
        message: `Zone ${z} crowd turbulence ${turbulence[i]}/100: people are being pushed in different directions. This often comes just before a crush. Stop entry and open exit gate ${Z[i].gate}.`,
        why: `Turbulence rule: crowd pressure is density multiplied by how unevenly people are moving (Helbing et al., 2007). ${z} is at ${pctOfCritical}% of the CRITICAL count and its movement spread is ${mo[i].spread.toFixed(3)} frame heights per second, giving ${turbulence[i]}/100, above the trigger of ${s.turbulence}.`,
      })
      this.turbLastAt[i] = t
    })

    // ---- Counter-flow alerts ----
    counterFlow.forEach((on, i) => {
      if (!on || t - this.counterLastAt[i] < MOTION_COOLDOWN) return
      const z = name(i)
      this.markWarning(i, t)
      this.pushAlert({
        time: wall,
        zone: z,
        severity: Math.min(3, Math.max(2, levels[i] + 1)),
        kind: 'counter',
        title: 'Counter-flow',
        message: `Counter-flow in zone ${z}: people are moving in opposite directions. Make movement one-way here and hold one direction until it clears.`,
        why: `Counter-flow rule: when movements in a zone cancel each other out, the counter-flow index rises toward 100. ${z} is at ${counterIdx[i]}, above the trigger of ${s.counterFlow}. Opposing flows at stairs and gates are a common trigger of crushes.`,
      })
      this.counterLastAt[i] = t
    })

    // ---- Lead time: how long before a zone hit CRITICAL did the first early warning fire ----
    levels.forEach((lvl, i) => {
      if (lvl === 3 && !this.reachedCritical[i]) {
        this.reachedCritical[i] = true
        if (this.firstWarningAt[i] !== null) {
          this.leadTimes = [...this.leadTimes, { zone: name(i), lead: Math.round(t - this.firstWarningAt[i]), wall }]
        }
      } else if (lvl === 0 && sm[i] < s.watch * af[i] * 0.7) {
        this.reachedCritical[i] = false
        this.firstWarningAt[i] = null
      }
    })

    // ---- Overall risk ----
    const worst = Math.max(...levels)
    const worstIdx = levels.indexOf(worst)
    const anySurge = surges.some(Boolean)
    const anyMotion = turbulent.some(Boolean) || counterFlow.some(Boolean)
    const bump = anySurge || anyMotion
    const computed = Math.min(3, worst + (bump ? 1 : 0))
    const bumpReason = [anySurge && 'a surge', turbulent.some(Boolean) && 'turbulence', counterFlow.some(Boolean) && 'counter-flow']
      .filter(Boolean)
      .join(' and ')

    if (computed > this.overall) {
      this.overall = computed
      this.downSince = null
      if (computed === 3) {
        const top = shown.indexOf(Math.max(...shown))
        this.pushAlert({
          time: wall,
          zone: 'SITE',
          severity: 3,
          kind: 'site',
          title: 'Site-wide CRITICAL',
          message: `Crush risk building around ${name(top)}. Activate crowd-control protocol: open gate ${Z[top].gate}, stop announcements drawing people to the platform, dispatch officers.`,
          why: `Overall rule: worst zone is ${LEVELS[worst].label} (${name(worstIdx)})${bump ? `, and ${bumpReason} raises it by one level` : ''}, giving CRITICAL.`,
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
          kind: 'site',
          title: computed === 0 ? 'All clear' : 'Risk easing',
          message:
            computed === 0
              ? 'All zones back to safe density. Keep gates open until the platform fully clears.'
              : `Overall risk eased from ${LEVELS[prev].label} to ${LEVELS[computed].label}. Keep monitoring ${name(worstIdx)}.`,
          why: `Overall rule: worst zone is now ${LEVELS[worst].label}${bump ? ` with ${bumpReason} active` : ' and no surge, turbulence or counter-flow is active'}. Downgrades wait ${DOWNGRADE_HOLD}s to avoid flip-flopping.`,
        })
      }
    } else {
      this.downSince = null
    }

    // Risk score: 75 = a zone exactly at the critical threshold; +10 while a surge, turbulence or counter-flow is active.
    const zoneScores = sm.map((c, i) => Math.min(100, (c / (s.critical * af[i])) * 75))
    const score = Math.round(Math.min(100, Math.max(...zoneScores) + (bump ? 10 : 0)))
    const people = shown.reduce((a, b) => a + b, 0)
    const maxTurb = Math.max(...turbulence)

    if (this.lastT !== null) this.stats.levelSeconds[this.overall] += Math.max(0, t - this.lastT)
    this.lastT = t
    this.stats.peakPeople = Math.max(this.stats.peakPeople, people)
    this.stats.peakScore = Math.max(this.stats.peakScore, score)

    if (t - this.lastTimelineT >= 1) {
      this.timeline = [...this.timeline, { t, wall, people, risk: score, turb: maxTurb, level: this.overall }].filter((p) => p.t >= t - TIMELINE)
      this.lastTimelineT = t
    }

    const top = shown.indexOf(Math.max(...shown))
    const soonestIdx = forecast.reduce((best, eta, i) => (eta !== null && (best < 0 || eta < forecast[best]) ? i : best), -1)
    this.snapshot = {
      t,
      zones: Z,
      counts: shown,
      levels,
      trends,
      surges,
      forecast,
      soonest: soonestIdx < 0 ? null : { name: name(soonestIdx), eta: forecast[soonestIdx] },
      motion: mo.map((m) => (m ? { vx: m.vx, vy: m.vy } : null)),
      turbulence,
      counterIdx,
      turbulent,
      counterFlow,
      overall: this.overall,
      score,
      people,
      maxTurb,
      topZone: { name: name(top), count: shown[top], level: levels[top] },
      surgingZones: surges.map((on, i) => (on ? name(i) : null)).filter(Boolean),
      flaggedMotion: Z.map((_, i) => (turbulent[i] || counterFlow[i] ? name(i) : null)).filter(Boolean),
      alerts: this.alerts,
      timeline: this.timeline,
      leadTimes: this.leadTimes,
      stats: { ...this.stats, levelSeconds: [...this.stats.levelSeconds] },
    }
    return this.snapshot
  }
}

export function emptySnapshot(zones = DEFAULT_ZONES) {
  const n = zones.length
  return {
    t: 0,
    zones,
    counts: Array(n).fill(0),
    levels: Array(n).fill(0),
    trends: Array(n).fill(0),
    surges: Array(n).fill(false),
    forecast: Array(n).fill(null),
    soonest: null,
    motion: Array(n).fill(null),
    turbulence: Array(n).fill(0),
    counterIdx: Array(n).fill(0),
    turbulent: Array(n).fill(false),
    counterFlow: Array(n).fill(false),
    overall: 0,
    score: 0,
    people: 0,
    maxTurb: 0,
    topZone: { name: '-', count: 0, level: 0 },
    surgingZones: [],
    flaggedMotion: [],
    alerts: [],
    timeline: [],
    leadTimes: [],
    stats: { peakPeople: 0, peakScore: 0, levelSeconds: [0, 0, 0, 0], startWall: null, endWall: null },
  }
}
