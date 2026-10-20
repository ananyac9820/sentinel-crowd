import { mmss } from '../engine/crowdDecisionEngine.js'

// A one-line summary of the algorithmic decision, shown on the Monitor tab under the status bar.
// It exists so the main screen shows WHAT TO DO and why, not only what is happening: the risk
// levels above it come from the density model, while everything here comes from the graph
// algorithms. Clicking through opens the Decision tab, where each stage is broken out.

export default function DecisionBar({ decision, onOpen }) {
  if (!decision) return null
  const d = decision
  const bottleneck = d.flow.bottlenecks[0]
  const action = d.recommendation.actions[0]

  return (
    <section className="panel flex flex-wrap items-stretch divide-line text-[12px] lg:divide-x" aria-label="Algorithmic decision">
      <Cell label="Evacuation capacity" value={`${Math.round(d.flow.maxFlow)}/min`} note="Max flow (Edmonds-Karp)" />
      <Cell label="Clearance" value={mmss(d.clearanceNow)} note={`${mmss(d.flow.evacSeconds)} queue + ${mmss(d.walkSeconds)} walk`} />
      <Cell
        label="Bottleneck"
        value={bottleneck ? bottleneck.label : 'none'}
        note={bottleneck ? `Min cut, ${bottleneck.capacity}/min` : 'No finite cut'}
        alert={Boolean(bottleneck)}
      />
      <Cell
        label="Safest route"
        value={d.route?.reachable ? d.route.safest.path.map((id) => d.graph.getNode(id).name).join(' ') : 'no exit reachable'}
        note={d.route?.reachable ? (d.route.differs ? 'Dijkstra: not the shortest route' : 'Dijkstra: also the shortest') : 'BFS found no route'}
        alert={!d.route?.reachable}
      />
      <div className="flex min-w-0 flex-1 basis-full flex-col justify-center gap-0.5 px-3 py-1.5 lg:basis-[280px]">
        <span className="label">Recommended action</span>
        {action ? (
          <>
            <span className="truncate text-[13px] font-bold" title={action.label}>
              {action.label}
            </span>
            <span className="num text-[11px] text-dim">
              Clearance {d.recommendation.beforeText} &rarr; {d.recommendation.afterText}
            </span>
          </>
        ) : (
          <span className="text-[12px] leading-snug text-muted">{d.warranted ? 'Nothing within the current effort budget helps.' : 'No action needed: every zone is below the WATCH density.'}</span>
        )}
      </div>
      <div className="flex items-center px-3 py-1.5">
        <button className="btn" onClick={onOpen}>
          How this was computed
        </button>
      </div>
    </section>
  )
}

function Cell({ label, value, note, alert }) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-1.5 lg:min-w-[132px] lg:max-w-[230px]">
      <span className="label">{label}</span>
      <span className="num truncate text-[13px] font-bold" style={alert ? { color: 'var(--color-crit)' } : undefined} title={String(value)}>
        {value}
      </span>
      <span className="truncate text-[11px] text-dim" title={note}>
        {note}
      </span>
    </div>
  )
}
