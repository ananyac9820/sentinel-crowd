import { useCallback, useEffect, useRef, useState } from 'react'
import { Settings, Home, FlaskConical, ScanEye } from 'lucide-react'
import Logo from './Logo.jsx'
import Footer from './Footer.jsx'
import CameraPanel from './CameraPanel.jsx'
import StatusCard from './StatusCard.jsx'
import AlertsFeed from './AlertsFeed.jsx'
import DensityChart from './DensityChart.jsx'
import ZoneTable from './ZoneTable.jsx'
import SettingsPanel from './SettingsPanel.jsx'
import useLiveDetection from '../hooks/useLiveDetection.jsx'
import { CrowdEngine, DEFAULT_SETTINGS, emptySnapshot, ZONE_COUNT } from '../lib/risk.js'
import { simCounts, INTERVENTION_AT } from '../lib/simulation.js'

const TICK_MS = 500

export default function Dashboard({ onHome }) {
  const [mode, setMode] = useState('sim') // Simulation is the default so the demo never fails on stage.
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  const [snap, setSnap] = useState(emptySnapshot)

  const engineRef = useRef(null)
  if (!engineRef.current) engineRef.current = new CrowdEngine(settings.sim)
  const engine = engineRef.current
  const countsRef = useRef(Array(ZONE_COUNT).fill(0))

  useEffect(() => {
    engine.settings = settings[mode]
  }, [engine, settings, mode])

  // ---- Simulation clock ----
  const [simT, setSimT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const simRef = useRef({ t: 0, wallStart: Date.now() })

  const restartSim = useCallback(() => {
    simRef.current = { t: 0, wallStart: Date.now() }
    engine.reset()
    countsRef.current = simCounts(0)
    setSnap(engine.step(countsRef.current, 0, Date.now()))
    setSimT(0)
    setPlaying(true)
  }, [engine])

  useEffect(() => {
    if (mode !== 'sim' || !playing) return
    const id = setInterval(() => {
      const s = simRef.current
      const prev = s.t
      s.t = prev + (TICK_MS / 1000) * speed
      const wall = s.wallStart + s.t * 1000
      const counts = simCounts(s.t)
      countsRef.current = counts
      const next = engine.step(counts, s.t, wall)
      if (prev < INTERVENTION_AT && s.t >= INTERVENTION_AT) {
        engine.addEvent(
          'Station control opened exit gate 2 and paused entry to Platform 2. Officers redirecting the crowd away from the staircase.',
          'Operator action logged by the control room in response to the CRITICAL alert. Not a model rule.',
          wall,
        )
        setSnap(engine.snapshot)
      } else setSnap(next)
      setSimT(s.t)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [mode, playing, speed, engine])

  // Every time the dashboard opens, the scenario starts from t=0 (SAFE) so demo runs are identical.
  useEffect(() => {
    restartSim()
  }, [restartSim])

  const switchMode = (m) => {
    if (m === mode) return
    engine.reset()
    engine.settings = settings[m]
    setSnap(emptySnapshot())
    setMode(m)
    if (m === 'sim') restartSim()
  }

  // ---- Live detection ----
  const onLiveCounts = useCallback(
    (counts) => {
      setSnap(engine.step(counts, performance.now() / 1000, Date.now()))
    },
    [engine],
  )
  const live = useLiveDetection({ active: mode === 'live', onCounts: onLiveCounts, onSwitchToSim: () => switchMode('sim') })

  // ---- Presenter shortcuts: Space = pause/play, R = restart, F = fullscreen ----
  const keysRef = useRef(null)
  keysRef.current = { mode, restartSim, togglePlay: live.togglePlay }
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target.closest?.('input, select, textarea')) return
      const k = keysRef.current
      if (e.code === 'Space') {
        e.preventDefault()
        document.activeElement?.blur?.()
        if (k.mode === 'sim') setPlaying((p) => !p)
        else k.togglePlay()
      } else if (e.key === 'r' || e.key === 'R') {
        if (k.mode === 'sim') k.restartSim()
      } else if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen?.()
        else document.documentElement.requestFullscreen?.().catch(() => {})
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const critical = snap.overall === 3

  return (
    <div className="relative flex h-full flex-col lg:overflow-hidden max-lg:overflow-y-auto">
      {critical && <div className="crit-frame pointer-events-none fixed inset-0 z-30" aria-hidden="true" />}

      <header className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-ink-900/60 px-4 py-2.5">
        <button onClick={onHome} className="flex items-center gap-2.5 rounded-lg pr-2 hover:opacity-80" title="Back to home">
          <Logo size={26} />
          <span className="font-semibold tracking-tight">Sentinel Crowd</span>
        </button>
        <span className="hidden sm:inline text-xs text-slate-500">Control room</span>

        <div className="ml-auto flex items-center rounded-xl border border-white/10 bg-ink-850 p-1" role="tablist" aria-label="Mode">
          {[
            ['sim', 'Simulation', FlaskConical],
            ['live', 'Live Detection', ScanEye],
          ].map(([key, label, Icon]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              onClick={() => switchMode(key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                mode === key ? 'bg-accent text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-850 px-3 py-1.5 text-sm text-slate-300 hover:text-white"
        >
          <Settings size={15} /> <span className="hidden sm:inline">Thresholds</span>
        </button>
        <button onClick={onHome} className="rounded-lg p-2 text-slate-400 hover:bg-ink-800 hover:text-white" aria-label="Home">
          <Home size={16} />
        </button>
      </header>

      <main className="grid flex-1 gap-3 p-3 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-3 lg:min-h-0">
          <CameraPanel
            className="lg:flex-1 lg:min-h-0"
            mode={mode}
            snap={snap}
            countsRef={countsRef}
            sim={{
              t: simT,
              playing,
              speed,
              onToggle: () => setPlaying((p) => !p),
              onSpeed: () => setSpeed((s) => (s === 1 ? 2 : 1)),
              onRestart: restartSim,
            }}
            live={live}
          />
          <DensityChart className="h-[200px] shrink-0" timeline={snap.timeline} now={snap.t} />
        </div>
        <aside className="flex flex-col gap-3 lg:min-h-0">
          <StatusCard snap={snap} />
          <ZoneTable snap={snap} />
          <AlertsFeed alerts={snap.alerts} className="lg:flex-1 lg:min-h-0" />
        </aside>
      </main>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 pb-2.5">
        <Footer className="flex-1" />
        <p className="text-[11px] text-slate-500" aria-label="Keyboard shortcuts">
          <Kbd>Space</Kbd> pause · <Kbd>R</Kbd> restart · <Kbd>F</Kbd> fullscreen
        </p>
      </footer>

      {showSettings && (
        <SettingsPanel
          mode={mode}
          value={settings[mode]}
          onChange={(v) => setSettings((s) => ({ ...s, [mode]: v }))}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

function Kbd({ children }) {
  return <kbd className="rounded border border-white/10 bg-ink-850 px-1 py-px font-mono text-[10px] text-slate-400">{children}</kbd>
}
