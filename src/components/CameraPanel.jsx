import { useEffect, useState } from 'react'
import SimulatedFeed from './SimulatedFeed.jsx'
import ZoneGrid from './ZoneGrid.jsx'
import { PlayIcon, PauseIcon, RestartIcon } from './Icons.jsx'
import { SIM_DURATION, PHASES, AUTO_INTERVENTION_AT, INTERVENTIONS, phaseAt } from '../lib/simulation.js'

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function CameraPanel({ mode, snap, countsRef, motionRef, sim, live, className = '' }) {
  const aspect = mode === 'live' && live?.aspect ? live.aspect : 16 / 9
  const showGrid = mode === 'sim' || live?.showGrid

  return (
    <section className={`panel flex flex-col ${className}`}>
      <div className="panel-head">
        <span className="label">Camera</span>
        <span className="num min-w-0 truncate text-[13px] text-fg">
          {mode === 'sim' ? 'CAM-03 Platform 2, Central Junction' : live?.title || 'No source selected'}
        </span>
        <span className="num shrink-0 whitespace-nowrap border border-line px-1.5 text-[10px] tracking-wider text-muted" style={{ borderRadius: 2 }}>
          {mode === 'sim' ? 'SIMULATED' : 'AI DETECTION'}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">{mode === 'sim' ? <SimControls sim={sim} /> : live?.controls}</div>
      </div>

      <div className="relative flex flex-1 items-center justify-center p-2 [container-type:size] max-lg:aspect-video lg:min-h-[200px]">
        <div
          className="relative overflow-hidden bg-[#f6f5f1]"
          style={{ aspectRatio: aspect, width: `min(100cqw, calc(100cqh * ${aspect}))`, borderRadius: 2 }}
        >
          {mode === 'sim' ? <SimulatedFeed countsRef={countsRef} motionRef={motionRef} running={sim.playing} /> : live?.feed}
          {showGrid && <ZoneGrid snap={snap} aspect={aspect} />}
          {showGrid && <CctvOverlay label={mode === 'sim' ? 'CAM-03' : 'CAM-LIVE'} />}
          {mode === 'live' && live?.overlay}
        </div>
      </div>

      {mode === 'sim' && <SimTimeline sim={sim} />}
      {mode === 'sim' && <WhatIfBar sim={sim} />}
    </section>
  )
}

function CctvOverlay({ label }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div
      className="num pointer-events-none absolute right-1 top-1 flex items-center gap-2 px-1.5 py-px text-[11px] text-fg"
      style={{ background: '#f6f5f1ee', borderRadius: 2 }}
    >
      <span className="flex items-center gap-1 text-muted">
        <span className="inline-block h-1.5 w-1.5 bg-crit" /> REC
      </span>
      <span>{label}</span>
      <span>{now.toLocaleTimeString('en-GB', { hour12: false })}</span>
    </div>
  )
}

function SimControls({ sim }) {
  return (
    <>
      <button className="btn w-[76px] justify-center" onClick={sim.onToggle}>
        {sim.playing ? <PauseIcon size={12} /> : <PlayIcon size={12} />} {sim.playing ? 'Pause' : 'Play'}
      </button>
      <button className="btn num" onClick={sim.onSpeed} title="Playback speed">
        {sim.speed}x
      </button>
      <button className="btn" onClick={sim.onRestart}>
        <RestartIcon size={12} /> Restart
      </button>
    </>
  )
}

function SimTimeline({ sim }) {
  const t = Math.min(sim.t, SIM_DURATION)
  const done = sim.t >= SIM_DURATION
  return (
    <div className="border-t border-line px-3 py-1.5">
      <div className="flex items-center gap-3 text-[12px]">
        <span className="label shrink-0">Scenario</span>
        <span className="truncate text-fg">{done ? 'Complete. Press Restart or R to replay.' : phaseAt(t, sim.plan).label}</span>
        <span className="num ml-auto text-muted">
          {mmss(t)} / {mmss(SIM_DURATION)}
        </span>
      </div>
      <div className="relative mt-1 h-1 bg-raised">
        <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${(t / SIM_DURATION) * 100}%` }} />
        {PHASES.slice(1).map((p) => (
          <span key={p.t} className="absolute -top-0.5 h-2 w-px bg-line-strong" style={{ left: `${(p.t / SIM_DURATION) * 100}%` }} title={p.label} />
        ))}
        {sim.plan.map((iv) => (
          <span
            key={iv.type}
            className="absolute -top-1 h-3 w-0.5 bg-crit"
            style={{ left: `${(Math.min(iv.at, SIM_DURATION) / SIM_DURATION) * 100}%` }}
            title={`${INTERVENTIONS[iv.type].short} at ${mmss(iv.at)}`}
          />
        ))}
      </div>
    </div>
  )
}

// "What if" buttons: apply an action now and watch the crowd respond.
function WhatIfBar({ sim }) {
  const applied = (type) => sim.plan.find((iv) => iv.type === type && sim.t >= iv.at)
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-1.5">
      <span className="label shrink-0">What if</span>
      {Object.entries(INTERVENTIONS).map(([type, def]) => {
        const done = applied(type)
        return (
          <button key={type} className={`btn ${done ? '' : 'btn-primary'}`} disabled={!!done} onClick={() => sim.onIntervene(type)} title={def.message}>
            {done ? `${def.short} at ${mmss(done.at)}` : def.label}
          </button>
        )
      })}
      <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted" title={`Opens gate 2 automatically at ${mmss(AUTO_INTERVENTION_AT)} unless you act first`}>
        <input type="checkbox" checked={sim.auto} onChange={(e) => sim.onAuto(e.target.checked)} className="accent-[#111111]" />
        Auto response at {mmss(AUTO_INTERVENTION_AT)}
      </label>
    </div>
  )
}
