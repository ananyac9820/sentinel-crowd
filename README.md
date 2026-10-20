# Sentinel Crowd

**AI detects the crowd state; algorithms determine the optimal response.**

Sentinel Crowd is a crowd-safety system for existing CCTV cameras. Computer vision answers *what is
happening* — how many people are in each zone and which way they are moving. Everything after that
is an algorithmic decision problem, and that is where the system's real work is done: the site is
modelled as a weighted directed graph, and graph traversal, shortest paths, network flow, greedy
selection, dynamic programming and backtracking turn the crowd state into a specific, justified
recommendation with computed numbers attached.

Course project for **CS3212 — Design and Analysis of Algorithms**. Originally built for CuriousPARC
2026, Theme 3: Computer Vision, Behaviour Analysis and Scene Understanding.

---

## 1. Problem statement

A crowd crush kills people in open space, in seconds, with no warning that a person standing inside
it can perceive. By the time density is visibly dangerous, the people in the middle have already
lost the ability to move. Stations, stadiums, religious gatherings and street events all have
cameras watching the crowd, and all of them rely on a human to look at the right screen at the right
moment and then decide — correctly, under pressure, in seconds — which gate to open.

Detection alone does not solve this. Suppose a system reliably reports "Zone B3 is at crush
density". That still leaves the questions that actually matter:

- Can those people even reach an exit, or has the congestion sealed them in?
- Which route should they be sent along — the nearest exit may be through the worst of the crush.
- How many people per minute can this site actually get out right now?
- Which link is the thing limiting that number? Widening the wrong corridor achieves nothing.
- Of the actions available, which ones, in which order, under the staff we have?
- How many people should go to each exit?

Every one of those is a computational problem on a graph, and every one has a known algorithm with a
known complexity. That is the contribution of this project.

## 2. Motivation: why crowd management is an algorithmic problem

The site is a **network**. Zones are connected by corridors with finite width; gates have finite
throughput; people move between them. That is a graph, and crowd movement through it is a flow.
Once you accept that model, the operational questions stop being judgement calls and become standard
problems with provable answers:

| Operational question | Formal problem |
| --- | --- |
| Can these people get out at all? | Reachability in a graph (BFS/DFS) |
| How many areas must they cross? | Fewest-edge path (BFS) |
| Which way should we send them? | Single-source shortest path with a composite cost (Dijkstra) |
| Which adjacent zones are one dangerous body of crowd? | Connected components (DFS) |
| How many people per minute can leave? | Maximum s-t flow (Edmonds-Karp) |
| What is limiting that? | Minimum cut |
| Would closing this corridor trap anyone? | Reachability after edge removal (DFS) |
| What should we do first? | Greedy selection by value density |
| What is the *best* set of actions for our budget? | 0/1 knapsack (DP) |
| How many people to each exit? | Makespan minimisation (DP) |
| Which combination of interacting actions is best? | Backtracking with branch and bound |

The minimum cut deserves special mention, because it is the clearest case of an algorithm producing
an insight a heuristic cannot. Ranking corridors by congestion points at whichever corridor looks
worst. But a congested corridor with a parallel alternative is **not** a bottleneck — flow simply
reroutes around it, and widening it changes nothing. The minimum cut is the set of links the whole
site is genuinely stuck behind, and by the max-flow min-cut theorem, widening anything outside that
cut *provably cannot* increase throughput. "Open an alternative staircase" becomes a conclusion
rather than a guess.

## 3. System architecture

```
  CCTV camera / uploaded video / simulation
                 |
                 v
     DETECTION LAYER     src/lib/detector.js, tracker.js, hooks/useLiveDetection.jsx
     TensorFlow.js person detection, short-lived anonymous tracking
                 |   "what is happening"
                 v
     DATA / MODEL LAYER  src/lib/zones.js, risk.js, simulation.js, site.js
     per-zone counts, density levels, surge, forecast, turbulence, counter-flow
                 |
                 v
     GRAPH BUILDER       src/engine/crowdGraphBuilder.js
     weighted directed graph: zones, corridors, gates, exits, entries
                 |
                 v
     DAA ALGORITHM LAYER src/algorithms/**
     sorting, searching, divide and conquer, BFS, DFS, Dijkstra,
     max flow, min cut, greedy, DP, backtracking
                 |
                 v
     DECISION LAYER      src/engine/crowdDecisionEngine.js, interventionEngine.js, riskEngine.js
     candidate actions, optimisation, selection
                 |   "what should we do"
                 v
     VISUALISATION       src/components/DecisionBar, DecisionPanel, AlgorithmLab, GraphView
```

The layers are separated deliberately. Everything in `src/algorithms/` is plain JavaScript with no
React, no DOM and no knowledge of crowds — it is independently testable, and it is tested. Everything
in `src/engine/` knows about crowds but not about rendering. No algorithm code lives in a component.

### The pipeline, in order

`analyseCrowdState()` in `src/engine/crowdDecisionEngine.js` runs this on every crowd snapshot:

1. **Build the graph** from zones, counts and the site configuration.
2. **Quadtree partition** (divide and conquer) — find the *region* under the most pressure, which
   selects the focus zone the rest of the pipeline examines.
3. **Merge sort** — rank zones by danger score.
4. **Binary search** — place the focus zone's density in its risk band.
5. **BFS** — which exits are reachable, and in how few zone transitions.
6. **DFS** — group adjacent congested zones into contiguous dangerous regions.
7. **Dijkstra** — the safest route out, plus the distance-only route for comparison.
8. **Edmonds-Karp** — maximum evacuation throughput in people per minute.
9. **Minimum cut** — the links limiting that throughput.
10. **Candidate generation** — actions derived *from the cut*, not from a fixed list.
11. **Greedy** — the fast prioritised plan.
12. **Knapsack DP** — the optimal set for the same budget, as the yardstick for greedy.
13. **Exit allocation DP** — how many people to send to each exit.
14. **Binary search on the answer** — the minimum extra capacity meeting the clearance target.
15. **Backtracking** (on request) — the best *interacting* combination of actions.

The whole pipeline runs in a few milliseconds; the Decision tab reports each stage's measured time.

## 4. Algorithms used

### Sorting — ranking zones by danger
`src/algorithms/sorting/mergeSort.js`, `quickSort.js`

Both are implemented by hand; neither calls `Array.sort`. Merge sort drives the live ranking
because it is **stable** (equal-risk zones keep their order instead of flickering between frames)
and because its O(n log n) bound holds on every input — including the nearly-sorted input that
consecutive frames produce, which is exactly quick sort's O(n²) worst case. Quick sort is offered
in the Algorithm Lab for comparison, with median-of-three pivoting, and the lab also runs it with
last-element pivoting on sorted input so the quadratic blow-up is visible in measured numbers.

### Searching — risk bands, and the capacity question
`src/algorithms/searching/binarySearch.js`

`lowerBound` places a density into its risk band; this replaces the if-chain in `lib/risk.js`, so
the band list is data rather than code. More interestingly, `binarySearchPredicate` searches the
**answer space**: "what is the smallest extra exit capacity that brings clearance under the target?"
There is no array involved — only the fact that more capacity can never make evacuation slower, so
the predicate is monotone. That reduces about 2000 max-flow evaluations to about eleven.

### Divide and conquer — which region is worst
`src/algorithms/divideAndConquer/spatialPartition.js`

**Divide** the camera view into quadrants, **conquer** each independently down to a single zone,
**combine** by adding the children's people and computing each region's *own* density. The combine
step is what earns the recursion: three adjacent zones each at 70% of critical are more dangerous
than one at 95% with calm neighbours, and only a region-level view detects that. The hottest region
chooses the zone the route search starts from, so this is not decorative.

### Graph — the model everything shares
`src/algorithms/graph/Graph.js`

Adjacency list, because a station is sparse: a zone touches a handful of neighbours regardless of
how many zones exist, so E is O(V) in practice. A matrix would cost O(V²) memory and turn every
O(V + E) traversal into O(V²). Directed, because a one-way staircase or an exit-only gate needs an
edge in one direction only.

Each edge carries distance (m), walk time (s, from a speed-density relation), capacity
(people/min, from width × specific flow, reduced by congestion), congestion (0–1), risk (0–1) and
the derived Dijkstra cost. All physical assumptions sit in one `MODEL` block in
`crowdGraphBuilder.js` so they can be argued with.

### BFS and DFS
`src/algorithms/graph/bfs.js`, `dfs.js`

BFS uses a hand-written **Queue** with a moving read index — `Array.shift()` is O(n), which would
make a BFS O(V²) and hide its real O(V + E) behaviour. It answers reachability and fewest-transition
routes. DFS uses an explicit **Stack**, and answers connectedness: contiguous dangerous regions as
connected components, and whether closing a link would strand a zone.

### Dijkstra — the safest route
`src/algorithms/graph/dijkstra.js`

Hand-written binary **MinHeap** as the priority queue. Edge costs are non-negative by construction,
which is precisely Dijkstra's precondition and what makes its greedy settle step sound.

The cost is **not** distance:

```
cost = 1.0 × (distance / 40 m) + 2.5 × congestion + 4.0 × risk
```

The same algorithm is then run a second time with a distance-only weight, and the two routes are
shown side by side. When they differ, the system states plainly that the shortest physical route is
not the safest one, with the cost difference that caused it.

### Max flow and min cut — the central feature
`src/algorithms/flow/FlowNetwork.js`, `edmondsKarp.js`, `fordFulkerson.js`, `minCut.js`

The flow network sends a super source into every occupied zone, carries people/min along corridors
and gate approaches, and drains each gate into a super sink at its own throughput. Source edges are
left unbounded on purpose: capping them by occupancy would put the cut on the zones themselves,
which staff cannot widen.

**Edmonds-Karp** (BFS augmenting paths) computes the maximum, and the Decision tab lists every
augmenting path. **Ford-Fulkerson** with DFS paths is also implemented, to show that correctness
comes from the residual-network argument rather than from the path choice — both return the same
maximum, and only the augmentation count differs. The **minimum cut** is then read off the residual
graph in one BFS, and becomes the ranked bottleneck list that drives the recommendation.

### Greedy — the fast plan
`src/algorithms/optimization/greedyIntervention.js`

Takes the best remaining risk-reduction-per-cost action at each step. Chosen because a developing
crush demands a plan readable in seconds, and because greedy produces an *order* ("open Gate 2
first, then pause entry") rather than just a set.

The README and the UI both state the limitation rather than hiding it: **greedy selects the best
local option at each step and may not produce the globally optimal solution.** It is a 0/1 knapsack,
and the ratio rule is not optimal for it. With a budget of 10 and actions A (reduction 6, cost 5)
and B (reduction 10, cost 10), greedy takes A on its better ratio and then cannot afford B, scoring
6 where the optimum is 10. That exact case is a unit test.

### Dynamic programming
`src/algorithms/optimization/knapsackDP.js`, `evacuationDP.js`

**0/1 knapsack** — the optimal action set for the budget, computed alongside greedy so the gap is
shown rather than claimed.

- State: `dp[i][b]` = best risk reduction from the first *i* interventions using at most *b* effort
- Transition: `dp[i][b] = max(dp[i-1][b], dp[i-1][b - cost_i] + value_i)`
- Base: `dp[0][b] = 0` for all *b*
- Answer: `dp[n][B]`, with the set recovered where `dp[i][b] ≠ dp[i-1][b]`
- O(nB) time and space — *pseudo*-polynomial, since B is a value and not an input length

**Exit allocation** — how many people to send to each exit. Queues drain in parallel, so the site
clears when the *last* exit finishes: a makespan objective.

- State: `dp[j][p]` = smallest achievable clearance using exits *j..m-1* for *p* blocks of people
- Transition: `dp[j][p] = min over a=0..p of max(delay_j + a·block/cap_j, dp[j+1][p-a])`
- Base: `dp[m][0] = 0`; `dp[m][p] = ∞` for *p* > 0 (people with nowhere to go)
- Answer: `dp[0][K]`, replayed through a stored choice table
- O(m·K²) time, O(m·K) space, K = ⌈people / blockSize⌉

The naive alternative — splitting people in proportion to capacity — ignores opening delays, and
the engine reports both clearance times so the improvement is a measured number.

### Backtracking — what-if planning
`src/algorithms/optimization/backtracking.js`

Greedy and the knapsack DP both score an action by a value fixed in advance. But actions
**interact**: a second staircase adds nothing if the corridor feeding it is the real bottleneck.
That makes the objective non-decomposable, so there are no per-item values for a DP to add up, and
the only honest score for a *set* is to rebuild the flow network with the whole set applied.

The exponential cost is reported, not hidden: with *n* actions the tree has 2ⁿ leaves, and the UI
shows the search space, the nodes visited and the prune counts. Three pruning rules keep it
tractable:

1. **Infeasible prefix** — cost and staff only grow, so an over-budget prefix prunes its subtree.
2. **Branch and bound** — adding capacity never slows evacuation, so the clearance with *all*
   remaining candidates added is an optimistic (admissible) bound. If even that cannot beat the
   incumbent, cut the subtree. A unit test asserts that pruning does not change the answer.
3. **Safety** — a plan that strands a zone is rejected outright.

## 5. Data structures

| Structure | Implementation | Why not the shortcut |
| --- | --- | --- |
| Adjacency-list graph | `graph/Graph.js` | A matrix is O(V²) memory and makes traversals O(V²) on a sparse layout |
| FIFO queue | `dataStructures/Queue.js` | `Array.shift()` is O(n), which would make BFS O(V²) |
| LIFO stack | `dataStructures/Stack.js` | Recursion can overflow the call stack on a deep graph |
| Binary min-heap | `dataStructures/MinHeap.js` | Array scanning makes Dijkstra O(V²) instead of O((V+E) log V) |
| Residual flow network | `flow/FlowNetwork.js` | Paired reverse edges are what let an augmenting path undo an earlier routing choice |
| Quadtree | `divideAndConquer/spatialPartition.js` | A flat per-zone maximum cannot see a dangerous *region* |
| DP tables | `optimization/*DP.js` | Plain recursion recomputes overlapping subproblems exponentially often |

## 6. Algorithm mapping and complexity

| DAA concept | Sentinel application | Best | Average | Worst | Space |
| --- | --- | --- | --- | --- | --- |
| Merge sort | Rank dangerous zones | O(n log n) | O(n log n) | O(n log n) | O(n) |
| Quick sort | Same ranking, for comparison | O(n log n) | O(n log n) | **O(n²)** | O(log n) avg |
| Binary search | Density → risk band | O(1) | O(log n) | O(log n) | O(1) |
| Binary search on the answer | Minimum extra exit capacity | O(1) | O(log R) max-flow runs | O(log R) runs | O(1) |
| Quadtree partition | Which region is worst | O(n) | O(n log n) | O(n log n) | O(n) |
| BFS | Reachable exits, fewest transitions | O(V+E) | O(V+E) | O(V+E) | O(V) |
| DFS | Contiguous dangerous regions; stranding check | O(V+E) | O(V+E) | O(V+E) per run; O(V(V+E)) for the closure check | O(V) |
| Dijkstra | Safest evacuation route | O((V+E) log V) | O((V+E) log V) | O(E log V) with lazy deletion | O(V+E) |
| Greedy | Fast intervention ordering | O(n log n) | O(n log n) | O(n log n) | O(n) |
| 0/1 knapsack DP | Optimal intervention set | O(nB) | O(nB) | O(nB) pseudo-polynomial | O(nB) |
| Exit allocation DP | People per exit (makespan) | O(mK²) | O(mK²) | O(mK²) | O(mK) |
| Backtracking | What-if combinations | O(n) if bounded early | input dependent | **O(2ⁿ)** evaluations | O(n) |
| Edmonds-Karp | Evacuation throughput | O(E) | O(VE²) | O(VE²) | O(V+E) |
| Ford-Fulkerson | Same maximum, DFS paths | O(E) | O(E·maxFlow) | O(E·maxFlow) | O(V+E) |
| Min cut | Bottleneck identification | O(V+E) | O(V+E) | O(V+E) on top of the flow | O(V) |
| Binary min-heap | Dijkstra's priority queue | O(1) peek | O(log n) | O(log n) | O(n) |
| FIFO queue | BFS frontier | O(1) | O(1) amortised | O(1) amortised | O(n) |

The same table is generated from `src/algorithms/analysis/complexity.js` and shown in the app, so
the documentation and the UI cannot drift apart.

## 7. Algorithm comparison and the performance experiment

The **Algorithm Lab** tab (`Algorithms`) runs every algorithm on the *live* crowd graph, so the
demonstrations are of the real system rather than toy data. For each it shows the problem, the
input, the output, the theoretical complexity, the measured runtime and the exact operation counts
its own counters recorded.

Comparisons it makes concrete:

- **Merge vs quick sort** on the same zone data: comparisons, data moves, recursion depth, and
  whether the two orders agree.
- **Greedy vs knapsack DP** on the same intervention catalogue and budget, with the gap in risk
  points stated either way.
- **DP vs proportional split** for exit allocation, with both clearance times.
- **Edmonds-Karp vs Ford-Fulkerson** on the same network: same maximum, different path counts.
- **Safest vs shortest route** from any zone, with the cost breakdown per edge.

The **Performance experiment** section sweeps input sizes 100 / 500 / 1000 / 5000 / 10000 on
synthetic inputs generated from a fixed seed, so both algorithms see byte-identical data. Each size
is timed five times and the median reported, so one garbage-collection pause cannot dominate.

> **Theoretical complexity and observed runtime are labelled separately throughout, and the app says
> so explicitly.** A measured time is evidence about one machine, one JIT and one input; it cannot
> prove an asymptotic bound, since Big-O describes growth as n → ∞ with constants discarded. What
> the ratio column *can* show is whether observed growth is consistent with the analysis: an
> O(n log n) algorithm should take slightly more than 2× longer when n doubles, an O(n²) one about
> 4×. The counted-operations column is exact and machine independent, so it is the stronger
> evidence.

## 8. Worked real-world scenario

The default 90-second simulation: evening rush on Platform 2, a delayed train announced, the crowd
funnelling toward the staircase (B3), then passengers pushing up the stairs against the flow.

As the crowd builds, the pipeline produces output of this shape — every number computed, none
hard-coded:

> **B3 is at CRITICAL density (133% of the crush threshold).**
> - Evacuation capacity now: 371 people per minute for 112 people. Clearance is about 49 s: 18 s of
>   queueing at the exits plus 31 s to walk the safest route.
> - Minimum cut: 3 links limit the whole site. The tightest is C2 to Gate 2 at 119 people per minute.
> - Depth-first search groups B2, B3, C3 into one dangerous region holding 52 people, so they have
>   to be treated together.
> - Safest route from B3: B3 → B4 → C4 → Gate 3.
> - Recommended now: Pause entry at Footbridge stairs, then Add a lane at Gate 1. Predicted
>   clearance afterwards: 45 s (453 people per minute).
> - Greedy scored 41 estimated risk points; the dynamic-programming optimum for the same budget
>   scores 44. Greedy picks the best value at each step and is not guaranteed to match that.
> - Exit allocation (dynamic programming): 56 to Gate 2, 56 to Gate 3, clearing in 20 s. Splitting
>   people in proportion to capacity instead would take 57 s, so the allocation saves 36 s.

Where an algorithm has nothing to contribute on a given frame, the system says so rather than
inventing a benefit: when the usable exits have equal capacity and no opening delay, an even split
is already optimal and the app states that the allocation DP only earns its keep once capacities or
delays differ.

## 9. Heuristic vs algorithmic — what is which

This distinction is maintained carefully, in the code and in the UI.

**Heuristic / model estimates** (reasoned, not proved):
- the density thresholds and the turbulence and counter-flow formulas in `lib/risk.js`
- the zone danger score in `engine/riskEngine.js`
- each intervention's estimated risk reduction and cost
- the physical constants in `MODEL` (walking speed, specific flow, assumed site width)

**Algorithmic results** (correct given the model):
- the zone *ordering* produced by the sort
- reachability, hop counts and connected components
- the minimum-cost route and its cost
- the maximum flow, the minimum cut, and the clearance time derived from them
- the knapsack optimum, the exit allocation and the backtracking best plan

The AI/computer-vision layer is input, and is treated as input. Its job is to say where people are;
it makes no decisions.

## 10. Running it

Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173.

```bash
npm test          # 172 unit tests across the algorithm and engine layers
npm run build     # static site in dist/
```

### The dashboard

- **Monitor** — camera view, zone grid, flow arrows, alerts, and the decision strip showing
  evacuation capacity, bottleneck, safest route and recommended action.
- **Decision** — the full pipeline, stage by stage: the graph with every result drawn on it, each
  algorithm's result and operation counts, measured stage times, the what-if search, and a "why this
  algorithm?" note for each.
- **Algorithms** — the Algorithm Lab: interactive sections per DAA topic, plus the complexity table
  and the performance experiment.
- **Station** — four-camera site map, each coloured by its own risk.
- **Zones** — every zone's rank, count, level, trend, forecast, turbulence and counter-flow.
- **Timeline** — chart, alert history, lead time, incident report, CSV exports, SMS log.
- **Setup** — thresholds, notifications, the zone editor and the site configuration (exits/entries).

Keyboard: Space pauses, R restarts, F fullscreen, 1–7 switch tabs.

### Suggested demo order (for a viva)

1. **Monitor**, simulation from 0:00 — the crowd builds; the decision strip updates live.
2. At about 1:00, read the strip: capacity, bottleneck, safest route, recommended action.
3. **Decision** tab — walk down the pipeline. Point out that the bottleneck named is a *min cut*
   edge, and that the recommendation targets it specifically.
4. Press **Search combinations** — show the search space, nodes visited and prunes, and that the
   best plan beats the greedy one.
5. **Algorithms → Sorting** — merge vs quick on the live zones; note stability and the worst case.
6. **Algorithms → Shortest path** — change the source zone until safest ≠ shortest, and show the
   per-edge cost breakdown.
7. **Algorithms → Max flow and min cut** — the augmenting paths, then the cut, then the argument
   that widening outside the cut cannot help.
8. **Algorithms → Greedy vs DP** — the DP table and the gap to greedy.
9. **Algorithms → Performance experiment** — run it; show quick sort's quadratic case, and the
   theory-vs-measurement caveat.

## 11. Modes

Simulation mode is the default: a scripted, deterministic 90-second station scenario, no camera and
no internet required. Live Detection runs TensorFlow.js person detection on an uploaded video or a
webcam, twice per second, with short-lived anonymous tracking to measure movement. The model (~67 MB)
is downloaded once and cached, so later loads work offline. Video never leaves the device.

## 12. Tech stack

Vite, React, Tailwind CSS, Recharts, TensorFlow.js (COCO-SSD), Web Audio API, Vitest. No backend, no
API key. The algorithm layer has **no dependencies at all** — every data structure and algorithm is
written from scratch in plain JavaScript.

## 13. Deploy

Builds to a static site in `dist/` with relative paths and hash routes, so it works on any static
host without rewrite rules. On Vercel, import the repository and keep the detected Vite settings. On
Netlify, the included `netlify.toml` sets the same values. Webcam access needs HTTPS or localhost.

## 14. Limitations

**Detection.** A general-purpose person detector undercounts in very dense crowds, which is exactly
where accuracy matters most; a production system would use a crowd-density model. Movement is
estimated from detections twice per second, so motion readings are approximate. SMS is simulated.

**The graph model.** Distances come from normalised camera coordinates scaled by one assumed site
width (40 m), so they are relative rather than surveyed. Corridor capacities are derived from shared
zone-boundary length and a standard specific-flow figure, not from measured widths. A real
deployment would take both from a floor plan.

**The flow model.** It is a steady-state model: it computes the throughput the site sustains in its
current state, not a time-stepped evacuation simulation. Clearance is reported as queue time plus
the walking time of the safest route, which is a lower bound — it does not model queue build-up as
people arrive at a gate, or the fact that congestion changes as the crowd drains.

**Intervention estimates.** Risk-reduction and cost figures are reasoned estimates, and are labelled
as such. Their *effect on evacuation throughput* is computed by rebuilding the flow network, but the
risk points that feed greedy and the knapsack DP are not.

**Scale.** The pipeline runs in a few milliseconds on a site with a dozen zones. BFS, DFS and
Dijkstra would scale to a whole station comfortably. Edmonds-Karp at O(VE²) and the backtracking
search at O(2ⁿ) would not scale to a city-wide network without a better max-flow algorithm (Dinic's)
and a candidate-generation step that keeps *n* small.

## 15. Future work

- **Dinic's algorithm** — O(V²E), materially better than Edmonds-Karp on larger networks.
- **A\*** with an admissible heuristic for the route search, if the graph grows large enough for the
  log factor to matter.
- **Time-expanded flow network** — model evacuation over discrete time steps, giving a true
  dynamic flow instead of a steady-state throughput.
- **Minimum-cost flow** — route people at least total cost rather than merely maximising throughput.
- **Multi-camera graph** — join the four station cameras into one graph so the min cut can be taken
  across the whole site rather than per camera.
- **Surveyed geometry** — take distances and corridor widths from a floor plan instead of from
  camera coordinates.
- **Learned intervention values** — estimate risk reduction from recorded outcomes rather than
  assigning it by hand.
