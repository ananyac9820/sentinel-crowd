// The physical facts about the demo station that a camera cannot see: how wide each exit is,
// how long the walk is, which gate is normally locked. These are a clearly defined dataset
// (like a building plan), not algorithm outputs. Every algorithm result is computed from them
// plus the live crowd state.
//
// Capacities are people per minute that can pass safely. Distances are metres.

// Edge cost used by Dijkstra. All three terms are on a 0..100 scale (metres, % of crush density,
// risk index), so the weights read directly as "how much each factor matters".
export const COST_WEIGHTS = { distance: 0.4, congestion: 0.4, risk: 0.2 }

// Platform 2 drawn by CAM-03 is about 80 m long and 24 m deep.
export const PLATFORM_M = { length: 80, depth: 24 }

export const CAPACITY = {
  floor: 90, // open platform floor between two neighbouring zones
  gate: 40, // default exit gate
  stairs: 60, // footbridge staircase, one-way traffic
  footbridgeToConcourse: 70,
  concourseToStreet: 120,
  footbridgeToPlatform3: 50, // only when people are redirected to Platform 3
  platform3Hold: 60, // Platform 3 can absorb this many people per minute
  emergencyExit: 30, // narrow platform-end door
}

// How much a crowd slows flow (fundamental diagram of pedestrian flow, simplified):
// full speed up to 50% of crush density, falling linearly to 40% of capacity at crush density.
export const CROWD_FLOW = { freeUntil: 50, jammedAt: 100, jammedFactor: 0.4 }

// At full counter-flow (index 100) the stairs lose this share of their capacity.
export const COUNTER_FLOW_LOSS = 0.6

// Exit details for the station profile in site.js, keyed by the exit's name there.
// `opensWith` = the intervention that unlocks a normally closed exit.
export const STATION_EXITS = {
  'Gate 1': { capacity: 40, passage: 30 },
  'Gate 2': { capacity: 45, passage: 30, opensWith: 'gate2' },
  'Gate 3': { capacity: 40, passage: 30 },
}

// Areas covered by the other station cameras. `hold` = people at which the area counts as 100% full.
export const STATION_AREAS = {
  footbridge: { label: 'Footbridge', camera: 'CAM-02', hold: 45 },
  concourse: { label: 'Concourse', camera: 'CAM-01', hold: 110 },
  platform3: { label: 'Platform 3', camera: 'CAM-04', hold: 80 },
}

export const DISTANCE = {
  zoneToExit: 4,
  stairsClimb: 10,
  footbridgeToConcourse: 20,
  concourseToStreet: 8,
  footbridgeToPlatform3: 25,
  emergencyPassage: 35,
}

// Greedy / backtracking settings. Cost = disruption points (1 point ~ one steward for 5 minutes).
export const PLAN_BUDGET = 6
// Goal: platform cleared within this many seconds at the computed evacuation capacity.
export const TARGET_EVAC_SECONDS = 35
