import { useState } from 'react'
import { ChevronIcon } from './Icons.jsx'
import { LEVELS, INFO_COLOR } from '../lib/risk.js'

const fmt = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour12: false })

export default function AlertsFeed({ alerts, className = '', title = 'Alerts', extra = null, emptyText = 'No alerts. All zones are calm.' }) {
  return (
    <section className={`panel flex min-h-[230px] flex-col ${className}`}>
      <div className="panel-head">
        <span className="label">{title}</span>
        <span className="num text-[11px] text-muted">{alerts.length}</span>
        {extra ?? <span className="ml-auto text-[11px] text-dim">Newest first. Select an alert to see why.</span>}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {alerts.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-dim">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-line">
            {alerts.map((a) => (
              <AlertItem key={a.id} a={a} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function AlertItem({ a }) {
  const [open, setOpen] = useState(false)
  const color = a.severity < 0 ? INFO_COLOR : LEVELS[a.severity].color
  const sevLabel = a.severity < 0 ? 'ACTION' : LEVELS[a.severity].label

  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={open ? undefined : a.message}
        className="block w-full px-3 py-1.5 text-left transition-colors hover:bg-raised"
      >
        <div className="num flex items-center gap-2.5 text-[11px] leading-4">
          <span className="text-dim">{fmt(a.time)}</span>
          <span className="w-[62px] font-bold" style={{ color }}>
            {sevLabel}
          </span>
          <span className="max-w-[110px] shrink-0 truncate text-fg">{a.zone}</span>
          <span className="truncate font-sans text-muted">{a.title}</span>
          <ChevronIcon size={12} className={`ml-auto shrink-0 text-dim ${open ? 'rotate-180' : ''}`} />
        </div>
        <p className={`mt-0.5 text-[13px] leading-[18px] text-fg ${open ? '' : 'truncate'}`}>{a.message}</p>
        {open && (
          <p className="mt-1.5 border-t border-line pt-1.5 text-[12px] leading-snug text-muted">
            <span className="font-bold text-fg">Why this alert: </span>
            {a.why}
          </p>
        )}
      </button>
    </li>
  )
}
