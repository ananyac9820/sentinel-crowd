import { useEffect, useRef, useState } from 'react'
import SimulatedFeed from './SimulatedFeed.jsx'
import { CloseIcon } from './Icons.jsx'
import { SITE_TYPES, cloneProfile, isConfigured, newPointId } from '../lib/site.js'

const PROFILE_LABELS = [
  ['generic', 'None (generic advice)'],
  ['station', 'Railway platform'],
  ['stadium', 'Stadium gate'],
  ['mall', 'Mall entrance'],
  ['airport', 'Airport security'],
  ['event', 'Public event or road'],
]
const clamp01 = (v) => Math.min(1, Math.max(0, v))

// Site setup: what kind of place this camera watches, and where its exits and entries are.
// The camera finds where risk builds; this tells the system what actions are possible.
export default function SitePanel({ site, onApply, mode, zones, countsRef, motionRef, className = '' }) {
  const [draft, setDraft] = useState(site)
  const [placing, setPlacing] = useState(null) // 'exit' | 'entry' while waiting for a click
  const areaRef = useRef(null)
  useEffect(() => setDraft(site), [site])

  const dirty = JSON.stringify(draft) !== JSON.stringify(site)
  const configured = isConfigured(draft)
  const problem = draft.type !== 'generic' && !draft.points.length ? 'Add at least one exit or entry, or choose None.' : draft.points.some((p) => !p.name.trim()) ? 'Every exit and entry needs a name.' : null

  const place = (e) => {
    if (!placing) return
    const r = areaRef.current.getBoundingClientRect()
    const x = clamp01((e.clientX - r.left) / r.width)
    const y = clamp01((e.clientY - r.top) / r.height)
    const n = draft.points.filter((p) => p.kind === placing).length + 1
    setDraft({ ...draft, points: [...draft.points, { id: newPointId(), kind: placing, name: placing === 'exit' ? `Exit ${n}` : `Entry ${n}`, x, y }] })
    setPlacing(null)
  }
  const update = (id, patch) => setDraft({ ...draft, points: draft.points.map((p) => (p.id === id ? { ...p, ...patch } : p)) })

  return (
    <section className={`panel flex flex-col ${className}`}>
      <div className="panel-head">
        <span className="label">Site</span>
        <span className={`text-[12px] font-bold ${configured ? 'text-fg' : 'text-warn'}`}>{configured ? `${SITE_TYPES[draft.type].label}: ${draft.name}` : 'Not configured: generic advice'}</span>
        <select
          className="ml-auto h-7 border border-line-strong bg-panel px-1.5 text-[12px] font-bold"
          style={{ borderRadius: 2 }}
          value=""
          onChange={(e) => e.target.value && setDraft(cloneProfile(e.target.value))}
          aria-label="Load a site profile"
        >
          <option value="">Load profile…</option>
          {PROFILE_LABELS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <p className="mb-1.5 text-[12px] leading-snug text-muted">
            The camera only finds <b className="text-fg">where</b> risk is building. Mark the real exits and entries so alerts can name them. With no site, alerts never name a gate.
          </p>
          <div
            ref={areaRef}
            onClick={place}
            className={`relative aspect-video w-full select-none overflow-hidden border border-line-strong bg-[#f6f5f1] ${placing ? 'cursor-crosshair' : ''}`}
          >
            {mode === 'sim' ? <SimulatedFeed countsRef={countsRef} motionRef={motionRef} running /> : <div className="absolute inset-0 grid place-items-center text-[12px] text-dim">Camera view</div>}
            {zones.map((z) => (
              <div key={z.id} className="pointer-events-none absolute border border-[#00000026]" style={{ left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%` }} />
            ))}
            <SitePins site={draft} />
            {placing && (
              <div className="pointer-events-none absolute inset-x-0 top-0 bg-fg px-2 py-1 text-center text-[12px] font-bold text-[#f6f5f1]">
                Click on the view to place the {placing}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 text-[12px]">
            <label htmlFor="site-type" className="font-bold">
              Type
            </label>
            <select
              id="site-type"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              className="border border-line bg-bg px-1 py-0.5"
              style={{ borderRadius: 2 }}
            >
              {Object.entries(SITE_TYPES).map(([k, t]) => (
                <option key={k} value={k}>
                  {t.label}
                </option>
              ))}
            </select>
            <label htmlFor="site-name" className="font-bold">
              Name
            </label>
            <input
              id="site-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 40) })}
              className="border border-line bg-bg px-1.5 py-0.5"
              style={{ borderRadius: 2 }}
            />
          </div>

          <ul className="scroll-thin max-h-[180px] min-h-[60px] divide-y divide-line overflow-y-auto border border-line">
            {draft.points.length === 0 && <li className="px-2 py-2 text-[12px] text-dim">No exits or entries yet.</li>}
            {draft.points.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5 px-2 py-1">
                <span className={`num w-12 text-[10px] font-bold ${p.kind === 'exit' ? 'text-safe' : 'text-warn'}`}>{p.kind.toUpperCase()}</span>
                <input
                  value={p.name}
                  onChange={(e) => update(p.id, { name: e.target.value.slice(0, 28) })}
                  className="min-w-0 flex-1 border border-line bg-bg px-1.5 py-0.5 text-[12px] font-bold"
                  style={{ borderRadius: 2 }}
                  aria-label={`${p.kind} name`}
                />
                <button className="btn h-6 w-6 justify-center px-0" onClick={() => setDraft({ ...draft, points: draft.points.filter((q) => q.id !== p.id) })} aria-label={`Delete ${p.name}`}>
                  <CloseIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-1.5">
            <button className={`btn flex-1 justify-center ${placing === 'exit' ? 'btn-primary' : ''}`} onClick={() => setPlacing(placing === 'exit' ? null : 'exit')}>
              Add exit
            </button>
            <button className={`btn flex-1 justify-center ${placing === 'entry' ? 'btn-primary' : ''}`} onClick={() => setPlacing(placing === 'entry' ? null : 'entry')}>
              Add entry
            </button>
          </div>
          {problem && <p className="text-[12px] text-warn">{problem}</p>}
          <div className="flex gap-1.5">
            <button className="btn btn-primary flex-1 justify-center" disabled={!dirty || !!problem} onClick={() => onApply(draft)}>
              Apply site
            </button>
            <button className="btn" disabled={!dirty} onClick={() => setDraft(site)}>
              Discard
            </button>
          </div>
          <p className="text-[11px] leading-snug text-dim">Each zone is linked to its nearest exit and entry. Alerts that recommend an action say it comes from this configuration.</p>
        </div>
      </div>
    </section>
  )
}

// Exit and entry markers drawn over a camera view.
export function SitePins({ site }) {
  if (!site?.points?.length || site.type === 'generic') return null
  return (
    <div className="pointer-events-none absolute inset-0">
      {site.points.map((p) => (
        <span
          key={p.id}
          className="num absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap border px-1 text-[10px] font-bold"
          style={{
            left: `${Math.min(92, Math.max(8, p.x * 100))}%`,
            top: `${Math.min(94, Math.max(6, p.y * 100))}%`,
            background: p.kind === 'exit' ? '#2f7a45' : '#f6f5f1',
            color: p.kind === 'exit' ? '#f6f5f1' : '#111111',
            borderColor: p.kind === 'exit' ? '#2f7a45' : '#111111',
            borderRadius: 2,
          }}
        >
          {p.kind === 'exit' ? 'EXIT' : 'IN'} {p.name}
        </span>
      ))}
    </div>
  )
}

