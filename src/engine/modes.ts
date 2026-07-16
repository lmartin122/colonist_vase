import type { GameModeId, GameState, Phase } from './types';

export interface GameModeDef {
  id: GameModeId;
  label: string;
  icon: string;
  /** Shown in the StartScreen explainer modal. */
  description: string;
  /**
   * Phase in which multiple players act independently instead of one
   * currentPlayer. null for modes that keep classic single-actor turns.
   */
  concurrentPhase: Phase | null;
}

export const GAME_MODES: Record<GameModeId, GameModeDef> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    icon: '🎲',
    concurrentPhase: null,
    description: 'Standard turn order — one player rolls and acts at a time, then passes the turn to the next player.',
  },
  rush: {
    id: 'rush',
    label: 'Rush',
    icon: '⚡',
    concurrentPhase: 'rushRound',
    description:
      'Every round, the dice are rolled once and all players can build, trade, and play development cards at the same time — there is no turn order. Press Pass/Ready when you’re done; once everyone has passed (or the round timer runs out) a new round begins. A rotating "round captain" resolves the robber whenever a 7 is rolled.',
  },
};

export function modeOf(state: GameState): GameModeDef {
  return GAME_MODES[state.rules.mode];
}

/** True when `state` is in the phase where this mode lets multiple players act independently. */
export function isConcurrentPhase(state: GameState): boolean {
  return modeOf(state).concurrentPhase === state.phase;
}

/** True when this mode has concurrent rounds at all (used e.g. to pick the robber-on-7 actor). */
export function hasConcurrentTurns(state: GameState): boolean {
  return modeOf(state).concurrentPhase !== null;
}
