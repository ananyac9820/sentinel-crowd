// Scripted 90-second scenario: evening rush on Platform 2 of a busy junction.
// A delayed train is announced, the crowd funnels toward the staircase (zone B3),
// alerts escalate to CRITICAL, station control opens Gate 2 and the crowd disperses.

export const SIM_DURATION = 90
export const INTERVENTION_AT = 66

export const PHASES = [
  { t: 0, label: 'Normal evening flow' },
  { t: 18, label: 'Train delay announced — platform filling' },
  { t: 36, label: 'Crowd funnelling toward staircase (B3)' },
  { t: 52, label: 'Crush risk at staircase' },
  { t: INTERVENTION_AT, label: 'Intervention: Gate 2 opened, entry paused' },
  { t: 76, label: 'Crowd dispersing' },
  { t: 86, label: 'Back to normal' },
]

// Keyframes per zone, row-major A1..A4, B1..B4, C1..C4: [time, people].
const KEYS = [
  [[0, 2], [18, 3], [45, 6], [62, 7], [72, 6], [84, 3], [90, 2]], // A1
  [[0, 3], [18, 4], [45, 6], [62, 7], [72, 6], [84, 3], [90, 3]], // A2
  [[0, 3], [18, 4], [45, 6], [62, 7], [72, 6], [84, 4], [90, 3]], // A3
  [[0, 2], [18, 3], [45, 5], [62, 6], [72, 5], [84, 2], [90, 2]], // A4
  [[0, 3], [18, 4], [45, 6], [62, 7], [72, 6], [84, 3], [90, 3]], // B1
  [[0, 3], [18, 5], [40, 7], [52, 11], [62, 14], [70, 13], [80, 6], [90, 3]], // B2
  [[0, 4], [18, 5], [34, 7], [42, 11], [50, 16], [56, 20], [62, 24], [67, 24], [74, 17], [82, 7], [90, 4]], // B3
  [[0, 3], [18, 4], [45, 6], [62, 7], [72, 6], [84, 3], [90, 3]], // B4
  [[0, 2], [18, 3], [45, 5], [62, 6], [72, 5], [84, 2], [90, 2]], // C1
  [[0, 3], [18, 4], [45, 6], [62, 7], [72, 6], [84, 3], [90, 3]], // C2
  [[0, 3], [18, 4], [42, 7], [54, 11], [63, 14], [70, 13], [80, 5], [90, 3]], // C3
  [[0, 2], [18, 3], [45, 5], [62, 6], [72, 5], [84, 2], [90, 2]], // C4
]

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

export function simCounts(t) {
  const tt = Math.min(t, SIM_DURATION)
  return KEYS.map((keys, i) => {
    const jitter = 0.3 * Math.sin(t * 0.9 + i * 1.7) + 0.15 * Math.sin(t * 2.3 + i * 0.6)
    return Math.max(0, Math.round(interp(keys, tt) + jitter))
  })
}

export function phaseAt(t) {
  let p = PHASES[0]
  for (const ph of PHASES) if (t >= ph.t) p = ph
  return p
}
