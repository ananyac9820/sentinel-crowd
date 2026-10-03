import { ArrowRight, Eye, TrendingUp, BellRing } from 'lucide-react'
import Logo from './Logo.jsx'
import Footer from './Footer.jsx'
import { LEVELS } from '../lib/risk.js'

// Static preview grid for the hero: a platform with one zone heating up.
const PREVIEW = [0, 0, 1, 0, 0, 1, 3, 0, 0, 1, 2, 0]

export default function Landing({ onOpen }) {
  return (
    <div className="min-h-full flex flex-col bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.12),transparent_55%)]">
      <header className="mx-auto w-full max-w-6xl px-6 pt-6 flex items-center gap-3">
        <Logo />
        <span className="font-semibold tracking-tight">Sentinel Crowd</span>
        <span className="ml-auto text-xs text-slate-500">CuriousPARC 2026 · Behaviour analysis</span>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-12 grid gap-12 lg:grid-cols-[1.15fr_1fr] items-center">
        <div>
          <p className="label !text-accent-soft mb-4">Crowd-crush early warning</p>
          <h1 className="text-4xl sm:text-5xl xl:text-6xl font-extrabold tracking-tight leading-[1.05]">
            See a stampede forming
            <br />
            <span className="text-slate-400">before it happens.</span>
          </h1>
          <p className="mt-6 text-lg text-slate-400 max-w-xl leading-relaxed">
            Sentinel Crowd watches existing CCTV, measures crowd density zone by zone, and alerts police and event
            organisers the moment pressure starts building — at stations, temples and festivals.
          </p>
          <button
            onClick={onOpen}
            className="mt-9 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500 hover:gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
          >
            Open Live Dashboard <ArrowRight size={18} />
          </button>

          <div className="mt-12 grid sm:grid-cols-3 gap-5 max-w-2xl">
            {[
              [Eye, 'Watches CCTV', 'Counts people per zone in the browser.'],
              [TrendingUp, 'Spots surges', 'Flags rapid build-ups, not just full zones.'],
              [BellRing, 'Says what to do', 'Plain-English alerts with an action.'],
            ].map(([Icon, title, text]) => (
              <div key={title}>
                <Icon size={18} className="text-accent-soft" />
                <p className="mt-2 font-semibold text-sm">{title}</p>
                <p className="text-sm text-slate-500 leading-snug">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4 hidden lg:block">
          <div className="flex items-center justify-between mb-3">
            <span className="label">CAM-03 · Platform 2</span>
            <span className="text-xs font-bold rounded-md px-2 py-0.5" style={{ background: '#ef444422', color: '#ef4444' }}>
              CRITICAL
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 aspect-video">
            {PREVIEW.map((l, i) => (
              <div
                key={i}
                className="rounded-md border"
                style={{ background: `${LEVELS[l].color}${l ? '40' : '1a'}`, borderColor: `${LEVELS[l].color}55` }}
              />
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-ink-800 border-l-2 border-crit px-3 py-2 text-sm text-slate-300">
            Zone B3 density rising fast — 40% increase in 20s. Consider opening exit gate 2.
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 pb-6">
        <Footer />
      </footer>
    </div>
  )
}
