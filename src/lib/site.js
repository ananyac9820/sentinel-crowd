// Site configuration: what physically exists around a camera (exits and entries) and what kind of
// place it is. The vision model only finds WHERE risk is building; the recommended action comes
// from this configuration. With no configuration, advice is generic and never names a gate.

export const SITE_TYPES = {
  generic: { label: 'Not configured', place: 'area' },
  station: { label: 'Railway station', place: 'platform' },
  stadium: { label: 'Stadium', place: 'stand' },
  mall: { label: 'Mall', place: 'floor' },
  airport: { label: 'Airport', place: 'terminal' },
  event: { label: 'Public event or road', place: 'route' },
}

let seq = 1
const pt = (kind, name, x, y) => ({ id: `P${seq++}`, kind, name, x, y })

// Ready-made profiles. Point positions are in camera coordinates (0..1).
export const PROFILES = {
  generic: { type: 'generic', name: 'Uploaded video', points: [] },
  station: {
    type: 'station',
    name: 'Central Junction, Platform 2',
    points: [
      pt('exit', 'Gate 1', 0.15, 0.97),
      pt('exit', 'Gate 2', 0.42, 0.97),
      pt('exit', 'Gate 3', 0.85, 0.97),
      pt('entry', 'Footbridge stairs', 0.62, 0.9),
    ],
  },
  stadium: {
    type: 'stadium',
    name: 'Stadium east entrance',
    points: [pt('entry', 'Turnstiles', 0.5, 0.04), pt('exit', 'Gate A', 0.04, 0.55), pt('exit', 'Gate B', 0.96, 0.55), pt('exit', 'Gate C', 0.5, 0.96)],
  },
  mall: {
    type: 'mall',
    name: 'Mall main entrance',
    points: [pt('entry', 'Main doors', 0.5, 0.96), pt('exit', 'Side exit', 0.04, 0.5), pt('exit', 'Emergency stairs', 0.96, 0.3)],
  },
  airport: {
    type: 'airport',
    name: 'Terminal 1 security',
    points: [pt('entry', 'Check-in hall', 0.5, 0.96), pt('exit', 'Security lane 5', 0.1, 0.05), pt('exit', 'Security lane 6', 0.9, 0.05)],
  },
  event: {
    type: 'event',
    name: 'Victory parade route',
    points: [pt('entry', 'Main road', 0.5, 0.04), pt('exit', 'Road B dispersal route', 0.04, 0.6), pt('exit', 'Road C dispersal route', 0.96, 0.6)],
  },
}

export const cloneProfile = (key) => ({ ...PROFILES[key], points: PROFILES[key].points.map((p) => ({ ...p, id: `P${seq++}` })) })
export const newPointId = () => `P${seq++}`

export const isConfigured = (site) => site && site.type !== 'generic' && site.points.some((p) => p.kind === 'exit' || p.kind === 'entry')

// Nearest configured exit and entry to a zone's centre.
export function zoneLinks(zone, site) {
  const cx = zone.x + zone.w / 2
  const cy = zone.y + zone.h / 2
  const nearest = (kind) =>
    (site?.points ?? [])
      .filter((p) => p.kind === kind)
      .reduce((best, p) => {
        const d = Math.hypot(p.x - cx, p.y - cy)
        return !best || d < best.d ? { name: p.name, d } : best
      }, null)?.name ?? null
  return { exit: nearest('exit'), entry: nearest('entry') }
}

// Plain-language advice. `z` zone name, `calm` least crowded neighbouring zone.
export function advise(site, kind, { z, c, calm, links, level }) {
  const configured = isConfigured(site)
  const exit = configured && links.exit
  const entry = configured && links.entry
  const stopIn = entry ? `stop inflow from ${entry}` : `stop inflow into ${z}`
  const slowIn = entry ? `slow inflow from ${entry}` : `slow inflow into ${z}`
  const openOut = exit ? `open ${exit}` : 'open any alternative exit route'
  const station = site?.type === 'station'

  switch (kind) {
    case 'watch':
      return `Zone ${z} getting busy: ${c} people. Keep a steward watching this area.`
    case 'warning':
      return `Zone ${z} congested: ${c} people. ${cap(slowIn)} and move people towards ${calm}${configured ? '' : ', the least crowded neighbouring area'}.`
    case 'critical':
      return `Zone ${z} at crush-risk density: ${c} people. ${cap(stopIn)} and ${openOut} now.`
    case 'surge':
      return exit ? `Consider opening ${exit}.` : `Prepare to restrict inflow into ${z}.`
    case 'forecast':
      return exit ? `Prepare to ${openOut} and ${slowIn} now.` : `Prepare to restrict inflow into ${z} now.`
    case 'turbulence':
      return `${cap(stopIn)} and ${openOut}.`
    case 'counter':
      return `Make movement one-way here and hold one direction until it clears.`
    case 'site':
      return `Crush risk building around ${z}. Activate crowd-control protocol: ${stopIn}, ${openOut}, ${station ? 'stop announcements drawing people to the platform, ' : ''}dispatch staff.`
    default:
      return ''
  }
}

// Added to the "why" of every alert that recommends an action.
export const adviceSource = (site) =>
  isConfigured(site)
    ? ` Named exits and entries come from this site's configuration (${site.name}).`
    : ' No site is configured, so the advice uses only what the camera sees and names no gates.'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
