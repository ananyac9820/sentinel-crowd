import { useEffect, useState } from 'react'
import { Pause, Play, RotateCcw, Video } from 'lucide-react'
import SimulatedFeed from './SimulatedFeed.jsx'
import ZoneGrid from './ZoneGrid.jsx'
import { SIM_DURATION, PHASES, phaseAt } from '../lib/simulation.js'

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function CameraPanel({ mode, snap, countsRef, sim, live, className = '' }) {
  const aspect = mode === 'live' && live?.aspect ? live.aspect : 16 / 9

  return (
    <section className={`card flex flex-col p-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-2 px-1 pb-2.5">
        <Video size={15} className="text-slate-400" />
        <span className="text-sm font-semibold">{mode === 'sim' ? 'CAM-03 · Platform 2, Central Junction' : live?.title || 'Live camera'}</span>
        <span className="rounded bg-ink-700 px-1.5 py-px text-[10px] font-bold tracking-wider text-slate-400">
          {mode === 'sim' ? 'SIMULATED' : 'AI DETECTION'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">{mode === 'sim' ? <SimControls sim={sim} /> : live?.controls}</div>
      </div>

      <div className="relative flex-1 min-h-[220px] flex items-center justify-center [container-type:size] max-lg:aspect-video max-lg:min-h-0">
        <div
          className="relative overflow-hidden rounded-lg bg-black"
          style={{ aspectRatio: aspect, width: `min(100cqw, calc(100cqh * ${aspect}))` }}
        >
          {mode === 'sim' ? <SimulatedFeed countsRef={countsRef} running={sim.playing} /> : live?.feed}
          {(mode === 'sim' || live?.showGrid) && <ZoneGrid snap={snap} />}
          {(mode === 'sim' || live?.showGrid) && <CctvOverlay label={mode === 'sim' ? 'CAM-03 PF-2' : 'CAM-LIVE'} />}
          {mode === 'live' && live?.overlay}
        </div>
      </div>

      {mode === 'sim' && <SimTimeline sim={sim} />}
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
    <div className="pointer-events-none absolute right-2 top-1.5 flex items-center gap-2 font-mono text-[11px] text-slate-300/90">
      <span className="flex items-center gap-1">
        <span className="blink h-2 w-2 rounded-full bg-crit" /> REC
      </span>
      <span>{label}</span>
      <span className="num">{now.toLocaleTimeString('en-GB', { hour12: false })}</span>
    </div>
  )
}

function SimControls({ sim }) {
  const btn = 'inline-flex items-center gap-1 rounded-lg border border-white/10 bg-ink-850 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-ink-800 hover:text-white'
  return (
    <>
      <button className={btn} onClick={sim.onToggle} aria-label={sim.playing ? 'Pause' : 'Play'}>
        {sim.playing ? <Pause size={13} /> : <Play size={13} />} {sim.playing ? 'Pause' : 'Play'}
      </button>
      <button className={btn} onClick={sim.onSpeed} title="Playback speed">
        <span className="num">{sim.speed}×</span>
      </button>
      <button className={btn} onClick={sim.onRestart}>
        <RotateCcw size={13} /> Restart
      </button>
    </>
  )
}

function SimTimeline({ sim }) {
  const t = Math.min(sim.t, SIM_DURATION)
  const done = sim.t >= SIM_DURATION
  return (
    <div className="px-1 pt-2.5">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-semibold text-slate-200 truncate">{done ? 'Scenario complete — press Restart to replay' : phaseAt(t).label}</span>
        <span className="num ml-auto font-mono text-slate-500">
          {mmss(t)} / {mmss(SIM_DURATION)}
        </span>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-ink-700">
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500 ease-linear" style={{ width: `${(t / SIM_DURATION) * 100}%` }} />
        {PHASES.slice(1).map((p) => (
          <span key={p.t} className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-slate-500" style={{ left: `${(p.t / SIM_DURATION) * 100}%` }} title={p.label} />
        ))}
      </div>
    </div>
  )
}
