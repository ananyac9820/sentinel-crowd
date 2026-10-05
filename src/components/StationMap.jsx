import { LEVELS } from '../lib/risk.js'
import { STATION_CAMERAS, INTERVENTIONS } from '../lib/simulation.js'

// Schematic station plan. Each camera's area is coloured by that camera's own risk level.
// Dashed arrows show where an action sends people, so staff can see risk moving, not just falling.
const AREAS = {
  'CAM-01': { x: 20, y: 30, w: 230, h: 120, label: 'Main concourse', entry: true },
  'CAM-02': { x: 280, y: 52, w: 500, h: 46, label: 'Footbridge' },
  'CAM-03': { x: 280, y: 150, w: 420, h: 74, label: 'Platform 2' },
  'CAM-04': { x: 280, y: 286, w: 500, h: 74, label: 'Platform 3' },
}
const TRACKS = [128, 136, 246, 254, 264, 272, 382, 390]
const STAIRS = [
  { x: 560, y: 98, w: 40, h: 52 }, // footbridge to platform 2 (the B3 staircase)
  { x: 725, y: 98, w: 30, h: 188 }, // footbridge to platform 3, beside platform 2
  { x: 250, y: 64, w: 30, h: 22 }, // concourse to footbridge
]

const FLOWS = {
  gate2: { d: 'M 600 190 C 610 140, 640 110, 660 75', label: 'Out through gate 2 to the footbridge' },
  pauseEntry: { d: 'M 135 150 L 135 185', label: 'Held at concourse', stop: true },
  redirect: { d: 'M 520 170 C 540 120, 620 75, 700 80 L 740 82 L 740 290', label: 'To Platform 3' },
}

export default function StationMap({ mode, mainSnap, sideSnaps, plan, t, onOpenMonitor }) {
  const cams = STATION_CAMERAS.map((c) => {
    const snap = c.main ? mainSnap : mode === 'sim' ? sideSnaps[c.id] : null
    return { ...c, snap }
  })
  const active = mode === 'sim' ? plan.filter((iv) => t >= iv.at) : []
  const worst = cams.reduce((w, c) => (c.snap && c.snap.overall > w.level ? { level: c.snap.overall, cam: c } : w), { level: 0, cam: null })

  return (
    <div className="grid gap-3 [&>*]:min-w-0 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="panel flex flex-col lg:min-h-0">
        <div className="panel-head">
          <span className="label">Station map</span>
          <span className="text-[12px] text-muted">Central Junction, 4 cameras</span>
          <span className="ml-auto text-[11px] text-dim">Select an area for details. Platform 2 opens the live view.</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-3 lg:min-h-0">
          <svg viewBox="0 0 800 400" className="h-full max-h-full w-full" role="img" aria-label="Station plan coloured by risk level">
            <defs>
              <marker id="flowhead" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 L8 4 L0 8 z" fill="#111111" />
              </marker>
            </defs>
            {TRACKS.map((y) => (
              <line key={y} x1="270" x2="790" y1={y} y2={y} stroke="#9c9a93" strokeWidth="1.2" />
            ))}
            {cams.map((c) => {
              const a = AREAS[c.id]
              const lvl = c.snap ? LEVELS[c.snap.overall] : null
              const fill = !lvl ? '#e7e6e0' : c.snap.overall ? `${lvl.color}38` : '#f6f5f1'
              const clickable = c.main
              return (
                <g key={c.id} onClick={clickable ? onOpenMonitor : undefined} style={{ cursor: clickable ? 'pointer' : 'default' }}>
                  <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={fill} stroke={lvl && c.snap.overall ? lvl.color : '#111111'} strokeWidth={lvl && c.snap.overall >= 2 ? 3 : 1.5} />
                  <text x={a.x + 10} y={a.y + 20} className="num" fontSize="13" fontWeight="700" fill="#111111">
                    {a.label}
                  </text>
                  <text x={a.x + 10} y={a.y + 37} fontSize="11" fill="#3d3c38" fontFamily="IBM Plex Mono">
                    {mode === 'live' && !c.main ? 'No feed in Live mode' : `${c.id}${mode === 'live' ? ' (your camera)' : ''}`}
                  </text>
                  {c.snap && (
                    <>
                      <text x={a.x + a.w - 10} y={a.y + 22} textAnchor="end" fontSize="15" fontWeight="700" fill={lvl.color} fontFamily="IBM Plex Mono">
                        {lvl.label}
                      </text>
                      <text x={a.x + a.w - 10} y={a.y + 39} textAnchor="end" fontSize="12" fill="#111111" fontFamily="IBM Plex Mono">
                        {c.snap.people} people
                      </text>
                    </>
                  )}
                  {a.entry && (
                    <text x={a.x + 10} y={a.y + a.h - 10} fontSize="11" fill="#3d3c38">
                      Street entrance
                    </text>
                  )}
                  <rect x={a.x + 4} y={a.y + 4} width="5" height="5" fill="#b02a22" />
                </g>
              )
            })}
            {STAIRS.map((s, i) => (
              <g key={i}>
                <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="#dedcd5" stroke="#6b6963" strokeWidth="1" />
                {Array.from({ length: Math.floor(s.h / 8) }, (_, k) => (
                  <line key={k} x1={s.x} x2={s.x + s.w} y1={s.y + 4 + k * 8} y2={s.y + 4 + k * 8} stroke="#a5a39c" strokeWidth="0.8" />
                ))}
              </g>
            ))}
            <text x="563" y="145" fontSize="10" fill="#3d3c38" fontFamily="IBM Plex Mono">
              B3 stairs
            </text>
            {active.map((iv) => {
              const f = FLOWS[iv.type]
              return (
                <g key={iv.type}>
                  <path d={f.d} fill="none" stroke="#111111" strokeWidth="2.5" strokeDasharray="7 5" markerEnd={f.stop ? undefined : 'url(#flowhead)'} />
                  {f.stop && <line x1="115" x2="155" y1="186" y2="186" stroke="#b02a22" strokeWidth="4" />}
                </g>
              )
            })}
          </svg>
        </div>
      </section>

      <aside className="panel flex flex-col lg:min-h-0">
        <div className="panel-head">
          <span className="label">Cameras</span>
          {worst.cam && worst.level > 0 && (
            <span className="ml-auto text-[11px] font-bold" style={{ color: LEVELS[worst.level].color }}>
              Highest: {worst.cam.short}
            </span>
          )}
        </div>
        <ul className="scroll-thin flex-1 divide-y divide-line overflow-y-auto">
          {cams.map((c) => {
            const lvl = c.snap ? LEVELS[c.snap.overall] : null
            const latest = c.snap?.alerts?.find((a) => a.kind !== 'action')
            return (
              <li key={c.id} className="px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="num text-[12px] text-dim">{c.id}</span>
                  <span className="font-bold">{c.name}</span>
                  <span className="num ml-auto text-[13px] font-bold" style={{ color: lvl?.color ?? '#6b6963' }}>
                    {lvl ? lvl.label : 'NO FEED'}
                  </span>
                </div>
                {c.snap ? (
                  <p className="num mt-0.5 text-[12px] text-muted">
                    {c.snap.people} people, risk score {c.snap.score}{c.main ? `, busiest ${c.snap.topZone.name} ${c.snap.topZone.count}` : ''}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[12px] text-dim">Connect more cameras to see this area in Live mode.</p>
                )}
                {latest && <p className="mt-0.5 truncate text-[12px] text-fg" title={latest.message}>{latest.message}</p>}
                {c.main && (
                  <button className="btn mt-1.5" onClick={onOpenMonitor}>
                    Open live view
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {active.length > 0 && (
          <div className="border-t border-line px-3 py-2 text-[12px]">
            <p className="label mb-1">Crowd movement from actions</p>
            {active.map((iv) => (
              <p key={iv.type} className="text-muted">
                <span className="font-bold text-fg">{INTERVENTIONS[iv.type].short}:</span> {FLOWS[iv.type].label}
              </p>
            ))}
          </div>
        )}
        {mode === 'sim' && (
          <p className="border-t border-line px-3 py-2 text-[11px] leading-snug text-dim">
            Platform 2 has a video view. The other cameras show numbers from the same simulation, including people moved by your actions.
          </p>
        )}
      </aside>
    </div>
  )
}
