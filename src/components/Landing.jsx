import { useEffect, useRef, useState } from 'react'
import Logo from './Logo.jsx'
import Footer from './Footer.jsx'
import StatusCard from './StatusCard.jsx'
import AlertsFeed from './AlertsFeed.jsx'
import SimulatedFeed from './SimulatedFeed.jsx'
import ZoneGrid from './ZoneGrid.jsx'
import { CrowdEngine, DEFAULT_SETTINGS, ZONE_COUNT } from '../lib/risk.js'
import { stepSimulation, SIM_DURATION } from '../lib/simulation.js'

const STEPS = [
  [
    'Connect a camera.',
    'Use an existing CCTV feed or a recorded clip. The video is processed in the browser and never leaves the device.',
  ],
  ['Count people in each zone.', 'The view is split into a 4x3 grid. A person detection model counts the people in each zone twice a second.'],
  [
    'Check two simple rules.',
    'A zone is flagged when its count passes a set threshold, or when it rises quickly within 20 seconds.',
  ],
  [
    'Tell the operator what to do.',
    'Each alert names the zone, the severity and a suggested action, such as opening a specific exit gate.',
  ],
]

export default function Landing({ onOpen }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b-[3px] border-line-strong bg-panel">
        <div className="mx-auto flex h-12 w-full max-w-[1200px] items-center gap-2.5 px-6">
          <Logo />
          <span className="font-bold">Sentinel Crowd</span>
          <span className="ml-auto text-[12px] text-dim">CuriousPARC 2026, Theme 3</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6">
        <section className="grid items-start gap-8 py-8 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="lg:pt-6">
            <h1 className="text-[32px] font-bold leading-tight">Sentinel Crowd</h1>
            <p className="mt-3 text-[16px] leading-relaxed text-muted">
              Sentinel Crowd counts people in each part of a CCTV view and warns station or event staff when an area is
              becoming dangerously crowded.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-dim">
              Built for railway platforms, temples and festivals, where crushes build up over minutes before anyone on
              the ground can see them.
            </p>
            <button onClick={onOpen} className="btn btn-primary mt-6 h-10 px-5 text-[14px]">
              Open dashboard
            </button>
          </div>
          <LivePreview />
        </section>

        <section className="border-t border-line py-8">
          <h2 className="label">How it works</h2>
          <ol className="mt-4 grid gap-x-10 gap-y-5 md:grid-cols-2">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="grid grid-cols-[32px_1fr] gap-2">
                <span className="num text-[15px] text-accent">{String(i + 1).padStart(2, '0')}</span>
                <p className="text-[14px] leading-relaxed text-muted">
                  <span className="font-bold text-fg">{title}</span> {body}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <div className="mx-auto w-full max-w-[1200px] border-t border-line px-6 py-4">
        <Footer />
      </div>
    </div>
  )
}

// A scaled-down copy of the real dashboard, running the same simulation and risk engine.
const PREVIEW_START = 30 // skip the quiet first half-minute so visitors see the build-up sooner

function LivePreview() {
  const countsRef = useRef(Array(ZONE_COUNT).fill(0))
  const [snap, setSnap] = useState(null)

  useEffect(() => {
    let engine, t, wallStart
    const start = () => {
      engine = new CrowdEngine(DEFAULT_SETTINGS.sim)
      wallStart = Date.now() - PREVIEW_START * 1000
      for (t = 0; t < PREVIEW_START; t += 0.5) stepSimulation(engine, t - 0.5, t, wallStart + t * 1000)
    }
    start()
    const id = setInterval(() => {
      const prev = t
      t += 0.5
      if (t > SIM_DURATION + 6) {
        start()
        return
      }
      const r = stepSimulation(engine, prev, t, wallStart + t * 1000)
      countsRef.current = r.counts
      setSnap({ ...r.snap, alerts: r.snap.alerts.slice(0, 4) })
    }, 500)
    return () => clearInterval(id)
  }, [])

  return (
    <figure className="panel overflow-hidden" aria-label="Live preview of the dashboard running the simulation scenario">
      <div className="panel-head">
        <span className="label">Live preview</span>
        <span className="text-[12px] text-muted">Simulation scenario, Platform 2</span>
      </div>
      {snap ? (
        <div className="grid gap-2 p-2">
          <StatusCard snap={snap} />
          <div className="grid gap-2 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="relative aspect-video overflow-hidden bg-[#f6f5f1]" style={{ borderRadius: 2 }}>
              <SimulatedFeed countsRef={countsRef} running />
              <ZoneGrid snap={snap} />
            </div>
            <AlertsFeed alerts={snap.alerts} className="!min-h-0 max-md:h-48" />
          </div>
        </div>
      ) : (
        <div className="grid gap-2 p-2" aria-busy="true">
          <div className="skel h-[52px]" />
          <div className="skel aspect-video" />
        </div>
      )}
    </figure>
  )
}
