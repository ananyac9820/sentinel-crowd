import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Webcam, FlaskConical, RefreshCw, AlertTriangle, Loader2, Cpu, Pause, Play } from 'lucide-react'
import { getDetector } from '../lib/detector.js'
import { ROWS, COLS, ZONE_COUNT } from '../lib/risk.js'

const DETECT_MS = 500
const SLOW_LOAD_MS = 60000
const WEBCAM = { id: 'webcam', label: 'Webcam (this laptop)', kind: 'webcam' }

function friendlyModelError(err) {
  const msg = String(err?.message || err)
  if (!navigator.onLine || /fetch|network|Failed to load|404/i.test(msg))
    return {
      title: 'Couldn’t download the AI model',
      detail: 'This laptop looks offline or the network is blocking Google’s model server. Connect to the internet once — after that the model is cached on this laptop.',
    }
  if (/webgl|backend/i.test(msg))
    return { title: 'The AI engine couldn’t start', detail: 'This browser couldn’t start WebGL. Try Chrome or Edge with hardware acceleration enabled.' }
  return { title: 'The AI model failed to load', detail: msg.slice(0, 160) }
}

function Panel({ icon, title, children, actions }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-950/90 p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink-800">{icon}</div>
        <p className="font-semibold text-slate-100">{title}</p>
        <div className="mt-1.5 text-sm leading-relaxed text-slate-400">{children}</div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>
      </div>
    </div>
  )
}

// Live Detection: COCO-SSD person detection on an uploaded video or webcam,
// sampled every 500ms, people counted into the 4×3 zone grid.
export default function useLiveDetection({ active, onCounts, onSwitchToSim }) {
  const videoRef = useRef(null)
  const fileRef = useRef(null)
  const streamRef = useRef(null)
  const onCountsRef = useRef(onCounts)
  onCountsRef.current = onCounts

  const [model, setModel] = useState(null)
  const [modelInfo, setModelInfo] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)

  const [sources, setSources] = useState([WEBCAM])
  const [sourceId, setSourceId] = useState(null)
  const [feedError, setFeedError] = useState(null)
  const [aspect, setAspect] = useState(16 / 9)
  const [boxes, setBoxes] = useState([])
  const [paused, setPaused] = useState(false)
  const sourcesRef = useRef(sources)
  sourcesRef.current = sources

  // ---- Load the model the first time Live mode opens ----
  useEffect(() => {
    if (!active || model) return
    let cancelled = false
    setStatus('loading')
    setError(null)
    setStatusMsg('Loading AI model…')
    const slow = setTimeout(() => {
      if (cancelled) return
      setStatus('error')
      setError({
        title: 'The AI model is taking too long',
        detail: 'The network or this laptop seems slow. It will keep loading in the background — or switch to Simulation now.',
      })
    }, SLOW_LOAD_MS)
    getDetector((m) => !cancelled && setStatusMsg(m))
      .then((r) => {
        if (cancelled) return
        setModel(r.model)
        setModelInfo(r)
        setStatus('ready')
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        console.error(e)
        setStatus('error')
        setError(friendlyModelError(e))
      })
      .finally(() => clearTimeout(slow))
    return () => {
      cancelled = true
      clearTimeout(slow)
    }
  }, [active, model, retry])

  // ---- Attach the selected source to the <video> ----
  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    const v = videoRef.current
    setBoxes([])
    setFeedError(null)
    setPaused(false)
    const src = sourcesRef.current.find((s) => s.id === sourceId)
    if (!v || !active || !src) return
    let stale = false

    if (src.kind === 'file') {
      v.srcObject = null
      v.src = src.url
      v.play().catch(() => {})
    } else if (!navigator.mediaDevices?.getUserMedia) {
      setFeedError('This browser doesn’t allow camera access here. Upload an MP4 instead.')
    } else {
      navigator.mediaDevices
        .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        .then((stream) => {
          if (stale) return stream.getTracks().forEach((t) => t.stop())
          streamRef.current = stream
          v.removeAttribute('src')
          v.srcObject = stream
          v.play().catch(() => {})
        })
        .catch((e) =>
          setFeedError(
            e?.name === 'NotAllowedError'
              ? 'Camera permission was blocked. Allow camera access in the address bar, or upload an MP4.'
              : 'No webcam found. Upload an MP4 instead.',
          ),
        )
    }
    return () => {
      stale = true
      stopStream()
      v.pause()
    }
  }, [sourceId, active])

  // ---- Detection loop: every 500ms, not every frame ----
  useEffect(() => {
    if (!active || !model || !sourceId) return
    let busy = false
    let stopped = false
    const id = setInterval(async () => {
      const v = videoRef.current
      if (busy || !v || v.readyState < 2 || v.paused || v.ended || !v.videoWidth) return
      busy = true
      try {
        const preds = await model.detect(v, 100, 0.3)
        if (stopped) return
        const W = v.videoWidth
        const H = v.videoHeight
        const counts = Array(ZONE_COUNT).fill(0)
        const bx = []
        for (const p of preds) {
          if (p.class !== 'person') continue
          const [x, y, w, h] = p.bbox
          const col = Math.min(COLS - 1, Math.max(0, Math.floor(((x + w / 2) / W) * COLS)))
          const row = Math.min(ROWS.length - 1, Math.max(0, Math.floor(((y + h / 2) / H) * ROWS.length)))
          counts[row * COLS + col]++
          bx.push({ x: x / W, y: y / H, w: w / W, h: h / H })
        }
        setBoxes(bx)
        onCountsRef.current(counts)
      } catch (e) {
        console.error(e)
      } finally {
        busy = false
      }
    }, DETECT_MS)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [active, model, sourceId])

  // Release the webcam when leaving Live mode.
  useEffect(() => () => stopStream(), [])

  const onFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('video/')) return setFeedError('That file isn’t a video. Please choose an MP4.')
    const n = sources.filter((s) => s.kind === 'file').length + 1
    const s = { id: `file-${Date.now()}`, label: `CAM-0${n} · ${file.name}`, kind: 'file', url: URL.createObjectURL(file) }
    setSources((list) => [...list, s])
    setSourceId(s.id)
  }

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v || !v.src) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }, [])

  const current = sources.find((s) => s.id === sourceId)
  const ready = status === 'ready'
  const showGrid = ready && !!current && !feedError

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-850 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-ink-800 hover:text-white'
  const primary =
    'inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-500'
  const secondary =
    'inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-800 px-3.5 py-2 text-sm text-slate-200 hover:bg-ink-700'

  const fileInput = <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onFile} />

  const controls = (
    <>
      {fileInput}
      <span
        className="hidden xl:inline-flex items-center gap-1 text-[11px] text-slate-500"
        title={modelInfo ? `Backend: ${modelInfo.backend}` : undefined}
      >
        <Cpu size={12} />
        {ready ? (modelInfo?.cached ? 'Model ready · cached' : 'Model ready') : status === 'loading' ? 'Loading model…' : 'Model not loaded'}
      </span>
      <select
        value={sourceId ?? ''}
        onChange={(e) => setSourceId(e.target.value || null)}
        className="max-w-[220px] rounded-lg border border-white/10 bg-ink-850 px-2 py-1 text-xs text-slate-200 focus:border-accent focus:outline-none"
        aria-label="Camera source"
      >
        <option value="">Select camera…</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      {current?.kind === 'file' && (
        <button className={btn} onClick={togglePlay} aria-label={paused ? 'Play' : 'Pause'}>
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
      )}
      <button className={btn} onClick={() => fileRef.current?.click()}>
        <Upload size={13} /> Upload MP4
      </button>
    </>
  )

  const feed = (
    <>
      <video
        ref={videoRef}
        muted
        playsInline
        loop
        className="absolute inset-0 h-full w-full object-fill"
        onLoadedMetadata={(e) => e.target.videoWidth && setAspect(e.target.videoWidth / e.target.videoHeight)}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onError={() => current?.kind === 'file' && setFeedError('This video can’t be played in the browser. Try an H.264 MP4.')}
      />
      {showGrid &&
        boxes.map((b, i) => (
          <div
            key={i}
            className="pointer-events-none absolute rounded-[3px] border border-slate-100/60 bg-slate-100/5"
            style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
          />
        ))}
    </>
  )

  const toSim = (
    <button className={status === 'error' ? primary : secondary} onClick={onSwitchToSim}>
      <FlaskConical size={15} /> Switch to Simulation
    </button>
  )

  let overlay = null
  if (status === 'loading' || status === 'idle') {
    overlay = (
      <Panel icon={<Loader2 size={20} className="animate-spin text-accent-soft" />} title={statusMsg || 'Loading AI model…'} actions={toSim}>
        Person detection runs entirely in this browser. First load downloads the model; after that it’s cached on this laptop.
      </Panel>
    )
  } else if (status === 'error') {
    overlay = (
      <Panel
        icon={<AlertTriangle size={20} className="text-warn" />}
        title={error?.title}
        actions={
          <>
            {toSim}
            <button className={secondary} onClick={() => setRetry((r) => r + 1)}>
              <RefreshCw size={15} /> Try again
            </button>
          </>
        }
      >
        {error?.detail}
      </Panel>
    )
  } else if (feedError) {
    overlay = (
      <Panel
        icon={<AlertTriangle size={20} className="text-warn" />}
        title="Can’t show this camera"
        actions={
          <>
            <button className={primary} onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Upload MP4
            </button>
            {toSim}
          </>
        }
      >
        {feedError}
      </Panel>
    )
  } else if (!current) {
    overlay = (
      <Panel
        icon={<Cpu size={20} className="text-accent-soft" />}
        title="AI model ready — choose a camera"
        actions={
          <>
            <button className={primary} onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Upload CCTV clip (MP4)
            </button>
            <button className={secondary} onClick={() => setSourceId(WEBCAM.id)}>
              <Webcam size={15} /> Use webcam
            </button>
          </>
        }
      >
        Tip: an overhead or high-angle crowd clip works best. People are counted into the 4×3 zone grid twice a second.
      </Panel>
    )
  }

  return {
    title: current ? current.label : 'Live camera',
    aspect: current ? aspect : 16 / 9,
    showGrid,
    feed,
    overlay,
    controls,
    togglePlay,
  }
}
