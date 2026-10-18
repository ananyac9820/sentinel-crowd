# Sentinel: Algorithmic Crowd Safety and Evacuation Optimization System

**Course:** CS3212 Design and Analysis of Algorithms
**Domain:** Computer Vision: intelligent crowd analysis and management
**Application:** Crowd management and emergency evacuation

Computer vision detects **what is happening** in a crowd. Classic DAA algorithms decide **what to do about it**.

```
Camera / simulation ──► person detection, zone counts, movement, surge, counter-flow   (lib/, hooks/)
        │
        ▼
Crowd state (CrowdEngine snapshot) ──► graph (adjacency list)              (engine/crowdGraphBuilder.js)
        │
        ▼
Merge sort + binary search ── rank zones, classify alert band              (engine/riskEngine.js)
BFS ─────────────── which exits are still reachable?
DFS ─────────────── which connected zones are affected?
Dijkstra ────────── safest evacuation route (crowd-aware cost)
Edmonds-Karp ────── evacuation capacity (people / min)
Min cut ─────────── bottleneck that limits evacuation
Greedy ──────────── intervention plan (benefit / cost), checked by backtracking
        │
        ▼
Recommendation + before/after  ──► "Apply" changes the running simulation   (engine/decisionEngine.js)
```

A full project guide for the original computer-vision system is in `docs/Sentinel-Crowd-Project-Guide.pdf`.

## Run locally

You need Node.js 18 or newer.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 37 unit and end-to-end tests (node:test, no extra dependencies)
npm run build   # static site in dist/
```

## Problem statement

Crowd crushes happen when density builds faster than people can leave. CCTV can measure density and movement, but an operator under pressure still has to decide which exit to open, where to send people, and whether that will be enough. Sentinel turns the measured crowd state into a graph and uses algorithms with known correctness and complexity to answer those questions in milliseconds.

## Objectives

1. Measure crowd state per zone from video (or a deterministic simulation): people, density, surge, turbulence, counter-flow.
2. Model the venue as a weighted graph built from that state.
3. Find reachable exits (BFS), the affected danger cluster (DFS) and the safest route (Dijkstra).
4. Compute evacuation capacity (max flow) and its bottleneck (min cut).
5. Choose interventions quickly (greedy) and check them against the exact optimum (backtracking).
6. Show a measurable before/after improvement, computed, not hard-coded.

## The demo: "Emergency Crowd Surge"

**DAA Engine** tab → **Load Emergency Crowd Surge** → **Run DAA Analysis**.

The scenario is the existing scripted station simulation replayed to 0:58 with no automatic response. No random numbers are involved, so every load gives the same state: 105 people on Platform 2, zone B3 at 111% of crush density, 70% counter-flow at the foot of the footbridge stairs (C3), Gate 2 and the platform-end emergency exit closed. With the default thresholds the engine computes:

| Step | Result |
|---|---|
| Merge sort + binary search | B3 ranked first, band CRITICAL (3 probes over [0, 8, 13, 18]) |
| BFS from B3 | Gate 1, Gate 3 and the stairs reachable; Gate 2 and the emergency exit unreachable (closed) |
| DFS from B3 | danger cluster B3 → B2 → C3 |
| Dijkstra | shortest route by metres goes up the stairs (50 m, cost 129.5); safest route B3 → B4 → C4 → Gate 3 (62 m, cost 54.3) |
| Edmonds-Karp | 3 augmenting paths, **115 people/min**, platform cleared in about 55 s |
| Min cut | C1→Gate 1 (40) + C3→stairs (35, cut by counter-flow) + C4→Gate 3 (40) = 115 |
| Greedy | Step 1: Open Gate 2 (saves 15.4 s, ratio 7.7). Step 2: open emergency exit (6.2 s, ratio 3.1). Goal met |
| Backtracking | 11 plans explored, 4 branches pruned; greedy matched the optimum |
| After plan | **190 people/min**, clearance 55 s → 33 s; Sentinel's own risk model projects 100 CRITICAL → 25 SAFE at 1:18 |

**Apply recommended plan** adds the same actions as the existing what-if buttons to the running simulation; within about 8 seconds the live risk drops from CRITICAL to WATCH.

## DAA algorithms

| DAA concept | Sentinel use | Complexity | File |
|---|---|---|---|
| Merge sort | Rank dangerous zones | O(n log n) time, O(n) space | `src/algorithms/sorting/mergeSort.js` |
| Binary search | Find a zone's alert band in sorted thresholds | O(log n) | `src/algorithms/searching/binarySearch.js` |
| BFS | Reachable exits from the critical zone | O(V + E) | `src/algorithms/graph/bfs.js` |
| DFS | Connected affected regions (zones ≥ WATCH) | O(V + E) | `src/algorithms/graph/dfs.js` |
| Dijkstra | Safest evacuation route | O((V + E) log V) | `src/algorithms/graph/dijkstra.js` |
| Max flow (Edmonds-Karp) | Evacuation capacity | O(V · E²) | `src/algorithms/flow/maxFlow.js` |
| Min cut | Bottleneck identification | O(V + E) after max flow | `src/algorithms/flow/minCut.js` |
| Greedy | Fast intervention selection | O(m² · T_flow) worst case | `src/algorithms/optimization/greedyIntervention.js` |
| Backtracking | Exact best plan within budget | O(2^m · T_flow) | `src/algorithms/optimization/backtrackingPlanner.js` |

`m` = number of candidate interventions (4), `T_flow` = one Edmonds-Karp run. Every algorithm is hand-written; there is no routing, graph or sorting library, and `Array.prototype.sort` is never used for the ranking.

### Data structures

| Structure | Used by | File |
|---|---|---|
| Adjacency list graph | everything | `src/algorithms/graph/Graph.js` |
| Queue (O(1) dequeue with a head index) | BFS, Edmonds-Karp, min cut | `src/algorithms/dataStructures/Queue.js` |
| Stack (explicit) | DFS | `src/algorithms/dataStructures/Stack.js` |
| Binary min-heap | Dijkstra | `src/algorithms/dataStructures/MinHeap.js` |
| Residual graph (paired forward/reverse arcs) | Edmonds-Karp, min cut | `src/algorithms/flow/maxFlow.js` |
| Arrays (merge buffers, sorted thresholds) | Merge sort, binary search | `src/algorithms/sorting/`, `searching/` |

### How the graph is built

`src/engine/crowdGraphBuilder.js` reads the live `CrowdEngine` snapshot, the site configuration and the side cameras:

- **Zone nodes**: one per camera zone, with people, density (% of crush density, same rule as `risk.js`) and a risk index = max(alert level, turbulence, counter-flow).
- **Exit nodes**: from the site's configured exits (Gate 1–3), linked to the nearest zone. Gate 2 is normally locked: capacity 0.
- **Station nodes**: footbridge stairs, footbridge, concourse, Platform 3 (people from cameras CAM-01/02/04), emergency exit, and one SAFE sink.
- **Edges** carry distance (m), capacity (people/min), congestion and risk. Stair capacity drops with the counter-flow the camera measures; floor capacity drops as zones approach crush density.

Dijkstra's edge cost is deliberately simple:

```
cost = 0.4 × distance(m) + 0.4 × congestion(%) + 0.2 × risk(0–100)
```

Physical constants (exit widths, walking distances, normally locked gates) live in `src/engine/stationModel.js`. They are a defined dataset, like a floor plan; every algorithm output is computed from them plus the live crowd state.

## Complexity analysis and algorithm comparison

- **Dijkstra vs BFS.** BFS finds the fewest-hop path; Dijkstra finds the cheapest path when edges have different non-negative weights. The demo runs Dijkstra twice on the same graph, by metres and by crowd-aware cost, to show the safest route is not the shortest.
- **Edmonds-Karp vs plain Ford-Fulkerson.** Ford-Fulkerson with arbitrary paths depends on the capacity values (O(E·f)). Choosing the shortest augmenting path with BFS bounds the number of augmentations to O(V·E), giving O(V·E²) regardless of capacities.
- **Max-flow min-cut.** The tests and the UI both check that the min-cut capacity equals the max flow. Actions that add capacity away from the cut (e.g. redirecting to Platform 3 while the stairs are the limit) save 0 s, which greedy shows explicitly.
- **Greedy vs backtracking.** Greedy evaluates O(m) options per step and never reconsiders; backtracking tries all 2^m subsets with budget pruning. A unit test shows a case where greedy is beaten; in the demo scenario they agree.
- **Theoretical vs observed.** The Algorithm Analysis tab shows Big-O bounds next to observed runtimes (averaged over repeated runs with `performance.now()`). Benchmark mode times merge sort, BFS, Dijkstra and Edmonds-Karp on seeded synthetic inputs of 10–1000 elements. Observed times show trends; they do not prove the bounds.

## Real-world application

Stations, stadiums, festivals and religious gatherings already have CCTV. Sentinel's vision layer runs in the browser on that footage; the DAA layer adds an explainable, auditable decision: which exit to open, which way to send people, and how much faster the area clears, each traceable from input to algorithm to output.

## The rest of the app (computer vision layer)

- **Monitor**: camera view with zone grid, flow arrows, alerts and what-if buttons (Simulation).
- **Station**: four-camera station map coloured by risk; arrows show where actions send people.
- **Zones**: per-zone count, level, trend, forecast, turbulence, counter-flow.
- **Timeline**: chart, alert history, lead time, incident report and CSV exports.
- **Setup**: thresholds, notifications, site exits/entries and a zone editor.
- **DAA Engine**: the decision pipeline above, step by step (← → keys move between steps).
- **Algorithm Analysis**: complexity table, observed runtimes, benchmark.

Risk rules (lib/risk.js): density thresholds, surge, forecast to CRITICAL, turbulence (Helbing et al., 2007) and counter-flow. Live Detection works on a webcam or uploaded video and has two counting methods (selector in the camera bar):

- **Crowd density model (default):** DM-Count (NeurIPS 2020), pretrained on the ShanghaiTech crowd dataset, converted to ONNX and run in the browser with ONNX Runtime Web (WebGPU). It outputs a density map, shown as a heatmap, whose sum is the head count, so it keeps counting when people overlap. On the demo clips it counted about 55–60 people on a crowded Indian platform where the person detector boxed 15, and about 100 in a high-angle crowd where the detector boxed 24. See `tools/density-model/README.md` for the conversion, checks and limits.
- **People detector:** COCO-SSD person boxes. These are always used for movement (tracking, turbulence, counter-flow), because a density map has no individual people to follow.

The DAA engine works on live counts too when a site with exits is configured. The demo never depends on the camera, the internet or the model: Simulation mode and the emergency scenario run fully offline.

Keyboard: Space pause/play, R restart, F fullscreen, 1–7 tabs.

## Limitations

- Clearance time = people ÷ max flow: a steady-flow lower bound that ignores walking time and queue build-up.
- Capacities and costs are illustrative constants for one demo station, not measured from a real site.
- Every occupied zone is fed by an unlimited virtual source, so max flow measures the station's exit capacity, not per-zone demand.
- Intervention costs are disruption points chosen for the demo; a real deployment would calibrate them with operators.
- The crowd density model was trained on Shanghai street cameras, not Indian stations, so live counts are estimates; very high top-down drone views are undercounted. Zones are fractions of the frame, not measured floor areas, so counts are per zone rather than true people per m² (camera calibration is future work).
- Projected risk (before/after) is only available in Simulation mode, because a live camera cannot be replayed into the future.

## Future work

- **Dynamic programming** exit allocation: split each zone's people across exits to minimise the latest finish time (state = exits considered × people assigned). Left out because it could not be made reliable in time, rather than shipping a fake.
- Time-expanded flow networks (flow over time) for clearance estimates that include walking time.
- Min-cost max-flow to combine route cost and capacity in one optimisation.
- Calibrating capacities from observed flow rates at real gates.

## Tech stack

Vite, React, Tailwind CSS, Recharts, TensorFlow.js (COCO-SSD), ONNX Runtime Web (DM-Count crowd density model, `public/models/dm-count-shb.onnx`, 82 MB, cached after the first load), Web Audio API. Everything runs in the browser; there is no backend.

## Deploy

```bash
npm run build
```

On Vercel, import the repository and keep the detected Vite settings (build `npm run build`, output `dist`). On Netlify, `netlify.toml` sets the same values. Webcam access needs HTTPS or localhost.
