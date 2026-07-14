import type { GameState } from './types';
import { publicVictoryPoints } from './helpers';

/**
 * Placement legality predicates, shared by the reducer (to validate actions) and
 * the UI/AI (to enumerate legal moves). Keeping them in one place guarantees the
 * board never accepts a move the UI wouldn't offer, and vice-versa.
 */

/** No building may sit on a vertex adjacent to another building (distance rule). */
export function settlementSpotOpen(state: GameState, vertex: number): boolean {
  if (state.buildings[vertex]) return false;
  for (const adj of state.board.vertices[vertex].adjacentVertexIds) {
    if (state.buildings[adj]) return false;
  }
  return true;
}

/** In the main game a settlement must connect to one of the player's roads. */
export function connectedByRoad(state: GameState, playerId: number, vertex: number): boolean {
  return state.board.vertices[vertex].edgeIds.some((e) => state.roads[e] === playerId);
}

/** A road links to the player's building or road, and never through an opponent. */
export function roadConnects(state: GameState, playerId: number, edge: number): boolean {
  const [a, b] = state.board.edges[edge].vertexIds;
  return [a, b].some((v) => {
    const building = state.buildings[v];
    if (building && building.owner !== playerId) return false; // blocked by opponent
    if (building && building.owner === playerId) return true;
    return state.board.vertices[v].edgeIds.some(
      (e) => e !== edge && state.roads[e] === playerId,
    );
  });
}

// --- Enumerations ----------------------------------------------------------

export function legalSettlementVertices(state: GameState, playerId: number, setup: boolean): number[] {
  return state.board.vertices
    .filter((v) => settlementSpotOpen(state, v.id) && (setup || connectedByRoad(state, playerId, v.id)))
    .map((v) => v.id);
}

export function legalRoadEdges(
  state: GameState,
  playerId: number,
  options: { fromVertex?: number } = {},
): number[] {
  return state.board.edges
    .filter((e) => {
      if (state.roads[e.id] !== undefined) return false;
      if (options.fromVertex !== undefined) return e.vertexIds.includes(options.fromVertex);
      return roadConnects(state, playerId, e.id);
    })
    .map((e) => e.id);
}

export function legalCityVertices(state: GameState, playerId: number): number[] {
  return Object.entries(state.buildings)
    .filter(([, b]) => b.owner === playerId && b.type === 'settlement')
    .map(([v]) => Number(v));
}

/** Legal robber destinations, including Friendly Robber protection. */
export function robberTargetTiles(state: GameState): number[] {
  const candidates = state.board.tiles.filter((tile) => tile.id !== state.board.robberTileId);
  if (!state.rules.friendlyRobber) return candidates.map((tile) => tile.id);

  const actor = state.currentPlayer;
  const allowed = candidates.filter((tile) => tile.vertexIds.every((vertex) => {
    const building = state.buildings[vertex];
    return !building || building.owner === actor || publicVictoryPoints(state, building.owner) >= 3;
  }));
  if (allowed.length > 0) return allowed.map((tile) => tile.id);

  // The official friendly variant leaves the robber on the desert when every
  // other destination would block a protected opponent.
  const desert = state.board.tiles.find((tile) => tile.type === 'desert');
  return desert ? [desert.id] : [];
}

/** Opponents with a building on a tile who still hold resources (stealable). */
export function stealableOpponents(state: GameState, tile: number, actor: number): number[] {
  const victims = new Set<number>();
  for (const vid of state.board.tiles[tile].vertexIds) {
    const b = state.buildings[vid];
    if (b && b.owner !== actor && (!state.rules.friendlyRobber || publicVictoryPoints(state, b.owner) >= 3)) {
      const total = Object.values(state.players[b.owner].resources).reduce((s, n) => s + n, 0);
      if (total > 0) victims.add(b.owner);
    }
  }
  return [...victims];
}
