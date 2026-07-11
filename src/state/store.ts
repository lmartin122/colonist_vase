import { create } from 'zustand';
import { nextBotAction } from '../ai/bot';
import type { Action } from '../engine/actions';
import { createGame, type GameConfig } from '../engine/game';
import { reduce } from '../engine/reduce';
import type { GameState } from '../engine/types';

/** What the human is currently placing on the board (drives board highlights). */
export type BuildMode =
  | null
  | { kind: 'road' }
  | { kind: 'settlement' }
  | { kind: 'city' }
  | { kind: 'roadBuilding'; placed: number[] }
  | { kind: 'knight' };

export interface Store {
  game: GameState | null;
  humanId: number;
  build: BuildMode;
  thinking: boolean;
  error: string | null;

  newGame: (config: GameConfig) => void;
  dispatch: (action: Action) => boolean;
  setBuild: (mode: BuildMode) => void;
  clearError: () => void;
}

const DELAYS: Record<string, number> = {
  setup: 450,
  roll: 600,
  moveRobber: 750,
  discard: 450,
  main: 480,
};

let botRunning = false;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Decide which player an automated (bot) action is owed for, or null when the
 * game is waiting on the human. Bot discards are handled regardless of whose
 * turn it is; every other phase belongs to the current player.
 */
function automatedActor(game: GameState, humanId: number): number | null {
  if (game.phase === 'gameOver') return null;
  if (game.phase === 'discard') {
    const botOwing = Object.keys(game.pending.discards)
      .map(Number)
      .find((p) => p !== humanId);
    return botOwing ?? null;
  }
  return game.players[game.currentPlayer].isBot ? game.currentPlayer : null;
}

export const useGame = create<Store>((set, get) => {
  async function runBots() {
    if (botRunning) return;
    botRunning = true;
    try {
      for (;;) {
        const { game, humanId } = get();
        if (!game) break;
        const actor = automatedActor(game, humanId);
        if (actor === null) break;
        set({ thinking: true });
        await delay(DELAYS[game.phase] ?? 400);
        const current = get().game;
        if (!current) break;
        const action = nextBotAction(current, actor);
        if (!action) break;
        const result = reduce(current, action);
        if (!result.ok) {
          // Safety net: a bot should never emit an illegal move; end its turn.
          console.warn('Bot produced illegal action:', action, result.error);
          const fallback = reduce(current, { type: 'endTurn' });
          if (fallback.ok) set({ game: fallback.state });
          else break;
          continue;
        }
        set({ game: result.state });
      }
    } finally {
      botRunning = false;
      set({ thinking: false });
    }
  }

  return {
    game: null,
    humanId: 0,
    build: null,
    thinking: false,
    error: null,

    newGame(config) {
      set({ game: createGame(config), build: null, error: null, humanId: 0 });
      void runBots();
    },

    dispatch(action) {
      const { game } = get();
      if (!game) return false;
      const result = reduce(game, action);
      if (!result.ok) {
        set({ error: result.error });
        return false;
      }
      set({ game: result.state, error: null, build: null });
      void runBots();
      return true;
    },

    setBuild(mode) {
      set({ build: mode });
    },

    clearError() {
      set({ error: null });
    },
  };
});

// Expose the store in dev for smoke tests / debugging.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __game: typeof useGame }).__game = useGame;
}
