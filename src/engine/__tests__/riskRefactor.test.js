// zoneLevel() in lib/risk.js was an if-chain over four risk bands and is now a binary search over
// the sorted threshold list. That is a refactor of existing, working behaviour, so the test that
// matters is that nothing changed: these assertions compare the new implementation against the
// original chain across every threshold boundary and a wide sweep of values.

import { describe, expect, it } from 'vitest'
import { zoneLevel, DEFAULT_SETTINGS } from '../../lib/risk.js'

// The implementation zoneLevel replaced, kept verbatim as the reference.
const original = (count, s) => {
  if (count >= s.critical) return 3
  if (count >= s.warning) return 2
  if (count >= s.watch) return 1
  return 0
}

describe('zoneLevel: binary search matches the original if-chain', () => {
  it.each([
    ['simulation', DEFAULT_SETTINGS.sim],
    ['live', DEFAULT_SETTINGS.live],
  ])('agrees on every value from 0 to 60 in %s mode', (_name, settings) => {
    for (let count = 0; count <= 60; count += 0.25) {
      expect(zoneLevel(count, settings)).toBe(original(count, settings))
    }
  })

  it('agrees exactly at and either side of every threshold', () => {
    const s = DEFAULT_SETTINGS.sim
    for (const threshold of [s.watch, s.warning, s.critical]) {
      for (const count of [threshold - 0.01, threshold, threshold + 0.01]) {
        expect(zoneLevel(count, s)).toBe(original(count, s))
      }
    }
  })

  it('agrees on custom thresholds an operator could set in Setup', () => {
    const custom = { watch: 3, warning: 4, critical: 5 }
    for (let count = 0; count <= 10; count += 0.5) expect(zoneLevel(count, custom)).toBe(original(count, custom))
  })

  it('handles the degenerate case where all three thresholds are equal', () => {
    const flat = { watch: 10, warning: 10, critical: 10 }
    expect(zoneLevel(9, flat)).toBe(0)
    expect(zoneLevel(10, flat)).toBe(3) // all three reached at once
    expect(zoneLevel(10, flat)).toBe(original(10, flat))
  })

  it('handles negative and zero counts', () => {
    const s = DEFAULT_SETTINGS.sim
    expect(zoneLevel(0, s)).toBe(0)
    expect(zoneLevel(-5, s)).toBe(0)
  })
})
