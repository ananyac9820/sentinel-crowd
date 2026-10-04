import { DEFAULT_SETTINGS, LEVELS } from '../lib/risk.js'

const FIELDS = [
  { key: 'watch', label: 'WATCH from', unit: 'people per zone', color: LEVELS[1].color },
  { key: 'warning', label: 'WARNING from', unit: 'people per zone', color: LEVELS[2].color },
  { key: 'critical', label: 'CRITICAL from', unit: 'people per zone', color: LEVELS[3].color },
  { key: 'surgePct', label: 'Surge: rise of', unit: 'percent' },
  { key: 'surgeMin', label: 'Surge: at least', unit: 'people' },
  { key: 'surgeWindow', label: 'Surge: within', unit: 'seconds' },
  { key: 'turbulence', label: 'Turbulence alert at', unit: 'out of 100' },
  { key: 'counterFlow', label: 'Counter-flow alert at', unit: 'out of 100' },
]

// Alert thresholds for the current mode (Simulation and Live keep separate values).
export default function SettingsPanel({ mode, value, onChange, className = '' }) {
  const set = (k, v) => onChange({ ...value, [k]: Math.max(1, Math.min(k === 'turbulence' || k === 'counterFlow' ? 100 : 999, Number(v) || 1)) })
  const invalid = !(value.watch < value.warning && value.warning < value.critical)

  return (
    <section className={`panel flex flex-col ${className}`}>
      <div className="panel-head">
        <span className="label">Alert thresholds</span>
        <span className="text-[12px] text-muted">{mode === 'sim' ? 'Simulation' : 'Live detection'}</span>
        <button onClick={() => onChange(DEFAULT_SETTINGS[mode])} className="btn ml-auto">
          Reset
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <table className="mt-1 w-full text-[13px]">
          <tbody className="divide-y divide-line">
            {FIELDS.map((f) => (
              <tr key={f.key}>
                <td className="py-1.5 pr-2">
                  <label htmlFor={`th-${f.key}`} style={{ color: f.color }} className={f.color ? 'num font-bold' : 'text-fg'}>
                    {f.label}
                  </label>
                </td>
                <td className="w-20 py-1.5">
                  <input
                    id={`th-${f.key}`}
                    type="number"
                    min={1}
                    value={value[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="num w-full border border-line-strong bg-bg px-2 py-0.5 text-right text-fg"
                    style={{ borderRadius: 2 }}
                  />
                </td>
                <td className="py-1.5 pl-2 text-[12px] text-dim">{f.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {invalid && <p className="mt-2 text-[12px] text-warn">Thresholds should increase: WATCH, then WARNING, then CRITICAL.</p>}

        <div className="mt-3 border-t border-line pt-2 text-[12px] leading-relaxed text-muted">
          <p className="mb-1 font-bold text-fg">How risk is computed</p>
          <p>Each zone gets a level from its density. A zone larger or smaller than a grid cell has its limits scaled to its size.</p>
          <p>A surge fires when a zone's count rises by the percentage and minimum number of people above, within the time window.</p>
          <p>The forecast fits a line to each flagged zone's count over the last 10 seconds and estimates when it will reach CRITICAL.</p>
          <p>Turbulence is crowd pressure: density multiplied by how unevenly people move. Counter-flow measures movements cancelling each other out.</p>
          <p>Overall risk is the worst zone's level, raised by one level while any zone has a surge, turbulence or counter-flow.</p>
        </div>
      </div>
    </section>
  )
}
