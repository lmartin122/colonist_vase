import type { Action } from '../engine/actions';
import {
  legalCityVertices,
  legalRoadEdges,
  legalSettlementVertices,
  robberTargetTiles,
  stealableOpponents,
} from '../engine/placement';
import { totalResources } from '../engine/helpers';
import type { GameState } from '../engine/types';
import type { InteractionMode } from '../render/BoardRenderer';
import type { BuildMode } from './store';

/** Auto-select the richest legal victim when moving the robber. */
function pickVictim(game: GameState, tile: number, actor: number): number | null {
  const victims = stealableOpponents(game, tile, actor);
  if (victims.length === 0) return null;
  return victims.reduce((best, p) =>
    totalResources(game.players[p].resources) > totalResources(game.players[best].resources) ? p : best,
  );
}

/**
 * Translate the current game state + the human's chosen build mode into board
 * highlights and click handlers. Returns null when it isn't the human's move,
 * so the board is inert while bots act.
 */
export function deriveInteraction(
  game: GameState | null,
  build: BuildMode,
  humanId: number,
  dispatch: (a: Action) => boolean,
): InteractionMode | null {
  if (!game) return null;
  const isHumanTurn = game.currentPlayer === humanId;

  // Setup snake draft.
  if (game.phase === 'setup' && isHumanTurn && game.setup) {
    if (game.setup.lastSettlement === null) {
      return {
        vertices: legalSettlementVertices(game, humanId, true),
        onVertex: (v) => dispatch({ type: 'placeSetupSettlement', vertex: v }),
      };
    }
    return {
      edges: legalRoadEdges(game, humanId, { fromVertex: game.setup.lastSettlement }),
      onEdge: (e) => dispatch({ type: 'placeSetupRoad', edge: e }),
    };
  }

  // Moving the robber after a 7.
  if (game.phase === 'moveRobber' && isHumanTurn) {
    return {
      tiles: robberTargetTiles(game),
      onTile: (t) => dispatch({ type: 'moveRobber', tile: t, stealFrom: pickVictim(game, t, humanId) }),
    };
  }

  if (game.phase !== 'main' || !isHumanTurn) return null;

  // Road Building card: force free-road placement until the grant is used up.
  if (game.pending.freeRoads > 0) {
    return {
      edges: legalRoadEdges(game, humanId),
      onEdge: (e) => dispatch({ type: 'buildRoad', edge: e }),
    };
  }

  switch (build?.kind) {
    case 'road':
      return {
        edges: legalRoadEdges(game, humanId),
        onEdge: (e) => dispatch({ type: 'buildRoad', edge: e }),
      };
    case 'settlement':
      return {
        vertices: legalSettlementVertices(game, humanId, false),
        onVertex: (v) => dispatch({ type: 'buildSettlement', vertex: v }),
      };
    case 'city':
      return {
        vertices: legalCityVertices(game, humanId),
        onVertex: (v) => dispatch({ type: 'buildCity', vertex: v }),
      };
    case 'knight':
      return {
        tiles: robberTargetTiles(game),
        onTile: (t) => dispatch({ type: 'playKnight', tile: t, stealFrom: pickVictim(game, t, humanId) }),
      };
    default:
      return null;
  }
}
