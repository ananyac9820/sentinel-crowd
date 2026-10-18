import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toModelInput, totalCount, zoneCountsFromDensity } from '../src/lib/density.js'
import { DEFAULT_ZONES } from '../src/lib/zones.js'

test('toModelInput normalises RGBA into CHW planes', () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]) // 2x1: red, green
  const x = toModelInput(rgba, 2, 1)
  assert.equal(x.length, 6)
  assert.ok(Math.abs(x[0] - (1 - 0.485) / 0.229) < 1e-6) // R of pixel 0
  assert.ok(Math.abs(x[1] - (0 - 0.485) / 0.229) < 1e-6) // R of pixel 1
  assert.ok(Math.abs(x[3] - (1 - 0.456) / 0.224) < 1e-6) // G of pixel 1
})

test('zone counts add up to the total and land in the right zone', () => {
  const w = 8
  const h = 6
  const d = new Float32Array(w * h)
  d[0] = 2.5 // top-left cell -> A1
  d[w * h - 1] = 1.5 // bottom-right cell -> C4
  d[3 * w + 5] = 4 // row 3, col 5 -> B3 (x = 0.6875, y = 0.583)
  const counts = zoneCountsFromDensity(d, w, h, DEFAULT_ZONES)
  const byId = Object.fromEntries(DEFAULT_ZONES.map((z, i) => [z.id, counts[i]]))
  assert.equal(byId.A1, 2.5)
  assert.equal(byId.C4, 1.5)
  assert.equal(byId.B3, 4)
  assert.ok(Math.abs(counts.reduce((a, b) => a + b, 0) - totalCount(d)) < 1e-9)
})

test('mirroring moves density to the opposite side', () => {
  const d = new Float32Array(8 * 6)
  d[0] = 3 // top-left
  const counts = zoneCountsFromDensity(d, 8, 6, DEFAULT_ZONES, { mirrored: true })
  assert.equal(counts[DEFAULT_ZONES.findIndex((z) => z.id === 'A4')], 3)
})

test('empty map and no zones', () => {
  assert.deepEqual(zoneCountsFromDensity(new Float32Array(4), 2, 2, DEFAULT_ZONES), DEFAULT_ZONES.map(() => 0))
  assert.deepEqual(zoneCountsFromDensity(new Float32Array(4).fill(1), 2, 2, []), [])
})
