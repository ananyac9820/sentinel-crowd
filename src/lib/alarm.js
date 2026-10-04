// Alarm tones made with the Web Audio API (no sound files needed).
// Browsers only allow audio after the user has interacted with the page, so the
// dashboard calls unlockAudio() on the first click or key press.

let ctx = null

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
  } catch {
    ctx = null
  }
}

const PATTERNS = {
  critical: [
    [880, 0],
    [660, 0.22],
    [880, 0.44],
    [660, 0.66],
  ],
  warning: [
    [740, 0],
    [740, 0.24],
  ],
}

export function playAlarm(kind = 'critical') {
  if (!ctx || ctx.state !== 'running') return false
  const now = ctx.currentTime
  for (const [freq, at] of PATTERNS[kind] ?? PATTERNS.critical) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, now + at)
    gain.gain.exponentialRampToValueAtTime(0.1, now + at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now + at)
    osc.stop(now + at + 0.2)
  }
  return true
}
