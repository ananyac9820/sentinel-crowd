import { useCallback, useEffect, useRef, useState } from 'react'
import { analyseCrowdState } from '../engine/crowdDecisionEngine.js'

// Runs the decision engine on the current snapshot, at most once every INTERVAL ms.
//
// Why throttle at all: the snapshot updates twice a second in simulation and on every detected
// frame in Live, while the full pipeline (graph, partition, sort, BFS, DFS, Dijkstra, max flow,
// min cut, greedy, two DPs, a binary search over max flows) takes a few milliseconds. Running it
// on every frame would be affordable but pointless -- a recommendation that changes faster than
// an operator can read it is not a recommendation. One second is slow enough to read and fast
// enough that the advice tracks the crowd.
//
// The backtracking search is deliberately NOT part of this: it rebuilds the flow network once per
// plan it keeps, so it runs only when the operator asks for it.

const INTERVAL = 1000
const HOLD = 20000 // how long a what-if result stays on screen before routine refreshes resume

export default function useDecision({ snap, settings, site, limits, enabled = true }) {
  const [decision, setDecision] = useState(null)
  const [whatIfBusy, setWhatIfBusy] = useState(false)
  const lastRunRef = useRef(0)
  const inputRef = useRef(null)
  inputRef.current = { snap, settings, site, limits }

  useEffect(() => {
    if (!enabled) {
      setDecision(null)
      return
    }
    const now = performance.now()
    if (now - lastRunRef.current < INTERVAL && decision) return
    lastRunRef.current = now
    try {
      setDecision(analyseCrowdState({ snap, settings, site, forecast: snap.forecast ?? [] }, { limits }))
    } catch (err) {
      // A decision failure must never take the monitoring screen down with it: the density model
      // and the alerts keep working without this layer.
      console.error('Decision engine failed', err)
      setDecision(null)
    }
    // `decision` is read above only to allow the very first run before the interval has elapsed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, settings, site, limits, enabled])

  // Clear the cached decision when the mode, site or zone layout changes, so stale advice is
  // never shown against a new configuration.
  useEffect(() => {
    lastRunRef.current = 0
  }, [site, settings, enabled])

  /** Runs the expensive combination search and merges it into the current decision. */
  const runWhatIf = useCallback(() => {
    const input = inputRef.current
    if (!input?.snap) return
    setWhatIfBusy(true)
    // Yield one frame so the button can show its busy state before the search blocks the thread.
    setTimeout(() => {
      try {
        setDecision(analyseCrowdState({ ...input, forecast: input.snap.forecast ?? [] }, { limits: input.limits, withBacktracking: true }))
        // Hold the search result on screen long enough to read it: the next routine refresh would
        // otherwise replace it within a second and the trace would vanish.
        lastRunRef.current = performance.now() + HOLD
      } catch (err) {
        console.error('What-if search failed', err)
      } finally {
        setWhatIfBusy(false)
      }
    }, 20)
  }, [])

  return { decision, runWhatIf, whatIfBusy }
}
