// Observed runtime. Browsers round performance.now() (often to 0.1 ms) and these graphs are small,
// so one run would read as 0. We repeat the call until at least `minMs` has passed and report the
// average per run. This is an OBSERVATION on this machine, not a proof of Big-O.
const now = () => (globalThis.performance ? performance.now() : Date.now())

export function timeIt(fn, { minMs = 4, maxRuns = 5000 } = {}) {
  let runs = 0
  const start = now()
  let elapsed = 0
  do {
    fn()
    runs++
    elapsed = now() - start
  } while (elapsed < minMs && runs < maxRuns)
  return { ms: elapsed / runs, runs }
}
