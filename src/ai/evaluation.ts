import type { Action } from '../engine/actions';
import { NUMBER_PIPS } from '../engine/constants';
import { publicVictoryPoints, resourceValue, totalResources, victoryPoints } from '../engine/helpers';
import { legalSettlementVertices } from '../engine/placement';
import type { GameState, Resource } from '../engine/types';
import { RESOURCES } from '../engine/types';

export function vertexPips(state: GameState, vertexId: number): number {
  return state.board.vertices[vertexId].tileIds.reduce((score, tileId) => {
    const number = state.board.tiles[tileId].number;
    return score + (number === null ? 0 : NUMBER_PIPS[number] ?? 0);
  }, 0);
}

export function vertexScore(state: GameState, vertexId: number, hard = false): number {
  const vertex = state.board.vertices[vertexId];
  const resources = vertex.tileIds.map((id) => state.board.tiles[id].type).filter((type): type is Resource => type !== 'desert');
  const variety = new Set(resources).size;
  const scarceBonus = hard ? resources.reduce((sum, resource) => sum + resourceValue(resource), 0) * 0.35 : 0;
  const expansion = hard ? vertex.adjacentVertexIds.filter((id) => state.buildings[id] === undefined).length * 0.35 : 0;
  return vertexPips(state, vertexId) + variety * (hard ? 1 : 0.6) + (vertex.port ? (hard ? 2.2 : 1.5) : 0) + scarceBonus + expansion;
}

/** Uses exact information only for the acting bot; all opponent features are public. */
export function evaluateState(state: GameState, actor: number): number {
  const me = state.players[actor];
  let production = 0;
  for (const [vertex, building] of Object.entries(state.buildings)) {
    if (building.owner === actor) production += vertexPips(state, Number(vertex)) * (building.type === 'city' ? 2 : 1);
  }
  const publicThreat = Math.max(...state.players.filter((player) => player.id !== actor).map((player) => publicVictoryPoints(state, player.id)), 0);
  const resources = RESOURCES.reduce((sum, resource) => sum + me.resources[resource] * resourceValue(resource), 0);
  const variety = RESOURCES.filter((resource) => me.resources[resource] > 0).length;
  const reachable = legalSettlementVertices(state, actor, false).length;
  const awardScore = (state.longestRoad.player === actor ? 4 : 0) + (state.largestArmy.player === actor ? 4 : 0);
  const robberPenalty = state.board.tiles[state.board.robberTileId].vertexIds.some((vertex) => state.buildings[vertex]?.owner === actor) ? 2.5 : 0;
  return victoryPoints(state, actor) * 35 + production * 1.8 + resources * 0.65 + variety * 0.8 + Math.min(reachable, 4) * 0.7 + awardScore - publicThreat * 1.2 - robberPenalty;
}

export function actionKey(action: Action): string {
  return JSON.stringify(action);
}

export function deterministicNoise(state: GameState, actor: number, action: Action): number {
  let hash = (state.rng.seed ^ (state.turn * 2654435761) ^ (actor * 2246822519)) >>> 0;
  for (const char of actionKey(action)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash / 0xffffffff;
}

export function publicCardCount(state: GameState, player: number): number {
  return totalResources(state.players[player].resources);
}
