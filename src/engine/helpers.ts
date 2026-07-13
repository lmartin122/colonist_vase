import {
  COSTS,
  LARGEST_ARMY_MIN,
  VP_LARGEST_ARMY,
  VP_LONGEST_ROAD,
} from './constants';
import type {
  GameState,
  Player,
  Resource,
  ResourceBank,
} from './types';
import { RESOURCES, emptyBank } from './types';

// --- Resource bank arithmetic ---------------------------------------------

export function addResources(a: ResourceBank, b: Partial<ResourceBank>): ResourceBank {
  const out = { ...a };
  for (const r of RESOURCES) out[r] += b[r] ?? 0;
  return out;
}

export function subtractResources(a: ResourceBank, b: Partial<ResourceBank>): ResourceBank {
  const out = { ...a };
  for (const r of RESOURCES) out[r] -= b[r] ?? 0;
  return out;
}

export function canAfford(bank: ResourceBank, cost: Partial<ResourceBank>): boolean {
  return RESOURCES.every((r) => bank[r] >= (cost[r] ?? 0));
}

export function totalResources(bank: ResourceBank): number {
  return RESOURCES.reduce((sum, r) => sum + bank[r], 0);
}

export function bankFrom(partial: Partial<ResourceBank>): ResourceBank {
  return addResources(emptyBank(), partial);
}

export { COSTS };

// --- Victory points --------------------------------------------------------

/** Public VP (excludes hidden victory-point dev cards held by opponents). */
export function publicVictoryPoints(state: GameState, playerId: number): number {
  return victoryPoints(state, playerId, false);
}

/** True VP including this player's own hidden victory-point cards. */
export function victoryPoints(state: GameState, playerId: number, includeHidden = true): number {
  let vp = 0;
  for (const b of Object.values(state.buildings)) {
    if (b.owner === playerId) vp += b.type === 'city' ? 2 : 1;
  }
  if (state.longestRoad.player === playerId) vp += VP_LONGEST_ROAD;
  if (state.largestArmy.player === playerId) vp += VP_LARGEST_ARMY;
  if (includeHidden) {
    vp += state.players[playerId].devCards.filter((c) => c.type === 'victoryPoint').length;
  }
  return vp;
}

// --- Ports / trade ratios --------------------------------------------------

/**
 * Best bank-trade ratio the player can get for a given resource, considering
 * ports they have a settlement/city on. 4:1 default, 3:1 generic port, 2:1
 * matching-resource port.
 */
export function bankTradeRatio(state: GameState, playerId: number, give: Resource): number {
  let ratio = 4;
  for (const [vidStr, building] of Object.entries(state.buildings)) {
    if (building.owner !== playerId) continue;
    const port = state.board.vertices[Number(vidStr)].port;
    if (port === '3:1') ratio = Math.min(ratio, 3);
    else if (port === give) ratio = Math.min(ratio, 2);
  }
  return ratio;
}

/** Rough value model for AI/trade evaluation: rarer resources are worth more. */
export function resourceValue(r: Resource): number {
  // ore and wheat drive cities/dev cards; brick/wood gate early expansion.
  const weights: Record<Resource, number> = {
    ore: 1.15,
    wheat: 1.15,
    brick: 1.05,
    wood: 1.0,
    sheep: 0.9,
  };
  return weights[r];
}

/** Deterministic value of a resource bundle, shared by bots and trade offers. */
export function tradeValue(bag: Partial<Record<Resource, number>>): number {
  return RESOURCES.reduce((sum, resource) => sum + (bag[resource] ?? 0) * resourceValue(resource), 0);
}

/** Whether an AI-controlled player will accept a proposed player trade. */
export function botAcceptsTrade(
  state: GameState,
  botId: number,
  offered: Partial<Record<Resource, number>>,
  requested: Partial<Record<Resource, number>>,
): boolean {
  const bot = state.players[botId];
  if (!canAfford(bot.resources, requested)) return false;
  const gain = tradeValue(offered);
  const loss = tradeValue(requested);
  const threshold = bot.botDifficulty === 'easy' ? 0.85 : bot.botDifficulty === 'hard' ? 1.15 : 1.05;
  const leaderPenalty = bot.botDifficulty === 'hard' && state.currentPlayer !== botId
    ? Math.max(0, publicVictoryPoints(state, state.currentPlayer) - publicVictoryPoints(state, botId)) * 0.08
    : 0;
  return gain > 0 && loss > 0 && gain >= loss * (threshold + leaderPenalty);
}

// --- Misc ------------------------------------------------------------------

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayer];
}

export function isLargestArmyEligible(knights: number): boolean {
  return knights >= LARGEST_ARMY_MIN;
}
