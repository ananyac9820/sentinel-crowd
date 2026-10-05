import { useCallback, useEffect, useRef, useState } from 'react'
import { UploadIcon, PlayIcon, PauseIcon, AlertIcon } from '../components/Icons.jsx'
import { getDetector } from '../lib/detector.js'
import { Tracker } from '../lib/tracker.js'

const DETECT_MS = 500
const SLOW_LOAD_MS = 60000
// Phones and tablets get both cameras; laptops get their webcam.
const IS_MOBILE =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
const CAMERAS = IS_MOBILE
  ? [
      { id: 'cam-back', label: 'Back camera', kind: 'webcam', facing: 'environment' },
      { id: 'cam-front', label: 'Front camera', kind: 'webcam', facing: 'user' },
    ]
  : [{ id: 'cam-front', label: 'Webcam (this laptop)', kind: 'webcam', facing: 'user' }]
const otherCamera = (id) => (id === 'cam-back' ? 'cam-front' : 'cam-back')

function friendlyModelError(err) {
  const msg = String(err?.message || err)
  if (!navigator.onLine || /fetch|network|Failed to load|404/i.test(msg))
    return {
      title: 'Could not download the AI model',
      detail:
        'This device looks offline, or the network is blocking the model server. Connect to the internet once. After that the model is cached on this device.',
    }
  if (/webgl|backend/i.test(msg))
    return { title: 'The AI engine could not start', detail: 'This browser could not start WebGL. Try Chrome or Edge with hardware acceleration turned on.' }
  return { title: 'The AI model failed to load', detail: msg.slice(0, 160) }
}

// Full-feed message used for errors and empty states.
function Notice({ tone = 'neutral', title, children, actions }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-panel p-6">
      <div className="w-full max-w-md">
        {tone === 'error' && (
          <p className="label mb-1 flex items-center gap-1.5 text-warn">
            <AlertIcon size={12} /> Problem
          </p>
        )}
        <p className="text-[15px] font-bold text-fg">{title}</p>
        <div className="mt-1 text-[13px] leading-relaxed text-muted">{children}</div>
        <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
      </div>
    </div>
  )
}

// Skeleton of the camera view: 4x3 grid of placeholder blocks with a status line.
function FeedSkeleton({ message, action }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-panel p-2" aria-busy="true">
      <div className="grid flex-1 grid-cols-4 grid-rows-3 gap-1.5">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="skel" style={{ animationDelay: `${(i % 4) * 0.12}s` }} />
        ))}
      </div>
      <div className="flex items-center gap-3 pt-2">
        <span className="text-[13px] text-fg">{message}</span>
        <span className="ml-auto">{action}</span>
      </div>
    </div>
  )
}

// Live Detection: COCO-SSD person detection on an uploaded video or webcam, sampled every
// 500 ms. Reports each person's position (0..1) and, when tracked, their velocity.
export default function useLiveDetection({ active, onPeople, onSourceChange, onSwitchToSim }) {
  const videoRef = useRef(null)
  const fileRef = useRef(null)
  const streamRef = useRef(null)
  const trackerRef = useRef(null)
  if (!trackerRef.current) trackerRef.current = new Tracker()
  const onPeopleRef = useRef(onPeople)
  onPeopleRef.current = onPeople
  const onSourceChangeRef = useRef(onSourceChange)
  onSourceChangeRef.current = onSourceChange

  const [model, setModel] = useState(null)
  const [modelInfo, setModelInfo] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)

  const [sources, setSources] = useState(CAMERAS)
  const [sourceId, setSourceId] = useState(null)
  const [feedError, setFeedError] = useState(null)
  const [videoLoading, setVideoLoading] = useState(false)
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
        detail: 'The network or this device seems slow. It will keep loading in the background, or you can switch to Simulation now.',
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
    trackerRef.current.reset()
    if (active) onSourceChangeRef.current?.() // a new camera starts a fresh analysis
    setFeedError(null)
    setPaused(false)
    const src = sourcesRef.current.find((s) => s.id === sourceId)
    if (!v || !active || !src) return setVideoLoading(false)
    let stale = false
    setVideoLoading(true)

    if (src.kind === 'file') {
      v.srcObject = null
      v.src = src.url
      v.play().catch(() => {})
    } else if (!navigator.mediaDevices?.getUserMedia) {
      setVideoLoading(false)
      setFeedError('This browser does not allow camera access on this page. Webcams need HTTPS or localhost. Upload an MP4 instead.')
    } else {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: src.facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        .then((stream) => {
          if (stale) return stream.getTracks().forEach((t) => t.stop())
          streamRef.current = stream
          v.removeAttribute('src')
          v.srcObject = stream
          v.play().catch(() => {})
        })
        .catch((e) => {
          setVideoLoading(false)
          setFeedError(
            e?.name === 'NotAllowedError'
              ? 'Camera permission was blocked. Allow camera access in the address bar, or upload an MP4.'
              : 'No webcam was found. Upload an MP4 instead.',
          )
        })
    }
    return () => {
      stale = true
      stopStream()
      v.pause()
    }
  }, [sourceId, active])

  // ---- Detection loop: every 500 ms, not every frame ----
  useEffect(() => {
    if (!active || !model || !sourceId) return
    let busy = false
    let stopped = false
    // The front camera is shown mirrored like a video call, so mirror detections to match.
    const mirrored = sourcesRef.current.find((s) => s.id === sourceId)?.facing === 'user'
    const id = setInterval(async () => {
      const v = videoRef.current
      if (busy || !v || v.readyState < 2 || v.paused || v.ended || !v.videoWidth) return
      busy = true
      try {
        const preds = await model.detect(v, 100, 0.3)
        if (stopped) return
        const W = v.videoWidth
        const H = v.videoHeight
        const bx = []
        const points = []
        for (const p of preds) {
          if (p.class !== 'person') continue
          const [rawX, y, w, h] = p.bbox
          const x = mirrored ? W - rawX - w : rawX
          bx.push({ x: x / W, y: y / H, w: w / W, h: h / H })
          points.push({ x: (x + w / 2) / W, y: (y + h / 2) / H })
        }
        // Video time, so slow frames and pauses don't distort speeds.
        const people = trackerRef.current.update(points, v.currentTime, W / H)
        setBoxes(bx)
        onPeopleRef.current(people)
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

  // Release the webcam when leaving the dashboard.
  useEffect(() => () => stopStream(), [])

  const onFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('video/')) return setFeedError('That file is not a video. Please choose an MP4.')
    const n = sources.filter((s) => s.kind === 'file').length + 1
    const s = { id: `file-${Date.now()}`, label: `CAM-0${n} ${file.name}`, kind: 'file', url: URL.createObjectURL(file) }
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
  const showGrid = ready && !!current && !feedError && !videoLoading

  const fileInput = <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onFile} />
  const upload = (primary) => (
    <button className={`btn ${primary ? 'btn-primary' : ''}`} onClick={() => fileRef.current?.click()}>
      <UploadIcon size={12} /> Upload MP4
    </button>
  )
  const toSim = (primary) => (
    <button className={`btn ${primary ? 'btn-primary' : ''}`} onClick={onSwitchToSim}>
      Switch to Simulation
    </button>
  )

  const controls = (
    <>
      {fileInput}
      <span className="num hidden whitespace-nowrap text-[11px] text-dim 2xl:inline" title={modelInfo ? `Backend: ${modelInfo.backend}` : undefined}>
        {ready ? (modelInfo?.cached ? 'Model ready, cached' : 'Model ready') : status === 'loading' ? 'Loading model' : 'Model not loaded'}
      </span>
      <select
        value={sourceId ?? ''}
        onChange={(e) => setSourceId(e.target.value || null)}
        className="h-7 max-w-[180px] border border-line-strong bg-raised px-1.5 text-[12px] text-fg"
        style={{ borderRadius: 2 }}
        aria-label="Camera source"
      >
        <option value="">Select camera</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      {current?.kind === 'file' && (
        <button className="btn w-[70px] justify-center" onClick={togglePlay}>
          {paused ? <PlayIcon size={12} /> : <PauseIcon size={12} />} {paused ? 'Play' : 'Pause'}
        </button>
      )}
      {IS_MOBILE && current?.kind === 'webcam' && (
        <button className="btn" onClick={() => setSourceId(otherCamera(current.id))} title="Switch between front and back camera">
          Switch to {current.id === 'cam-back' ? 'front' : 'back'}
        </button>
      )}
      {upload(false)}
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
        style={current?.facing === 'user' ? { transform: 'scaleX(-1)' } : undefined}
        onLoadedMetadata={(e) => e.target.videoWidth && setAspect(e.target.videoWidth / e.target.videoHeight)}
        onLoadedData={() => setVideoLoading(false)}
        onPlaying={() => setVideoLoading(false)}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onError={() => {
          if (current?.kind !== 'file') return
          setVideoLoading(false)
          setFeedError('This video cannot be played in the browser. Try an H.264 MP4.')
        }}
      />
      {showGrid &&
        boxes.map((b, i) => (
          <div
            key={i}
            className="pointer-events-none absolute border border-[#ffffffcc] outline outline-1 outline-[#00000066]"
            style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
          />
        ))}
    </>
  )

  let overlay = null
  if (status === 'loading' || status === 'idle') {
    overlay = <FeedSkeleton message={statusMsg || 'Loading AI model…'} action={toSim(false)} />
  } else if (status === 'error') {
    overlay = (
      <Notice
        tone="error"
        title={error?.title}
        actions={
          <>
            {toSim(true)}
            <button className="btn" onClick={() => setRetry((r) => r + 1)}>
              Try again
            </button>
          </>
        }
      >
        {error?.detail}
      </Notice>
    )
  } else if (feedError) {
    overlay = (
      <Notice
        tone="error"
        title="This camera cannot be shown"
        actions={
          <>
            {upload(true)}
            {toSim(false)}
          </>
        }
      >
        {feedError}
      </Notice>
    )
  } else if (!current) {
    overlay = (
      <Notice
        title="AI model ready. Choose a camera."
        actions={
          <>
            {upload(true)}
            {CAMERAS.map((c) => (
              <button key={c.id} className="btn" onClick={() => setSourceId(c.id)}>
                {IS_MOBILE ? `Use ${c.label.toLowerCase()}` : 'Use webcam'}
              </button>
            ))}
          </>
        }
      >
        A high-angle or overhead crowd clip works best. People are counted into the 4x3 zone grid twice a second. The video stays on this device.
      </Notice>
    )
  } else if (videoLoading) {
    overlay = <FeedSkeleton message={current.kind === 'webcam' ? `Starting ${current.label.toLowerCase()}…` : 'Loading video…'} />
  }

  return {
    title: current ? current.label : null,
    aspect: current ? aspect : 16 / 9,
    showGrid,
    feed,
    overlay,
    controls,
    togglePlay,
  }
}
