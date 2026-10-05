// Loads COCO-SSD once per page. After the first successful download the model is
// saved to IndexedDB, so later loads (e.g. on demo day) work without the network.

const CACHE_URL = 'indexeddb://sentinel-coco-ssd-v1'
// mobilenet_v2 finds noticeably more small/distant people than the "lite" variant,
// and the cache makes its bigger download a one-time cost.
const BASE = 'mobilenet_v2'
let modelPromise = null

async function loadModel(onStatus) {
  const [tf, cocoSsd] = await Promise.all([import('@tensorflow/tfjs'), import('@tensorflow-models/coco-ssd')])
  await tf.ready()

  try {
    const models = await tf.io.listModels()
    if (models[CACHE_URL]) {
      onStatus?.('Loading AI model from this device’s cache…')
      return { model: await cocoSsd.load({ base: BASE, modelUrl: CACHE_URL }), cached: true, backend: tf.getBackend() }
    }
  } catch {
    // Cache unavailable or corrupt, so fall through to a network load.
  }

  onStatus?.('Downloading AI model (first time only)…')
  const model = await cocoSsd.load({ base: BASE })
  try {
    await model.model.save(CACHE_URL)
  } catch {
    // Saving is best-effort; the browser HTTP cache still helps.
  }
  return { model, cached: false, backend: tf.getBackend() }
}

export function getDetector(onStatus) {
  if (!modelPromise) {
    modelPromise = loadModel(onStatus).catch((err) => {
      modelPromise = null // allow a retry
      throw err
    })
  }
  return modelPromise
}
