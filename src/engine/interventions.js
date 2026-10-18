// Interventions the decision engine can choose from. Each one maps to:
//   - a change in the crowd graph (applyToGraphState), used by max flow to measure its benefit
//   - the matching action in the simulation (simulation.js INTERVENTIONS), so "Apply" changes the
//     running scenario and the existing risk model can confirm the effect.
// `cost` is in disruption points (staff needed, passengers delayed). See stationModel.js PLAN_BUDGET.

export const DAA_INTERVENTIONS = [
  {
    id: 'gate2',
    label: 'Open Gate 2',
    cost: 2,
    effect: 'Unlocks the closed exit next to C2 (0 to 45 people/min).',
  },
  {
    id: 'pauseEntry',
    label: 'Pause entry from the footbridge',
    cost: 3,
    effect: 'Stops people coming down the stairs, which removes counter-flow and restores full stair capacity.',
  },
  {
    id: 'redirect',
    label: 'Redirect to Platform 3',
    cost: 3,
    effect: 'Opens a second route off the footbridge (to Platform 3), bypassing the concourse.',
  },
  {
    id: 'emergencyExit',
    label: 'Open platform-end emergency exit',
    cost: 2,
    effect: 'Opens a narrow door at the west end of the platform (0 to 30 people/min).',
  },
]

export const interventionById = (id) => DAA_INTERVENTIONS.find((iv) => iv.id === id)
