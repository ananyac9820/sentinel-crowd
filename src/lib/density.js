// Density-map helpers for the crowd-counting model (DM-Count).
// A density map is a small grid (here 1/8 of the model input in each direction) where each cell holds
// "how many people are in this patch". Summing the whole map gives the head count; summing the cells
// inside a zone gives that zone's count. Unlike a person detector, this keeps working when people
// overlap, because it never has to draw a separate box around each one.

// ImageNet normalisation the model was trained with.
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

/** RGBA pixels (from a canvas) -> Float32Array in CHW order, normalised for the model. */
export function toModelInput(rgba, width, height) {
  const plane = width * height
  const out = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    out[i] = (rgba[i * 4] / 255 - MEAN[0]) / STD[0]
    out[plane + i] = (rgba[i * 4 + 1] / 255 - MEAN[1]) / STD[1]
    out[2 * plane + i] = (rgba[i * 4 + 2] / 255 - MEAN[2]) / STD[2]
  }
  return out
}

export function totalCount(density) {
  let sum = 0
  for (let i = 0; i < density.length; i++) sum += density[i]
  return sum
}

/**
 * Sum the density inside each zone. Zones are rectangles in normalised frame coordinates (0..1).
 * A cell belongs to the zone that contains its centre, the same rule Live mode uses for detected people.
 * `mirrored` flips x, for a front camera shown like a mirror.
 */
export function zoneCountsFromDensity(density, w, h, zones, { mirrored = false } = {}) {
  const counts = zones.map(() => 0)
  for (let r = 0; r < h; r++) {
    const y = (r + 0.5) / h
    for (let c = 0; c < w; c++) {
      const v = density[r * w + c]
      if (!v) continue
      const x0 = (c + 0.5) / w
      const x = mirrored ? 1 - x0 : x0
      const k = zones.findIndex((z) => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h)
      if (k >= 0) counts[k] += v
    }
  }
  return counts
}

// Heatmap colour for a density cell: transparent where empty, yellow -> red as the cell fills.
// `max` is the value drawn fully red (the caller passes the frame's peak, so the scale adapts).
export function heatColor(v, max) {
  const t = Math.min(1, v / max)
  if (t < 0.12) return [0, 0, 0, 0]
  return [255, Math.round(210 * (1 - t)), 30, Math.round(35 + 125 * t)]
}

// Peak of the map, ignoring the top 1% so one hot cell does not wash out the rest.
export function robustPeak(density) {
  const sorted = Float32Array.from(density).sort()
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] || 0
}
