import { useCallback, useEffect, useRef, useState } from 'react'
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
import { simCounts, stepSimulation } from '../lib/simulation.js'

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
      const { counts, snap: next } = stepSimulation(engine, prev, s.t, s.wallStart + s.t * 1000)
      countsRef.current = counts
      setSnap(next)
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
    <div
      className="flex h-full flex-col border-2 transition-colors duration-[1500ms] max-lg:overflow-y-auto lg:overflow-hidden"
      style={{ borderColor: critical ? 'var(--color-crit)' : 'var(--color-bg)' }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-3 py-1.5">
        <button onClick={onHome} className="flex items-center gap-2 text-fg hover:text-white" title="Back to home page">
          <Logo size={20} />
          <span className="font-semibold">Sentinel Crowd</span>
        </button>
        <span className="hidden h-4 w-px bg-line sm:block" />
        <span className="hidden text-[13px] text-muted sm:inline">Crowd safety control</span>

        <div className="ml-auto flex border border-line-strong" role="tablist" aria-label="Mode" style={{ borderRadius: 2 }}>
          {[
            ['sim', 'Simulation'],
            ['live', 'Live detection'],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              onClick={() => switchMode(key)}
              className={`h-7 px-3 text-[12px] font-medium transition-colors ${
                mode === key ? 'bg-accent text-[#f3f5f7]' : 'bg-raised text-muted hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowSettings(true)} className="btn">
          Thresholds
        </button>
      </header>

      <div className="px-3 pt-3">
        <StatusCard snap={snap} />
      </div>

      <main className="grid flex-1 gap-3 p-3 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-3 lg:min-h-0">
          <CameraPanel
            className="lg:min-h-0 lg:flex-1"
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
          <DensityChart className="h-[180px] shrink-0" timeline={snap.timeline} now={snap.t} />
        </div>
        <aside className="flex flex-col gap-3 lg:min-h-0">
          <ZoneTable snap={snap} />
          <AlertsFeed alerts={snap.alerts} className="lg:min-h-0 lg:flex-1" />
        </aside>
      </main>

      <Footer className="px-3 pb-2">
        <p className="num text-dim" aria-label="Keyboard shortcuts">
          <Kbd>Space</Kbd> pause <Kbd>R</Kbd> restart <Kbd>F</Kbd> fullscreen
        </p>
      </Footer>

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
  return (
    <kbd className="ml-2 mr-1 border border-line-strong px-1 text-[10px] text-muted first:ml-0" style={{ borderRadius: 2 }}>
      {children}
    </kbd>
  )
}
