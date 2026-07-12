import type { Resource } from './types';

/**
 * Every mutation to the game goes through one of these actions and the pure
 * `reduce(state, action)`. Unless noted, an action is performed by the current
 * player; `discard` is the exception (any player who owes a discard).
 */
export type Action =
  // Determine who places first
  | { type: 'rollForStart' }
  // Setup (snake draft)
  | { type: 'placeSetupSettlement'; vertex: number }
  | { type: 'placeSetupRoad'; edge: number }
  // Turn start
  | { type: 'rollDice' }
  // After a 7
  | { type: 'discard'; player: number; resources: Partial<Record<Resource, number>> }
  | { type: 'moveRobber'; tile: number; stealFrom: number | null }
  // Building
  | { type: 'buildRoad'; edge: number }
  | { type: 'buildSettlement'; vertex: number }
  | { type: 'buildCity'; vertex: number }
  // Development cards
  | { type: 'buyDevCard' }
  | { type: 'playKnight'; tile: number; stealFrom: number | null }
  | { type: 'playRoadBuilding' }
  | { type: 'playMonopoly'; resource: Resource }
  | { type: 'playYearOfPlenty'; resources: Resource[] }
  // Trading
  | { type: 'bankTrade'; give: Resource; receive: Resource }
  | { type: 'playerTrade'; partner: number; give: Partial<Record<Resource, number>>; receive: Partial<Record<Resource, number>> }
  // Turn end
  | { type: 'endTurn' };

export type ActionType = Action['type'];

/** Result of attempting an action: either a new state or a rejection reason. */
export type ReduceResult =
  | { ok: true; state: import('./types').GameState }
  | { ok: false; error: string };
