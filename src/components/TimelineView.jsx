import { useState } from 'react'
import DensityChart from './DensityChart.jsx'
import AlertsFeed from './AlertsFeed.jsx'
import { LEVELS } from '../lib/risk.js'

const FILTERS = [
  ['all', 'All', () => true],
  ['critical', 'Critical', (a) => a.severity === 3],
  ['early', 'Early warnings', (a) => ['surge', 'forecast', 'turbulence', 'counter'].includes(a.kind)],
  ['actions', 'Actions', (a) => a.kind === 'action'],
]
const fmtSecs = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
const time = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour12: false })

// Looking back: full chart, run summary, alert history with filters, exports and sent notifications.
export default function TimelineView({ snap, sms, onReport, onAlertsCsv, onTimelineCsv }) {
  const [filter, setFilter] = useState('all')
  const test = FILTERS.find((f) => f[0] === filter)[2]
  const st = snap.stats
  const lead = snap.leadTimes[snap.leadTimes.length - 1]

  return (
    <div className="grid h-full gap-3 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-3 lg:min-h-0">
        <DensityChart className="min-h-[240px] lg:min-h-0 lg:flex-1" timeline={snap.timeline} now={snap.t} showTurbulence />
        <section className="panel">
          <div className="panel-head">
            <span className="label">This run</span>
            <div className="ml-auto flex gap-1.5">
              <button className="btn btn-primary" onClick={onReport}>
                Incident report
              </button>
              <button className="btn" onClick={onAlertsCsv}>
                Alerts CSV
              </button>
              <button className="btn" onClick={onTimelineCsv}>
                Timeline CSV
              </button>
            </div>
          </div>
          <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
            <Fact label="Early-warning lead time" value={lead ? `${lead.lead}s` : '-'} note={lead ? `${lead.zone}: warned before it reached CRITICAL` : 'Shown once a warned zone reaches CRITICAL'} strong />
            <Fact label="Peak people" value={st.peakPeople} note="Most people in view at once" />
            <Fact label="Peak risk score" value={`${st.peakScore}/100`} note="75 means a zone at the CRITICAL limit" />
            <div className="px-3 py-2">
              <dt className="label">Time at each level</dt>
              <dd className="mt-1 grid grid-cols-2 gap-x-3 text-[12px]">
                {LEVELS.map((l, i) => (
                  <span key={l.key} className="num flex justify-between">
                    <span style={{ color: l.color }} className="font-bold">
                      {l.label}
                    </span>
                    {fmtSecs(st.levelSeconds[i])}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="flex flex-col gap-3 lg:min-h-0">
        <AlertsFeed
          className="lg:min-h-0 lg:flex-1"
          title="Alert history"
          alerts={snap.alerts.filter(test)}
          emptyText="No alerts of this type yet."
          extra={
            <div className="ml-auto flex gap-1" role="group" aria-label="Filter alerts">
              {FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className={`h-6 border px-1.5 text-[11px] font-bold ${filter === key ? 'border-fg bg-fg text-[#f6f5f1]' : 'border-line bg-panel text-muted hover:text-fg'}`}
                  style={{ borderRadius: 2 }}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />
        <section className="panel flex max-h-[220px] flex-col">
          <div className="panel-head">
            <span className="label">Notifications sent</span>
            <span className="num text-[11px] text-muted">{sms.length}</span>
            <span className="ml-auto text-[11px] text-dim">Simulated SMS, nothing is actually sent</span>
          </div>
          <ul className="scroll-thin min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {sms.length === 0 ? (
              <li className="px-3 py-4 text-center text-[13px] text-dim">No notifications yet. They are sent for CRITICAL and early-warning alerts.</li>
            ) : (
              sms.map((m) => (
                <li key={m.id} className="px-3 py-1.5 text-[12px]">
                  <div className="num flex gap-2 text-dim">
                    <span>{time(m.time)}</span>
                    <span className="truncate text-fg">To: {m.to}</span>
                  </div>
                  <p className="leading-snug">{m.text}</p>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Fact({ label, value, note, strong }) {
  return (
    <div className="px-3 py-2">
      <dt className="label">{label}</dt>
      <dd className={`num text-[22px] font-bold leading-8 ${strong ? 'text-crit' : ''}`}>{value}</dd>
      <dd className="text-[11px] leading-snug text-dim">{note}</dd>
    </div>
  )
}
