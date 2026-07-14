import type { DevCardType, PortType, Resource } from './types';

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
  | { type: 'createTradeOffer'; give: Partial<Record<Resource, number>>; receive: Partial<Record<Resource, number>>; anyCount: number; target?: number }
  | { type: 'respondTradeOffer'; offerId: number; responder: number; accepted: boolean; wildcardResource?: Resource }
  | { type: 'completeTradeOffer'; offerId: number; partner: number }
  | { type: 'cancelTradeOffer'; offerId: number }
  // Debug-only developer tools. Kept in the reducer so debug state changes remain deterministic.
  | { type: 'debugAddResources'; player: number; resources: Partial<Record<Resource, number>> }
  | { type: 'debugGrantDevCard'; player: number; card: DevCardType }
  | { type: 'debugTriggerRobber' }
  | { type: 'debugSetPorts'; ports: { edge: number; port: PortType | null }[] }
  // Turn end
  | { type: 'endTurn' };

export type ActionType = Action['type'];

/** Result of attempting an action: either a new state or a rejection reason. */
export type ReduceResult =
  | { ok: true; state: import('./types').GameState }
  | { ok: false; error: string };
