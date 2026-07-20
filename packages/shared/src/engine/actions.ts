import type { DevCardType, Resource } from './types';

/**
 * Every mutation to the game goes through one of these actions and the pure
 * `reduce(state, action)`. Unless noted, an action is performed by the current
 * player; `discard` is the exception (any player who owes a discard). In
 * concurrent modes (e.g. Rush), actions that would otherwise trust
 * `state.currentPlayer` may carry an explicit `player` field identifying the
 * acting player instead; it is ignored (and unnecessary) in classic mode.
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
  | { type: 'moveRobber'; tile: number; stealFrom: number | null; player?: number }
  // Building
  | { type: 'buildRoad'; edge: number; player?: number }
  | { type: 'buildSettlement'; vertex: number; player?: number }
  | { type: 'buildCity'; vertex: number; player?: number }
  // Development cards
  | { type: 'buyDevCard'; player?: number }
  | { type: 'playKnight'; tile: number; stealFrom: number | null; player?: number }
  | { type: 'playRoadBuilding'; player?: number }
  | { type: 'playMonopoly'; resource: Resource; player?: number }
  | { type: 'playYearOfPlenty'; resources: Resource[]; player?: number }
  // Trading
  | { type: 'bankTrade'; give: Resource; receive: Resource; player?: number }
  | { type: 'playerTrade'; partner: number; give: Partial<Record<Resource, number>>; receive: Partial<Record<Resource, number>>; player?: number }
  | { type: 'createTradeOffer'; give: Partial<Record<Resource, number>>; receive: Partial<Record<Resource, number>>; anyCount: number; target?: number; player?: number }
  | { type: 'respondTradeOffer'; offerId: number; responder: number; accepted: boolean; wildcardResource?: Resource }
  | { type: 'completeTradeOffer'; offerId: number; partner: number; player?: number }
  | { type: 'cancelTradeOffer'; offerId: number; player?: number }
  // Debug-only developer tools. Kept in the reducer so debug state changes remain deterministic.
  | { type: 'debugAddResources'; player: number; resources: Partial<Record<Resource, number>> }
  | { type: 'debugGrantDevCard'; player: number; card: DevCardType }
  | { type: 'debugTriggerRobber' }
  | { type: 'endTurn' }
  | { type: 'passRound'; player: number }
  | { type: 'cancelPass'; player: number };

export type ActionType = Action['type'];

/** Result of attempting an action: either a new state or a rejection reason. */
export type ReduceResult =
  | { ok: true; state: import('./types').GameState }
  | { ok: false; error: string };
