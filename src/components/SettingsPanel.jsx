import { X, RotateCcw } from 'lucide-react'
import { DEFAULT_SETTINGS, LEVELS } from '../lib/risk.js'

const FIELDS = [
  { key: 'watch', label: 'WATCH from', unit: 'people / zone', color: LEVELS[1].color },
  { key: 'warning', label: 'WARNING from', unit: 'people / zone', color: LEVELS[2].color },
  { key: 'critical', label: 'CRITICAL from', unit: 'people / zone', color: LEVELS[3].color },
  { key: 'surgePct', label: 'Surge: rise of', unit: '%' },
  { key: 'surgeMin', label: 'Surge: and at least', unit: 'people' },
  { key: 'surgeWindow', label: 'Surge: within', unit: 'seconds' },
]

export default function SettingsPanel({ mode, value, onChange, onClose }) {
  const set = (k, v) => {
    const n = Math.max(1, Number(v) || 1)
    onChange({ ...value, [k]: n })
  }
  const invalid = !(value.watch < value.warning && value.warning < value.critical)

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <aside className="card h-full w-full max-w-sm rounded-none rounded-l-2xl p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Alert thresholds</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-ink-800 hover:text-white" aria-label="Close settings">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Applies to <b className="text-slate-300">{mode === 'sim' ? 'Simulation' : 'Live Detection'}</b> mode. Changes take effect on the next tick.
        </p>

        <div className="mt-5 space-y-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-slate-300 flex items-center gap-2">
                {f.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.color }} />}
                {f.label}
              </span>
              <input
                type="number"
                min={1}
                value={value[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                className="num w-20 rounded-lg border border-white/10 bg-ink-850 px-2.5 py-1.5 text-right text-sm focus:border-accent focus:outline-none"
              />
              <span className="w-24 text-xs text-slate-500">{f.unit}</span>
            </label>
          ))}
        </div>

        {invalid && <p className="mt-3 text-xs text-warn">Thresholds should increase: WATCH &lt; WARNING &lt; CRITICAL.</p>}

        <div className="mt-6 rounded-lg bg-ink-850 p-3 text-xs leading-relaxed text-slate-400">
          <p className="font-semibold text-slate-300 mb-1">How risk is computed</p>
          Each zone gets a level from its people count. A <b>surge</b> fires when a zone's count rises by the % and
          minimum people above within the time window. <b>Overall risk</b> = the worst zone's level, bumped up one level
          while any zone is surging.
        </div>

        <button
          onClick={() => onChange(DEFAULT_SETTINGS[mode])}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
        >
          <RotateCcw size={14} /> Reset to defaults
        </button>
      </aside>
    </div>
  )
}
