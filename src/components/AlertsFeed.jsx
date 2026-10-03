import { useState } from 'react'
import { BellRing, ChevronDown, ShieldCheck } from 'lucide-react'
import { LEVELS, INFO_COLOR } from '../lib/risk.js'

const fmt = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour12: false })

export default function AlertsFeed({ alerts, className = '' }) {
  return (
    <section className={`card flex flex-col min-h-[230px] ${className}`}>
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <span className="label flex items-center gap-1.5">
          <BellRing size={13} /> Alerts
        </span>
        <span className="num text-[11px] text-slate-500">{alerts.length} total · newest first · click for why</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-2.5 pb-2.5 space-y-1.5">
        {alerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-6">
            <ShieldCheck size={26} className="text-safe/70 mb-2" />
            <p className="text-sm">No alerts yet — all zones calm.</p>
          </div>
        ) : (
          alerts.map((a) => <AlertItem key={a.id} a={a} />)
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
    <button
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      title={open ? undefined : a.message}
      className="slide-in block w-full rounded-lg border-l-[3px] bg-ink-850 px-2.5 py-1.5 text-left transition-colors hover:bg-ink-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-soft"
      style={{ borderLeftColor: color, background: a.severity === 3 ? '#ef444414' : undefined }}
    >
      <div className="flex items-center gap-2 text-[11px] leading-4">
        <span className="font-bold tracking-wide" style={{ color }}>
          {sevLabel}
        </span>
        <span className="rounded bg-ink-700 px-1.5 font-mono font-bold text-slate-300">{a.zone}</span>
        <span className="truncate text-slate-400">{a.title}</span>
        <span className="num ml-auto shrink-0 font-mono text-slate-500">{fmt(a.time)}</span>
        <ChevronDown size={12} className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      <p className={`mt-0.5 text-[12.5px] leading-[18px] text-slate-200 ${open ? '' : 'truncate'}`}>{a.message}</p>
      {open && (
        <p className="mt-1 rounded-md bg-ink-950/60 px-2 py-1.5 text-[11px] leading-snug text-slate-400">
          <span className="font-semibold text-slate-300">Why this alert? </span>
          {a.why}
        </p>
      )}
    </button>
  )
}
