import { CloseIcon } from './Icons.jsx'
import { DEFAULT_SETTINGS, LEVELS } from '../lib/risk.js'

const FIELDS = [
  { key: 'watch', label: 'WATCH from', unit: 'people per zone', color: LEVELS[1].color },
  { key: 'warning', label: 'WARNING from', unit: 'people per zone', color: LEVELS[2].color },
  { key: 'critical', label: 'CRITICAL from', unit: 'people per zone', color: LEVELS[3].color },
  { key: 'surgePct', label: 'Surge: rise of', unit: 'percent' },
  { key: 'surgeMin', label: 'Surge: at least', unit: 'people' },
  { key: 'surgeWindow', label: 'Surge: within', unit: 'seconds' },
]

export default function SettingsPanel({ mode, value, onChange, onClose }) {
  const set = (k, v) => onChange({ ...value, [k]: Math.max(1, Number(v) || 1) })
  const invalid = !(value.watch < value.warning && value.warning < value.critical)

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#11111166]" onClick={onClose}>
      <aside
        className="h-full w-full max-w-sm overflow-y-auto border-l border-line-strong bg-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Alert thresholds"
      >
        <div className="panel-head">
          <span className="label">Alert thresholds</span>
          <button onClick={onClose} className="btn ml-auto h-7 w-7 justify-center px-0" aria-label="Close settings">
            <CloseIcon size={12} />
          </button>
        </div>
        <div className="p-4">
          <p className="text-[12px] text-muted">
            Applies to <span className="text-fg">{mode === 'sim' ? 'Simulation' : 'Live Detection'}</span> mode. Changes apply on the next update.
          </p>

          <table className="mt-4 w-full text-[13px]">
            <tbody className="divide-y divide-line">
              {FIELDS.map((f) => (
                <tr key={f.key}>
                  <td className="py-2 pr-2">
                    <label htmlFor={`th-${f.key}`} style={{ color: f.color }} className={f.color ? 'num font-medium' : 'text-fg'}>
                      {f.label}
                    </label>
                  </td>
                  <td className="w-20 py-2">
                    <input
                      id={`th-${f.key}`}
                      type="number"
                      min={1}
                      value={value[f.key]}
                      onChange={(e) => set(f.key, e.target.value)}
                      className="num w-full border border-line-strong bg-bg px-2 py-1 text-right text-fg"
                      style={{ borderRadius: 2 }}
                    />
                  </td>
                  <td className="py-2 pl-2 text-[12px] text-dim">{f.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {invalid && <p className="mt-3 text-[12px] text-warn">Thresholds should increase: WATCH, then WARNING, then CRITICAL.</p>}

          <div className="mt-5 border-t border-line pt-4 text-[12px] leading-relaxed text-muted">
            <p className="mb-1 font-bold text-fg">How risk is computed</p>
            <p>Each zone gets a level from its people count.</p>
            <p>A surge fires when a zone's count rises by the percentage and minimum number of people above, within the time window.</p>
            <p>Overall risk is the worst zone's level, raised by one level while any zone is surging.</p>
          </div>

          <button onClick={() => onChange(DEFAULT_SETTINGS[mode])} className="btn mt-5">
            Reset to defaults
          </button>
        </div>
      </aside>
    </div>
  )
}
