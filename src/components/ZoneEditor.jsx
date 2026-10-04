import { useEffect, useRef, useState } from 'react'
import SimulatedFeed from './SimulatedFeed.jsx'
import { CloseIcon } from './Icons.jsx'
import { DEFAULT_ZONES, finalise, isDefaultGrid, nearestGate } from '../lib/zones.js'

// Named zones for Platform 2, matching the simulated camera view.
const STATION_PRESET = [
  { name: 'Platform edge', x: 0, y: 0, w: 1, h: 0.28 },
  { name: 'West platform', x: 0, y: 0.28, w: 0.42, h: 0.72 },
  { name: 'Stair approach', x: 0.42, y: 0.28, w: 0.36, h: 0.47 },
  { name: 'Staircase', x: 0.42, y: 0.75, w: 0.36, h: 0.25 },
  { name: 'East platform', x: 0.78, y: 0.28, w: 0.22, h: 0.72 },
]

const clamp01 = (v) => Math.min(1, Math.max(0, v))
let nextId = 1
const newId = () => `Z${Date.now().toString(36)}${nextId++}`
const plain = (zs) => zs.map(({ id, name, x, y, w, h, gate, custom }) => ({ id, name, x, y, w, h, gate, custom }))

// Draw your own zones on the camera view. Changes only take effect when applied.
export default function ZoneEditor({ zones, onApply, mode, countsRef, motionRef, className = '' }) {
  const [draft, setDraft] = useState(() => plain(zones))
  const [selected, setSelected] = useState(null)
  const [drag, setDrag] = useState(null)
  const areaRef = useRef(null)

  useEffect(() => setDraft(plain(zones)), [zones])

  const dirty = JSON.stringify(plain(zones)) !== JSON.stringify(draft)
  const names = draft.map((z) => z.name.trim())
  const problems = [
    !draft.length && 'Add at least one zone.',
    names.some((n) => !n) && 'Every zone needs a name.',
    new Set(names).size !== names.length && 'Zone names must be different.',
  ].filter(Boolean)

  const point = (e) => {
    const r = areaRef.current.getBoundingClientRect()
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }
  }
  const onDown = (e) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = point(e)
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onMove = (e) => drag && setDrag({ ...drag, ...((p) => ({ x1: p.x, y1: p.y }))(point(e)) })
  const onUp = () => {
    if (!drag) return
    const x = Math.min(drag.x0, drag.x1)
    const y = Math.min(drag.y0, drag.y1)
    const w = Math.abs(drag.x1 - drag.x0)
    const h = Math.abs(drag.y1 - drag.y0)
    setDrag(null)
    if (w < 0.03 || h < 0.03) {
      // A click: select the zone under the pointer.
      const hit = [...draft].reverse().find((z) => drag.x0 >= z.x && drag.x0 <= z.x + z.w && drag.y0 >= z.y && drag.y0 <= z.y + z.h)
      setSelected(hit?.id ?? null)
      return
    }
    const z = { id: newId(), name: `Zone ${draft.length + 1}`, x, y, w, h, gate: nearestGate(x + w / 2), custom: true }
    setDraft([...draft, z])
    setSelected(z.id)
  }

  const update = (id, patch) => setDraft(draft.map((z) => (z.id === id ? { ...z, ...patch, custom: true } : z)))
  const remove = (id) => setDraft(draft.filter((z) => z.id !== id))
  const usePreset = () => setDraft(STATION_PRESET.map((z) => ({ ...z, id: newId(), gate: nearestGate(z.x + z.w / 2), custom: true })))

  return (
    <section className={`panel flex flex-col ${className}`}>
      <div className="panel-head">
        <span className="label">Zones</span>
        <span className="text-[12px] text-muted">{isDefaultGrid(zones) ? 'Using the 4x3 grid' : `${zones.length} custom zones`}</span>
        <div className="ml-auto flex gap-1.5">
          <button className="btn" onClick={usePreset}>
            Station preset
          </button>
          <button className="btn" onClick={() => setDraft(plain(DEFAULT_ZONES))}>
            4x3 grid
          </button>
          <button className="btn" onClick={() => setDraft([])}>
            Clear
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-h-0 flex-col">
          <p className="mb-1.5 text-[12px] text-muted">Drag on the view to draw a zone. Click a zone to select it. Avoid overlapping zones.</p>
          <div
            ref={areaRef}
            className="relative aspect-video w-full cursor-crosshair touch-none select-none overflow-hidden border border-line-strong bg-[#f6f5f1]"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            {mode === 'sim' ? <SimulatedFeed countsRef={countsRef} motionRef={motionRef} running /> : <div className="absolute inset-0 grid place-items-center text-[12px] text-dim">Live camera view not shown here</div>}
            {draft.map((z) => (
              <div
                key={z.id}
                className="pointer-events-none absolute border-2"
                style={{
                  left: `${z.x * 100}%`,
                  top: `${z.y * 100}%`,
                  width: `${z.w * 100}%`,
                  height: `${z.h * 100}%`,
                  borderColor: z.id === selected ? '#b02a22' : '#111111',
                  background: z.id === selected ? '#b02a2222' : '#1111110d',
                }}
              >
                <span className="num absolute left-1 top-1 bg-[#f6f5f1ee] px-1 text-[11px] font-bold">{z.name}</span>
              </div>
            ))}
            {drag && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-crit"
                style={{
                  left: `${Math.min(drag.x0, drag.x1) * 100}%`,
                  top: `${Math.min(drag.y0, drag.y1) * 100}%`,
                  width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
                  height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
                }}
              />
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          <ul className="scroll-thin min-h-0 flex-1 divide-y divide-line overflow-y-auto border border-line">
            {draft.length === 0 && <li className="px-2 py-3 text-[12px] text-dim">No zones yet. Draw one on the view.</li>}
            {draft.map((z) => (
              <li key={z.id} className={`flex items-center gap-1.5 px-2 py-1 ${z.id === selected ? 'bg-raised' : ''}`} onClick={() => setSelected(z.id)}>
                <input
                  value={z.name}
                  onChange={(e) => update(z.id, { name: e.target.value.slice(0, 24) })}
                  className="min-w-0 flex-1 border border-line bg-bg px-1.5 py-0.5 text-[12px] font-bold"
                  style={{ borderRadius: 2 }}
                  aria-label="Zone name"
                />
                <select
                  value={z.gate}
                  onChange={(e) => update(z.id, { gate: Number(e.target.value) })}
                  className="border border-line bg-bg px-1 py-0.5 text-[12px]"
                  style={{ borderRadius: 2 }}
                  aria-label="Exit gate"
                >
                  {[1, 2, 3].map((g) => (
                    <option key={g} value={g}>
                      Gate {g}
                    </option>
                  ))}
                </select>
                <button className="btn h-6 w-6 justify-center px-0" onClick={() => remove(z.id)} aria-label={`Delete ${z.name}`}>
                  <CloseIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
          {problems.length > 0 && <p className="mt-1.5 text-[12px] text-warn">{problems[0]}</p>}
          <div className="mt-2 flex gap-1.5">
            <button className="btn btn-primary flex-1 justify-center" disabled={!dirty || problems.length > 0} onClick={() => onApply(finalise(draft))}>
              Apply zones
            </button>
            <button className="btn" disabled={!dirty} onClick={() => setDraft(plain(zones))}>
              Discard
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-dim">Applying restarts monitoring. Limits are scaled to each zone's size, so a big zone needs more people to be flagged.</p>
        </div>
      </div>
    </section>
  )
}
