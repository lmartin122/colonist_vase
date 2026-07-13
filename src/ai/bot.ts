import type { Action } from '../engine/actions';
import { NUMBER_PIPS } from '../engine/constants';
import {
  bankTradeRatio,
  canAfford,
  resourceValue,
  victoryPoints,
} from '../engine/helpers';
import { COSTS } from '../engine/constants';
import {
  legalCityVertices,
  legalRoadEdges,
  legalSettlementVertices,
  robberTargetTiles,
  stealableOpponents,
} from '../engine/placement';
import type { GameState, Resource, ResourceBank } from '../engine/types';
import { RESOURCES } from '../engine/types';

/**
 * Heuristic AI. `nextBotAction` returns a single legal action for whichever
 * player currently owes a move (the current player, or — during a discard — the
 * given `actor`). The controller calls it repeatedly until control passes back
 * to a human or the turn ends, so each call must make concrete progress.
 */
export function nextBotAction(state: GameState, actor: number): Action | null {
  switch (state.phase) {
    case 'startingRoll':
      return { type: 'rollForStart' };
    case 'setup':
      return setupAction(state);
    case 'roll':
      // Optionally play a Knight before rolling (free the robber / grab the army).
      if (shouldPlayKnight(state)) return knightAction(state);
      return { type: 'rollDice' };
    case 'discard':
      return discardAction(state, actor);
    case 'moveRobber':
      return robberAction(state);
    case 'main':
      return mainAction(state);
    default:
      return null;
  }
}

// --- Board evaluation ------------------------------------------------------

/** Expected production of a vertex: sum of probability pips on adjacent tiles. */
function vertexPips(state: GameState, vertexId: number): number {
  let score = 0;
  for (const tileId of state.board.vertices[vertexId].tileIds) {
    const tile = state.board.tiles[tileId];
    if (tile.number !== null) score += NUMBER_PIPS[tile.number] ?? 0;
  }
  return score;
}

/** Reward resource variety and ports a little on top of raw pips. */
function vertexScore(state: GameState, vertexId: number): number {
  const vertex = state.board.vertices[vertexId];
  const kinds = new Set(
    vertex.tileIds.map((t) => state.board.tiles[t].type).filter((type) => type !== 'desert'),
  );
  const portBonus = vertex.port ? 1.5 : 0;
  return vertexPips(state, vertexId) + kinds.size * 0.6 + portBonus;
}

// --- Setup -----------------------------------------------------------------

function setupAction(state: GameState): Action {
  const player = state.currentPlayer;
  if (state.setup && state.setup.lastSettlement === null) {
    const spots = legalSettlementVertices(state, player, true);
    const best = argmax(spots, (v) => vertexScore(state, v));
    return { type: 'placeSetupSettlement', vertex: best };
  }
  const from = state.setup!.lastSettlement!;
  const edges = legalRoadEdges(state, player, { fromVertex: from });
  // Head toward the best neighbouring expansion vertex.
  const best = argmax(edges, (e) => {
    const [a, b] = state.board.edges[e].vertexIds;
    const far = a === from ? b : a;
    return vertexScore(state, far);
  });
  return { type: 'placeSetupRoad', edge: best };
}

// --- Discard / robber ------------------------------------------------------

function discardAction(state: GameState, actor: number): Action {
  const required = state.pending.discards[actor];
  const res = state.players[actor].resources;
  // Drop the least valuable resources first.
  const order = [...RESOURCES].sort((a, b) => resourceValue(a) - resourceValue(b));
  const drop: Partial<Record<Resource, number>> = {};
  let left = required;
  for (const r of order) {
    const take = Math.min(left, res[r]);
    if (take > 0) drop[r] = take;
    left -= take;
    if (left === 0) break;
  }
  return { type: 'discard', player: actor, resources: drop };
}

function robberAction(state: GameState): Action {
  const { tile, victim } = bestRobberPlacement(state);
  return { type: 'moveRobber', tile, stealFrom: victim };
}

/** Best tile to hurt opponents with the robber, plus the richest victim there. */
function bestRobberPlacement(state: GameState): { tile: number; victim: number | null } {
  const actor = state.currentPlayer;
  const tile = argmax(robberTargetTiles(state), (t) => {
    let value = 0;
    for (const vid of state.board.tiles[t].vertexIds) {
      const b = state.buildings[vid];
      if (b && b.owner !== actor) {
        value += vertexPips(state, vid) * (b.type === 'city' ? 2 : 1);
        value += victoryPoints(state, b.owner) * 0.5;
      }
    }
    return value;
  });
  const victims = stealableOpponents(state, tile, actor);
  const victim = victims.length ? argmax(victims, (p) => total(state.players[p].resources)) : null;
  return { tile, victim };
}

function hasPlayableKnight(state: GameState): boolean {
  if (state.pending.playedDevThisTurn) return false;
  return state.players[state.currentPlayer].devCards.some(
    (c) => c.type === 'knight' && !c.played && c.boughtOnTurn < state.turn,
  );
}

/** Play a knight when it grabs Largest Army or the robber sits on our own tile. */
function shouldPlayKnight(state: GameState): boolean {
  if (!hasPlayableKnight(state)) return false;
  const me = state.currentPlayer;
  const wouldReach = state.players[me].knightsPlayed + 1;
  const grabsArmy = wouldReach >= 3 && wouldReach > state.largestArmy.size;
  const robberHurtsMe = state.board.tiles[state.board.robberTileId].vertexIds.some(
    (v) => state.buildings[v]?.owner === me,
  );
  return grabsArmy || robberHurtsMe;
}

function knightAction(state: GameState): Action {
  const { tile, victim } = bestRobberPlacement(state);
  return { type: 'playKnight', tile, stealFrom: victim };
}

// --- Main phase ------------------------------------------------------------

function mainAction(state: GameState): Action {
  const player = state.currentPlayer;
  const me = state.players[player];

  // 0. Spend any free roads granted by a Road Building card.
  if (state.pending.freeRoads > 0) {
    const edges = legalRoadEdges(state, player);
    if (edges.length) {
      const best = argmax(edges, (e) => {
        const [a, b] = state.board.edges[e].vertexIds;
        return Math.max(vertexScore(state, a), vertexScore(state, b));
      });
      return { type: 'buildRoad', edge: best };
    }
    // No legal spot for the free road — end the turn to clear the grant.
    return { type: 'endTurn' };
  }

  // 1. Upgrade to a city (strong VP + doubled production).
  if (me.stock.cities > 0 && canAfford(me.resources, COSTS.city)) {
    const cities = legalCityVertices(state, player);
    if (cities.length) return { type: 'buildCity', vertex: argmax(cities, (v) => vertexPips(state, v)) };
  }

  // 2. Build a settlement at the best legal spot.
  if (me.stock.settlements > 0 && canAfford(me.resources, COSTS.settlement)) {
    const spots = legalSettlementVertices(state, player, false);
    if (spots.length) return { type: 'buildSettlement', vertex: argmax(spots, (v) => vertexScore(state, v)) };
  }

  // 3. Buy a development card when flush with city resources.
  if (state.devDeck.length > 0 && canAfford(me.resources, COSTS.devCard) && me.resources.ore >= 1) {
    return { type: 'buyDevCard' };
  }

  // 4. Extend the road network toward a good open settlement spot.
  if (me.stock.roads > 0 && canAfford(me.resources, COSTS.road)) {
    const edges = legalRoadEdges(state, player);
    if (edges.length) {
      const best = argmax(edges, (e) => {
        const [a, b] = state.board.edges[e].vertexIds;
        return Math.max(vertexScore(state, a), vertexScore(state, b));
      });
      return { type: 'buildRoad', edge: best };
    }
  }

  // 5. Try a bank trade that unlocks a build we're one resource short of.
  const trade = tradeTowardBuild(state, player);
  if (trade) return trade;

  return { type: 'endTurn' };
}

/** If a 4:1/port trade would let us afford a settlement or city, propose it. */
function tradeTowardBuild(state: GameState, player: number): Action | null {
  const res = state.players[player].resources;
  const targets: Partial<ResourceBank>[] = [COSTS.city, COSTS.settlement];
  for (const cost of targets) {
    for (const need of RESOURCES) {
      const deficit = (cost[need] ?? 0) - res[need];
      if (deficit !== 1) continue; // only bridge a single-resource gap
      // Find a surplus resource we can spare at our best ratio.
      for (const give of RESOURCES) {
        if (give === need) continue;
        const ratio = bankTradeRatio(state, player, give);
        const spare = res[give] - (cost[give] ?? 0);
        if (spare >= ratio && state.bank[need] > 0) {
          return { type: 'bankTrade', give, receive: need };
        }
      }
    }
  }
  return null;
}

// --- utilities -------------------------------------------------------------

function total(bank: ResourceBank): number {
  return RESOURCES.reduce((s, r) => s + bank[r], 0);
}

function argmax<T>(items: T[], score: (item: T) => number): T {
  let best = items[0];
  let bestScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  return best;
}
