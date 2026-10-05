import { useCallback, useEffect, useRef, useState } from 'react'
import Logo from './Logo.jsx'
import Footer from './Footer.jsx'
import CameraPanel from './CameraPanel.jsx'
import StatusCard from './StatusCard.jsx'
import AlertsFeed from './AlertsFeed.jsx'
import DensityChart from './DensityChart.jsx'
import ZoneTable from './ZoneTable.jsx'
import ZoneGrid from './ZoneGrid.jsx'
import SettingsPanel from './SettingsPanel.jsx'
import ZoneEditor from './ZoneEditor.jsx'
import StationMap from './StationMap.jsx'
import TimelineView from './TimelineView.jsx'
import useLiveDetection from '../hooks/useLiveDetection.jsx'
import { CrowdEngine, DEFAULT_SETTINGS, emptySnapshot } from '../lib/risk.js'
import { DEFAULT_ZONES, GRID_CELLS, aggregateGrid, aggregatePeople, finalise } from '../lib/zones.js'
import { AUTO_INTERVENTION_AT, STATION_CAMERAS, simGrid, sideGrid, stepSimulation } from '../lib/simulation.js'
import { playAlarm, unlockAudio } from '../lib/alarm.js'
import { alertsCsv, download, openReport, timelineCsv } from '../lib/report.js'

const TICK_MS = 500
const TABS = [
  ['monitor', 'Monitor'],
  ['station', 'Station'],
  ['zones', 'Zones'],
  ['timeline', 'Timeline'],
  ['setup', 'Setup'],
]
const SIDE_IDS = STATION_CAMERAS.filter((c) => !c.main).map((c) => c.id)

// Per-viewer preferences, kept in browser storage when available.
const load = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v ?? fallback
  } catch {
    return fallback
  }
}
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked (private window); preferences just won't persist.
  }
}
const loadZones = () => {
  const z = load('sentinel.zones.v2', null)
  return Array.isArray(z) && z.length ? finalise(z) : DEFAULT_ZONES
}

export default function Dashboard({ onHome }) {
  const [tab, setTab] = useState('monitor')
  const [mode, setMode] = useState('sim') // Simulation is the default so the demo never fails on stage.
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [zones, setZones] = useState(loadZones)
  const [snap, setSnap] = useState(() => emptySnapshot(zones))
  const [sideSnaps, setSideSnaps] = useState({})
  const [notify, setNotify] = useState(() => load('sentinel.notify.v1', { sound: true, sms: true, to: 'Station Master, Central Junction' }))
  const [sms, setSms] = useState([])
  const [toast, setToast] = useState(null)

  const engineRef = useRef(null)
  if (!engineRef.current) engineRef.current = new CrowdEngine(settings.sim, zones)
  const engine = engineRef.current
  const sideRef = useRef(null)
  if (!sideRef.current)
    sideRef.current = Object.fromEntries(
      SIDE_IDS.map((id) => {
        const short = STATION_CAMERAS.find((c) => c.id === id).short
        return [id, new CrowdEngine(DEFAULT_SETTINGS.sim, finalise(DEFAULT_ZONES.map((z) => ({ ...z, name: `${short} ${z.id}` }))))]
      }),
    )
  const countsRef = useRef(Array(GRID_CELLS).fill(0))
  const motionRef = useRef(null)
  const zonesRef = useRef(zones)
  zonesRef.current = zones

  useEffect(() => {
    engine.settings = settings[mode]
  }, [engine, settings, mode])

  // ---- Simulation clock and interventions ----
  const [simT, setSimT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [manual, setManual] = useState([])
  const [auto, setAuto] = useState(true)
  const simRef = useRef({ t: 0, wallStart: Date.now() })

  // The scripted response (Gate 2 at 1:06) only runs if the operator hasn't acted first.
  const plan = [...manual, ...(auto && !manual.some((iv) => iv.at <= AUTO_INTERVENTION_AT) ? [{ type: 'gate2', at: AUTO_INTERVENTION_AT, auto: true }] : [])]
  const planRef = useRef(plan)
  planRef.current = plan

  const restartSim = useCallback(() => {
    simRef.current = { t: 0, wallStart: Date.now() }
    engine.reset()
    Object.values(sideRef.current).forEach((e) => e.reset())
    const grid = simGrid(0, [])
    countsRef.current = grid.counts
    motionRef.current = grid.motion
    const agg = aggregateGrid(grid, zonesRef.current)
    setSnap(engine.step(agg.counts, 0, Date.now(), agg.motion))
    setSideSnaps({})
    setSimT(0)
    setManual([])
    setSms([])
    setPlaying(true)
  }, [engine])

  useEffect(() => {
    if (mode !== 'sim' || !playing) return
    const id = setInterval(() => {
      const s = simRef.current
      const prev = s.t
      s.t = prev + (TICK_MS / 1000) * speed
      const wall = s.wallStart + s.t * 1000
      const { grid, snap: next } = stepSimulation(engine, prev, s.t, wall, planRef.current, (g) => aggregateGrid(g, zonesRef.current))
      countsRef.current = grid.counts
      motionRef.current = grid.motion
      const sides = {}
      for (const camId of SIDE_IDS) {
        const g = sideGrid(camId, s.t, planRef.current)
        sides[camId] = sideRef.current[camId].step(g.counts, s.t, wall, g.motion)
      }
      setSnap(next)
      setSideSnaps(sides)
      setSimT(s.t)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [mode, playing, speed, engine])

  // Every time the dashboard opens, the scenario starts from t=0 (SAFE) so demo runs are identical.
  useEffect(() => {
    restartSim()
  }, [restartSim])

  const intervene = (type) => {
    if (manual.some((iv) => iv.type === type)) return
    setManual((m) => [...m, { type, at: simRef.current.t }])
  }

  const switchMode = (m) => {
    if (m === mode) return
    engine.reset()
    engine.settings = settings[m]
    setSnap(emptySnapshot(zones))
    setSms([])
    setMode(m)
    if (m === 'sim') restartSim()
  }

  const applyZones = (z) => {
    zonesRef.current = z // restartSim below reads the ref before React re-renders
    setZones(z)
    save('sentinel.zones.v2', z.map(({ id, name, x, y, w, h, gate, custom }) => ({ id, name, x, y, w, h, gate, custom })))
    engine.setZones(z)
    if (mode === 'sim') restartSim()
    else setSnap(emptySnapshot(z))
  }

  // ---- Live detection ----
  const onLivePeople = useCallback(
    (people) => {
      const agg = aggregatePeople(people, zonesRef.current)
      setSnap(engine.step(agg.counts, performance.now() / 1000, Date.now(), agg.motion))
    },
    [engine],
  )
  const onLiveSource = useCallback(() => {
    engine.reset()
    setSnap(emptySnapshot(zonesRef.current))
    setSms([])
  }, [engine])
  const live = useLiveDetection({ active: mode === 'live', onPeople: onLivePeople, onSourceChange: onLiveSource, onSwitchToSim: () => switchMode('sim') })

  // ---- Alarm sound and simulated SMS for serious alerts ----
  const seenRef = useRef(0)
  const lastAlarmRef = useRef(0)
  useEffect(() => {
    const fresh = snap.alerts.filter((a) => a.id > seenRef.current)
    if (!snap.alerts.length) seenRef.current = 0
    if (!fresh.length) return
    seenRef.current = Math.max(...fresh.map((a) => a.id))
    const serious = fresh.filter((a) => a.severity === 3 || (a.severity >= 2 && ['forecast', 'turbulence', 'counter'].includes(a.kind)))
    if (!serious.length) return
    const now = Date.now()
    if (notify.sound && now - lastAlarmRef.current > 6000) {
      if (playAlarm(serious.some((a) => a.severity === 3) ? 'critical' : 'warning')) lastAlarmRef.current = now
    }
    if (notify.sms) {
      const cam = mode === 'sim' ? 'CAM-03' : 'CAM-LIVE'
      const msgs = serious
        .filter((a) => a.kind !== 'level' || a.severity === 3)
        .map((a) => ({ id: `${a.id}`, time: a.time, to: notify.to, text: `SENTINEL ${cam} ${a.zone}: ${a.title.toUpperCase()}. ${a.message}`.slice(0, 200) }))
      if (msgs.length) {
        setSms((s) => [...msgs.reverse(), ...s].slice(0, 50))
        setToast(msgs[0])
      }
    }
  }, [snap.alerts, notify, mode])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => save('sentinel.notify.v1', notify), [notify])

  // ---- Presenter shortcuts: Space = pause/play, R = restart, F = fullscreen, 1-5 = tabs ----
  const keysRef = useRef(null)
  keysRef.current = { mode, restartSim, togglePlay: live.togglePlay }
  useEffect(() => {
    const onKey = (e) => {
      unlockAudio()
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
      } else if (/^[1-5]$/.test(e.key)) {
        setTab(TABS[Number(e.key) - 1][0])
      }
    }
    const onPointer = () => unlockAudio()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  const critical = snap.overall === 3
  const exportName = `sentinel-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`
  const report = () =>
    openReport({
      site: 'Central Junction',
      camera: mode === 'sim' ? 'CAM-03 Platform 2' : live.title || 'Live camera',
      modeLabel: mode === 'sim' ? 'Simulation scenario' : 'Live detection',
      snap,
      plan: mode === 'sim' ? plan.filter((iv) => simT >= iv.at) : [],
      sms,
    })

  return (
    <div
      className="flex min-h-full flex-col border-2 transition-colors duration-[1500ms] lg:h-full lg:overflow-hidden"
      style={{ borderColor: critical ? 'var(--color-crit)' : 'var(--color-bg)' }}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b-[3px] border-line-strong bg-panel px-3 pt-1.5 lg:items-end">
        <button onClick={onHome} className="flex items-center gap-2 pb-1.5 text-fg hover:text-black lg:self-center" title="Back to home page">
          <Logo size={20} />
          <span className="font-bold max-sm:hidden">Sentinel Crowd</span>
        </button>
        <nav className="order-last -mx-3 flex w-[calc(100%+1.5rem)] overflow-x-auto px-1 lg:order-none lg:mx-0 lg:w-auto lg:px-0" role="tablist" aria-label="Sections">
          {TABS.map(([key, label], i) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className="tab" title={`Shortcut: ${i + 1}`}>
              {label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 pb-1.5 lg:self-center">
          <button
            onClick={() => setNotify((n) => ({ ...n, sound: !n.sound }))}
            className="btn"
            aria-pressed={notify.sound}
            title="Alarm sound for CRITICAL and early-warning alerts"
          >
            Sound {notify.sound ? 'on' : 'off'}
          </button>
          <div className="flex border border-line-strong" role="tablist" aria-label="Mode" style={{ borderRadius: 2 }}>
            {[
              ['sim', 'Simulation', 'Sim'],
              ['live', 'Live detection', 'Live'],
            ].map(([key, label, short]) => (
              <button
                key={key}
                role="tab"
                aria-selected={mode === key}
                onClick={() => switchMode(key)}
                className={`h-7 px-3 text-[12px] font-bold transition-colors ${mode === key ? 'bg-accent text-[#f6f5f1]' : 'bg-raised text-muted hover:text-fg'}`}
              >
                <span className="max-sm:hidden">{label}</span>
                <span className="sm:hidden">{short}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="px-3 pt-3">
        <StatusCard snap={snap} />
      </div>

      <main className="flex-1 p-3 lg:min-h-0">
        <div className={tab === 'monitor' ? 'grid gap-3 [&>*]:min-w-0 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_380px]' : 'hidden'}>
          <div className="flex flex-col gap-3 lg:min-h-0">
            <CameraPanel
              className="lg:min-h-0 lg:flex-1"
              mode={mode}
              snap={snap}
              countsRef={countsRef}
              motionRef={motionRef}
              sim={{
                t: simT,
                playing,
                speed,
                plan,
                auto,
                onToggle: () => setPlaying((p) => !p),
                onSpeed: () => setSpeed((s) => (s === 1 ? 2 : 1)),
                onRestart: restartSim,
                onIntervene: intervene,
                onAuto: setAuto,
              }}
              live={live}
            />
            <DensityChart compact className="h-[118px] shrink-0" timeline={snap.timeline} now={snap.t} />
          </div>
          <AlertsFeed alerts={snap.alerts} className="max-lg:max-h-[70vh] lg:min-h-0" />
        </div>

        {tab === 'station' && <StationMap mode={mode} mainSnap={snap} sideSnaps={sideSnaps} plan={plan} t={simT} onOpenMonitor={() => setTab('monitor')} />}

        {tab === 'zones' && (
          <div className="grid gap-3 [&>*]:min-w-0 lg:h-full lg:min-h-0 lg:grid-cols-[400px_minmax(0,1fr)]">
            <section className="panel self-start">
              <div className="panel-head">
                <span className="label">Zone map</span>
                <span className="ml-auto text-[11px] text-dim">Arrows show movement; red pairs mean counter-flow</span>
              </div>
              <div className="p-2">
                <div className="relative aspect-video border border-line bg-[#f6f5f1]">
                  <ZoneGrid snap={snap} />
                </div>
              </div>
              <p className="border-t border-line px-3 py-2 text-[12px] leading-snug text-muted">
                Change the zones on the <button className="link" onClick={() => setTab('setup')}>Setup</button> tab. Each zone suggests its nearest exit gate in alerts.
              </p>
            </section>
            <ZoneTable snap={snap} settings={settings[mode]} className="lg:min-h-0" />
          </div>
        )}

        {tab === 'timeline' && (
          <TimelineView
            snap={snap}
            sms={sms}
            onReport={report}
            onAlertsCsv={() => download(`${exportName}-alerts.csv`, alertsCsv(snap.alerts))}
            onTimelineCsv={() => download(`${exportName}-timeline.csv`, timelineCsv(snap.timeline))}
          />
        )}

        {tab === 'setup' && (
          <div className="grid gap-3 [&>*]:min-w-0 lg:h-full lg:min-h-0 lg:grid-cols-[380px_minmax(0,1fr)]">
            <div className="flex flex-col gap-3 lg:min-h-0">
              <SettingsPanel mode={mode} value={settings[mode]} onChange={(v) => setSettings((s) => ({ ...s, [mode]: v }))} className="lg:min-h-0 lg:flex-1" />
              <NotifyPanel notify={notify} onChange={setNotify} />
            </div>
            <ZoneEditor zones={zones} onApply={applyZones} mode={mode} countsRef={countsRef} motionRef={motionRef} className="lg:min-h-0" />
          </div>
        )}
      </main>

      <Footer className="px-3 pb-2">
        <p className="num text-dim max-lg:hidden" aria-label="Keyboard shortcuts">
          <Kbd>Space</Kbd> pause <Kbd>R</Kbd> restart <Kbd>F</Kbd> fullscreen <Kbd>1-5</Kbd> tabs
        </p>
      </Footer>

      {toast && (
        <div className="panel fixed inset-x-3 bottom-3 z-40 px-3 py-2 sm:left-auto sm:right-4 sm:bottom-10 sm:w-[340px]" role="status">
          <p className="label text-crit">SMS sent (simulated)</p>
          <p className="num text-[11px] text-dim">To: {toast.to}</p>
          <p className="mt-0.5 text-[12px] leading-snug">{toast.text}</p>
        </div>
      )}
    </div>
  )
}

function NotifyPanel({ notify, onChange }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">Notifications</span>
        <button
          className="btn ml-auto"
          onClick={() => {
            unlockAudio()
            playAlarm('critical')
          }}
        >
          Test alarm
        </button>
      </div>
      <div className="space-y-2 px-3 py-2 text-[13px]">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={notify.sound} onChange={(e) => onChange({ ...notify, sound: e.target.checked })} className="accent-[#111111]" />
          Alarm sound for CRITICAL and early-warning alerts
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={notify.sms} onChange={(e) => onChange({ ...notify, sms: e.target.checked })} className="accent-[#111111]" />
          Simulated SMS to
        </label>
        <input
          value={notify.to}
          onChange={(e) => onChange({ ...notify, to: e.target.value.slice(0, 60) })}
          className="w-full border border-line-strong bg-bg px-2 py-1 text-[13px]"
          style={{ borderRadius: 2 }}
          aria-label="SMS recipient"
        />
        <p className="text-[11px] leading-snug text-dim">Nothing is actually sent. A real deployment would connect an SMS gateway here.</p>
      </div>
    </section>
  )
}

function Kbd({ children }) {
  return (
    <kbd className="ml-2 mr-1 border border-line-strong px-1 text-[10px] text-muted first:ml-0" style={{ borderRadius: 2 }}>
      {children}
    </kbd>
  )
}
