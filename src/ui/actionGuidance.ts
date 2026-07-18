import { isConcurrentPhase } from '../engine/modes';
import type { GameState } from '../engine/types';
import type { BuildMode } from '../state/store';

export function currentActionMessage(game: GameState, humanId: number, build: BuildMode): string {
  const me = game.players[humanId];
  if (game.phase === 'gameOver') return 'Game over';
  if (game.phase === 'discard' && (game.pending.discards[humanId] ?? 0) > 0) return `Discard ${game.pending.discards[humanId]} cards`;
  if (!isConcurrentPhase(game) && game.currentPlayer !== humanId) return `Waiting for ${game.players[game.currentPlayer].name}`;
  if (game.phase === 'startingRoll') return 'Roll the dice to determine the starting player';
  if (game.phase === 'setup') return game.setup?.lastSettlement === null ? 'Place a starting town' : 'Place a road beside your town';
  if (game.phase === 'moveRobber') return 'Move the robber to another tile';
  if ((game.pending.freeRoads[humanId] ?? 0) > 0) return `Place ${game.pending.freeRoads[humanId]} free road${game.pending.freeRoads[humanId] === 1 ? '' : 's'}`;
  if (build?.kind === 'road') return 'Choose an edge for your road';
  if (build?.kind === 'settlement') return 'Choose a legal town location';
  if (build?.kind === 'city') return 'Choose a town to upgrade';
  if (build?.kind === 'knight') return 'Choose a tile for the robber';
  if (game.phase === 'roll') return 'Roll the dice';
  if (isConcurrentPhase(game) && game.pending.passed[humanId]) return 'Waiting for the next round';
  if (game.phase === 'main' || isConcurrentPhase(game)) return `${me.name}: build, trade, play a card, or finish`;
  return 'Waiting';
}
