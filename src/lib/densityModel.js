// Crowd density model for Live mode: DM-Count (Wang et al., NeurIPS 2020), pretrained on the
// ShanghaiTech crowd dataset, converted to ONNX (tools/density-model) and run in the browser with
// ONNX Runtime Web. Input: one video frame. Output: a density map whose sum is the head count.
//
// The model file is about 82 MB. After the first download it is kept in the browser's Cache Storage,
// so later loads (e.g. on demo day) work offline.
import { toModelInput, totalCount } from './density.js'

const MODEL_URL = import.meta.env.VITE_DENSITY_MODEL_URL || `${import.meta.env.BASE_URL}models/dm-count-shb.onnx`
const CACHE_NAME = 'sentinel-models-v1'
// Long side of the image fed to the model. The short side follows the video's aspect ratio, so a
// portrait phone clip is not squashed (that would shrink every person and wreck the count).
// Both sides are multiples of 16, which the network needs. See tools/density-model/README.md.
export const DENSITY_LONG_SIDE = 768

export function densityInputSize(videoWidth, videoHeight, longSide = DENSITY_LONG_SIDE) {
  const scale = longSide / Math.max(videoWidth, videoHeight)
  return {
    width: Math.max(16, Math.round((videoWidth * scale) / 16) * 16),
    height: Math.max(16, Math.round((videoHeight * scale) / 16) * 16),
  }
}

let sessionPromise = null

async function readWithProgress(res, onStatus) {
  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  const out = new Uint8Array(total)
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out.set(value, got)
    got += value.length
    onStatus?.(`Downloading crowd density model (first time only)… ${Math.round((got / total) * 100)}%`)
  }
  return out
}

async function modelBytes(onStatus) {
  let cache = null
  try {
    cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(MODEL_URL)
    if (hit) {
      onStatus?.('Loading crowd density model from this device’s cache…')
      return { bytes: new Uint8Array(await hit.arrayBuffer()), cached: true }
    }
  } catch {
    // Cache Storage unavailable (private window): fall back to the network every time.
  }
  onStatus?.('Downloading crowd density model (first time only)…')
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`Crowd density model not found at ${MODEL_URL} (HTTP ${res.status})`)
  const bytes = await readWithProgress(res, onStatus)
  try {
    await cache?.put(MODEL_URL, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }))
  } catch {
    // Saving is best-effort.
  }
  return { bytes, cached: false }
}

async function load(onStatus) {
  const ort = await import('onnxruntime-web/webgpu')
  // Single-threaded WebAssembly unless the page is cross-origin isolated (needed for threads).
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1
  const { bytes, cached } = await modelBytes(onStatus)
  onStatus?.('Starting crowd density model…')
  // WebGPU (graphics card) is much faster; WebAssembly (CPU) is the fallback.
  const providers = 'gpu' in navigator ? ['webgpu', 'wasm'] : ['wasm']
  let session
  let backend = providers[0]
  try {
    session = await ort.InferenceSession.create(bytes, { executionProviders: providers, graphOptimizationLevel: 'all' })
  } catch (e) {
    console.warn('WebGPU unavailable for the density model, using WebAssembly', e)
    backend = 'wasm'
    session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
  }
  return { ort, session, cached, backend }
}

export function getDensityModel(onStatus) {
  if (!sessionPromise) {
    sessionPromise = load(onStatus).catch((err) => {
      sessionPromise = null // allow a retry
      throw err
    })
  }
  return sessionPromise
}

let canvas = null

/** Runs the model on the current video frame. Returns the density map and the total count. */
export async function estimateDensity({ ort, session }, video) {
  const { width, height } = densityInputSize(video.videoWidth, video.videoHeight)
  if (!canvas) canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, width, height)
  const pixels = ctx.getImageData(0, 0, width, height).data
  const input = new ort.Tensor('float32', toModelInput(pixels, width, height), [1, 3, height, width])
  const t0 = performance.now()
  const result = await session.run({ image: input })
  const ms = performance.now() - t0
  const out = result.density
  const density = out.data instanceof Float32Array ? out.data : Float32Array.from(out.data)
  const [, , h, w] = out.dims
  input.dispose?.()
  return { density, w, h, count: totalCount(density), ms }
}
