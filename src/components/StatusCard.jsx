import { LEVELS } from '../lib/risk.js'

const ADVICE = [
  'All zones are within safe density.',
  'Crowd is building. Keep watching the flagged zones.',
  'Congestion. Divert people away from the flagged zones now.',
  'Crush risk. Open exits and stop entry immediately.',
]

// Full-width status bar. Tinted at WATCH and WARNING, solid critical colour at CRITICAL.
export default function StatusCard({ snap }) {
  const lvl = LEVELS[snap.overall]
  const critical = snap.overall === 3
  const bg = critical ? lvl.color : snap.overall ? `${lvl.color}2b` : 'var(--color-panel)'
  const ink = critical ? '#f4f1ee' : undefined
  const sub = critical ? '#f4f1eecc' : undefined

  return (
    <section
      className="flex flex-wrap items-stretch border transition-colors duration-1000"
      style={{ background: bg, borderColor: snap.overall ? lvl.color : 'var(--color-line)', borderRadius: 3 }}
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4 px-4 py-2">
        <div>
          <div className="label" style={{ color: sub }}>
            Overall risk
          </div>
          <div
            className="num text-[26px] font-semibold leading-8 tracking-wide transition-colors duration-1000"
            style={{ color: critical ? ink : lvl.color }}
          >
            {lvl.label}
          </div>
        </div>
        <p className="min-w-0 text-[13px] leading-snug text-muted" style={{ color: sub }}>
          {ADVICE[snap.overall]}
        </p>
      </div>

      <dl className="flex divide-x">
        <Stat label="People" value={snap.people} ink={ink} sub={sub} />
        <Stat
          label="Busiest zone"
          value={snap.topZone.count ? `${snap.topZone.name} ${snap.topZone.count}` : '-'}
          ink={ink}
          sub={sub}
        />
        <Stat label="Risk score" value={snap.score} unit="/100" ink={ink} sub={sub} />
        <Stat label="Surge" value={snap.surgingZones.length ? snap.surgingZones.join(' ') : 'None'} ink={ink} sub={sub} small />
      </dl>
    </section>
  )
}

function Stat({ label, value, unit, ink, sub, small }) {
  return (
    <div className="flex min-w-[96px] flex-col justify-center px-4 py-2" style={{ borderColor: ink ? '#f4f1ee40' : 'var(--color-line)' }}>
      <dt className="label" style={{ color: sub }}>
        {label}
      </dt>
      <dd className={`num font-semibold leading-7 ${small ? 'text-[15px]' : 'text-[22px]'}`} style={{ color: ink }}>
        {value}
        {unit && (
          <span className="ml-0.5 text-[12px] font-normal text-muted" style={{ color: sub }}>
            {unit}
          </span>
        )}
      </dd>
    </div>
  )
}
