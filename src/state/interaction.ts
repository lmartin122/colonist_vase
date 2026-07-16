import type { Action } from '../engine/actions';
import {
  legalCityVertices,
  legalRoadEdges,
  legalSettlementVertices,
  robberTargetTiles,
  stealableOpponents,
} from '../engine/placement';
import { isConcurrentPhase } from '../engine/modes';
import type { GameState } from '../engine/types';
import type { InteractionMode } from '../render/BoardRenderer';
import type { BuildMode } from './store';

type RobberAction = 'moveRobber' | 'playKnight';

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
  chooseRobberVictim?: (tile: number, action: RobberAction, victims: number[]) => void,
): InteractionMode | null {
  if (!game) return null;
  const concurrent = isConcurrentPhase(game);
  const isHumanTurn = concurrent ? !game.pending.passed[humanId] : game.currentPlayer === humanId;

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
      tiles: robberTargetTiles(game, humanId),
      onTile: (t) => resolveRobberTarget(game, t, 'moveRobber', humanId, dispatch, chooseRobberVictim),
    };
  }

  // Road Building card: force free-road placement until the grant is used up.
  if ((game.pending.freeRoads[humanId] ?? 0) > 0 && isHumanTurn) {
    return {
      edges: legalRoadEdges(game, humanId),
      onEdge: (e) => dispatch({ type: 'buildRoad', edge: e, player: humanId }),
    };
  }

  // Knight may be played before rolling, as well as during the main phase.
  if (build?.kind === 'knight' && isHumanTurn && (game.phase === 'roll' || game.phase === 'main' || concurrent)) {
    return {
      tiles: robberTargetTiles(game, humanId),
      onTile: (t) => resolveRobberTarget(game, t, 'playKnight', humanId, dispatch, chooseRobberVictim),
    };
  }

  if ((game.phase !== 'main' && !concurrent) || !isHumanTurn) return null;

  switch (build?.kind) {
    case 'road':
      return {
        edges: legalRoadEdges(game, humanId),
        onEdge: (e) => dispatch({ type: 'buildRoad', edge: e, player: humanId }),
      };
    case 'settlement':
      return {
        vertices: legalSettlementVertices(game, humanId, false),
        onVertex: (v) => dispatch({ type: 'buildSettlement', vertex: v, player: humanId }),
      };
    case 'city':
      return {
        cityVertices: legalCityVertices(game, humanId),
        onVertex: (v) => dispatch({ type: 'buildCity', vertex: v, player: humanId }),
      };
    default:
      return null;
  }
}

function resolveRobberTarget(
  game: GameState,
  tile: number,
  action: RobberAction,
  humanId: number,
  dispatch: (a: Action) => boolean,
  chooseRobberVictim?: (tile: number, action: RobberAction, victims: number[]) => void,
): boolean {
  const victims = stealableOpponents(game, tile, humanId);
  if (victims.length > 1 && chooseRobberVictim) {
    chooseRobberVictim(tile, action, victims);
    return true;
  }
  const stealFrom = victims[0] ?? null;
  return action === 'moveRobber'
    ? dispatch({ type: 'moveRobber', tile, stealFrom, player: humanId })
    : dispatch({ type: 'playKnight', tile, stealFrom, player: humanId });
}
