// Divide and conquer over the camera's field of view: a quadtree summary of the crowd.
//
// THE PROBLEM: "which part of the site is worst?" answered per zone is misleading. Three
// adjacent zones each at 70% of the critical density are more dangerous than one zone at 95%
// with calm neighbours, because the people in them have nowhere to spread into. A per-zone
// maximum cannot see that; a summary over regions can.
//
// DIVIDE  : split the current rectangle into four quadrants (NW, NE, SW, SE).
// CONQUER : recurse until a rectangle holds one zone or the depth limit is reached; at that
//           base case summarise the zones whose centres fall inside it.
// COMBINE : add the children's people, take the worst level and turbulence, and -- the step
//           that actually earns the recursion -- compute the region's own density, which is
//           its people divided by its own area. A region can be over the safe density even
//           when no single child zone is, and that is detected only in the combine step.
//
// Recurrence: T(n) = 4T(n/4) + O(1) over the zones in each rectangle, so T(n) = O(n) work per
// level and O(n log n) overall for a balanced split (depth O(log n)). Bounded by MAX_DEPTH, so
// in Sentinel it is O(n) per frame with a small constant.
// Space: O(n) for the tree, O(log n) recursion depth.
//
// The engine uses `hottestRegion` to pick which part of the site the algorithms should focus
// on, so this is not a decorative tree -- it chooses the Dijkstra source.

const MAX_DEPTH = 3 // 4^3 = 64 leaf rectangles is far more than the zone counts in use

/**
 * @param {Array} zones   zone objects with x, y, w, h in 0..1 camera coordinates
 * @param {Array} counts  people per zone, same order
 * @param {object} metrics { levels, turbulence, critical } critical = people per unit area at CRITICAL
 */
export function partitionSite(zones, counts, { levels = [], turbulence = [], criticalDensity = 1 } = {}) {
  const stats = { regions: 0, leaves: 0, maxDepth: 0, combines: 0 }
  const items = zones.map((z, i) => ({
    index: i,
    id: z.id,
    name: z.name,
    cx: z.x + z.w / 2,
    cy: z.y + z.h / 2,
    area: Math.max(1e-6, z.w * z.h),
    people: counts[i] ?? 0,
    level: levels[i] ?? 0,
    turbulence: turbulence[i] ?? 0,
  }))
  const root = build({ x: 0, y: 0, w: 1, h: 1 }, items, 0, stats, criticalDensity)
  return { root, stats, criticalDensity }
}

function build(rect, items, depth, stats, criticalDensity) {
  stats.regions++
  stats.maxDepth = Math.max(stats.maxDepth, depth)

  // ---- Base case: one zone (or none), or the depth limit ----
  if (items.length <= 1 || depth >= MAX_DEPTH) {
    stats.leaves++
    return summarise(rect, items, [], depth, criticalDensity)
  }

  // ---- DIVIDE: four quadrants of this rectangle ----
  const hw = rect.w / 2
  const hh = rect.h / 2
  const quadrants = [
    { x: rect.x, y: rect.y, w: hw, h: hh, name: 'NW' },
    { x: rect.x + hw, y: rect.y, w: hw, h: hh, name: 'NE' },
    { x: rect.x, y: rect.y + hh, w: hw, h: hh, name: 'SW' },
    { x: rect.x + hw, y: rect.y + hh, w: hw, h: hh, name: 'SE' },
  ]
  const buckets = quadrants.map(() => [])
  for (const it of items) {
    // Each zone is assigned by its centre, so it lands in exactly one quadrant and no person
    // is counted twice when the children are combined.
    const qi = (it.cx >= rect.x + hw ? 1 : 0) + (it.cy >= rect.y + hh ? 2 : 0)
    buckets[qi].push(it)
  }
  // A split that puts everything back in one quadrant makes no progress: stop instead of
  // recursing forever on the same set.
  if (buckets.some((b) => b.length === items.length)) {
    stats.leaves++
    return summarise(rect, items, [], depth, criticalDensity)
  }

  // ---- CONQUER: solve each quadrant independently ----
  const children = quadrants
    .map((q, i) => (buckets[i].length ? build(q, buckets[i], depth + 1, stats, criticalDensity) : null))
    .filter(Boolean)

  // ---- COMBINE ----
  stats.combines++
  return summarise(rect, items, children, depth, criticalDensity)
}

function summarise(rect, items, children, depth, criticalDensity) {
  const people = children.length ? children.reduce((a, c) => a + c.people, 0) : items.reduce((a, it) => a + it.people, 0)
  const area = items.reduce((a, it) => a + it.area, 0) || Math.max(1e-6, rect.w * rect.h)
  // Density of the REGION, not of its busiest zone: this is what the combine step adds.
  const density = people / area
  const load = criticalDensity > 0 ? density / criticalDensity : 0
  const worstLevel = children.length ? Math.max(0, ...children.map((c) => c.worstLevel)) : Math.max(0, ...items.map((it) => it.level), 0)
  const maxTurbulence = children.length ? Math.max(0, ...children.map((c) => c.maxTurbulence)) : Math.max(0, ...items.map((it) => it.turbulence), 0)
  const busiest = items.reduce((best, it) => (best === null || it.people > best.people ? it : best), null)
  return {
    rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
    depth,
    zones: items.map((it) => it.index),
    zoneNames: items.map((it) => it.name),
    children,
    people,
    area,
    density,
    load, // 1.0 = the region as a whole is at the CRITICAL density
    worstLevel,
    maxTurbulence,
    busiest: busiest ? { index: busiest.index, name: busiest.name, people: busiest.people } : null,
    // Pressure combines how full the region is with how disturbed its movement is, so a busy
    // AND turbulent region outranks a busy calm one.
    pressure: load * (1 + maxTurbulence / 100),
  }
}

/** Depth-first walk of the tree. */
export function walkRegions(node, visit, depth = 0) {
  if (!node) return
  visit(node, depth)
  for (const c of node.children) walkRegions(c, visit, depth + 1)
}

/**
 * The region under the most pressure, among regions holding at least `minZones` zones.
 * Leaves are excluded by default so the answer is a REGION, not just the busiest zone --
 * that is the whole reason for building the tree.
 */
export function hottestRegion(root, { minZones = 2 } = {}) {
  let best = null
  walkRegions(root, (node) => {
    if (node.zones.length < minZones) return
    if (best === null || node.pressure > best.pressure) best = node
  })
  return best ?? root
}

/** Flat list of regions at one depth, for drawing the partition. */
export function regionsAtDepth(root, depth) {
  const out = []
  walkRegions(root, (node) => {
    if (node.depth === depth) out.push(node)
  })
  return out
}

export default partitionSite
