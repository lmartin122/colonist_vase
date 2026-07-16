import { create } from 'zustand';
import { nextBotAction } from '@colonist/shared';
import type { Action } from '@colonist/shared';
import { createGame, type GameConfig } from '@colonist/shared';
import { reduce } from '@colonist/shared';
import type { GameState } from '@colonist/shared';
import { sendGameAction } from '../net/socket';
import { deriveFlights, emitFlights } from './flights';
import { deriveSounds, playSound, playSounds } from './sounds';

/** Local play runs the engine in the browser; online play defers to the server. */
export type GameMode = 'local' | 'online';

/** What the human is currently placing on the board (drives board highlights). */
export type BuildMode =
  | null
  | { kind: 'road' }
  | { kind: 'settlement' }
  | { kind: 'city' }
  | { kind: 'roadBuilding'; placed: number[] }
  | { kind: 'knight' };

export type Theme = 'light' | 'dark';

export interface Store {
  game: GameState | null;
  mode: GameMode;
  humanId: number;
  build: BuildMode;
  thinking: boolean;
  error: string | null;
  theme: Theme;
  debugEnabled: boolean;
  debugInfiniteTimer: { player: number; turn: number } | null;
  matchStartedAt: number | null;
  matchEndedAt: number | null;

  newGame: (config: GameConfig) => void;
  /** Apply an authoritative (already-redacted) state pushed by the server. */
  applyServerState: (state: GameState, yourSeat: number) => void;
  abandonGame: () => void;
  dispatch: (action: Action) => boolean;
  setBuild: (mode: BuildMode) => void;
  clearError: () => void;
  toggleTheme: () => void;
  enableDebug: () => void;
  toggleDebugInfiniteTimer: () => void;
  fastForwardTurn: () => void;
  simulatePhase: () => void;
  simulateToGameEnd: () => void;
}

const THEME_KEY = 'cv-theme';

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}

// Apply the persisted theme as early as possible to avoid a flash.
applyTheme(initialTheme());

const DELAYS: Record<string, number> = {
  startingRoll: 700,
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
  if (game.tradeOffers.some((offer) => offer.target === humanId && offer.responses[humanId]?.status === 'pending')) return null;
  if (game.phase === 'discard') {
    const botOwing = Object.keys(game.pending.discards)
      .map(Number)
      .find((p) => p !== humanId);
    return botOwing ?? null;
  }
  return game.players[game.currentPlayer].isBot ? game.currentPlayer : null;
}

function simulationActor(game: GameState): number {
  if (game.phase === 'discard') return Number(Object.keys(game.pending.discards)[0]);
  return game.currentPlayer;
}

function simulationAction(game: GameState, humanId: number): Action | null {
  const awaitingHuman = game.tradeOffers.find((offer) => offer.responses[humanId]?.status === 'pending');
  if (awaitingHuman) {
    return { type: 'respondTradeOffer', offerId: awaitingHuman.id, responder: humanId, accepted: false };
  }
  return nextBotAction(game, simulationActor(game));
}

export const useGame = create<Store>((set, get) => {
  const timingFor = (game: GameState) => ({
    matchEndedAt: game.phase === 'gameOver' ? get().matchEndedAt ?? Date.now() : null,
  });

  async function runBots() {
    // In online play the server owns all bots; the client only reflects state.
    if (get().mode === 'online') return;
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
          if (fallback.ok) set({ game: fallback.state, ...timingFor(fallback.state) });
          else break;
          continue;
        }
        set({ game: result.state, ...timingFor(result.state) });
        emitFlights(deriveFlights(current, result.state, action, humanId));
        playSounds(deriveSounds(current, result.state, action, humanId));
      }
    } finally {
      botRunning = false;
      set({ thinking: false });
    }
  }

  function simulate(continueWhile: (game: GameState) => boolean, maxSteps = 160, animate = true): void {
    let current = get().game;
    if (!current) return;
    const humanId = get().humanId;
    for (let steps = 0; steps < maxSteps && continueWhile(current); steps++) {
      const action = simulationAction(current, humanId);
      if (!action) break;
      const result = reduce(current, action);
      if (!result.ok) {
        set({ error: `Simulation stopped: ${result.error}` });
        break;
      }
      if (animate) emitFlights(deriveFlights(current, result.state, action, humanId));
      current = result.state;
      if (animate) set({ game: current, build: null, error: null, ...timingFor(current) });
    }
    if (!animate) set({ game: current, build: null, error: null, ...timingFor(current) });
    void runBots();
  }

  return {
    game: null,
    mode: 'local',
    humanId: 0,
    build: null,
    thinking: false,
    error: null,
    theme: initialTheme(),
    debugEnabled: false,
    debugInfiniteTimer: null,
    matchStartedAt: null,
    matchEndedAt: null,

    newGame(config) {
      let game: GameState;
      try {
        game = createGame(config);
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Could not start the game' });
        return;
      }
      set({ game, mode: 'local', build: null, error: null, humanId: 0, debugInfiniteTimer: null, matchStartedAt: Date.now(), matchEndedAt: null });
      playSound('gameStarted');
      void runBots();
    },

    applyServerState(state, yourSeat) {
      // The server pushes an already-redacted, authoritative snapshot. Piece
      // pop-ins still animate via BoardRenderer.sync; card-flight/sound diffing
      // needs the originating action (not yet sent over the wire) — TODO.
      set({
        game: state,
        mode: 'online',
        humanId: yourSeat,
        thinking: false,
        error: null,
        build: null,
        matchStartedAt: get().matchStartedAt ?? Date.now(),
        ...timingFor(state),
      });
    },

    abandonGame() {
      set({ game: null, mode: 'local', build: null, thinking: false, error: null, debugInfiniteTimer: null, matchStartedAt: null, matchEndedAt: null });
    },

    dispatch(action) {
      const { game, mode } = get();
      if (!game) return false;
      if (mode === 'online') {
        // The server is authoritative: send the action and wait for the pushed
        // state. Rejections come back on the ack.
        set({ build: null });
        void sendGameAction(action).then((res) => {
          if (!res.ok) set({ error: res.error });
        });
        return true;
      }
      const result = reduce(game, action);
      if (!result.ok) {
        set({ error: result.error });
        return false;
      }
      set({ game: result.state, error: null, build: null, ...timingFor(result.state) });
      emitFlights(deriveFlights(game, result.state, action, get().humanId));
      playSounds(deriveSounds(game, result.state, action, get().humanId));
      void runBots();
      return true;
    },

    setBuild(mode) {
      set({ build: mode });
    },

    clearError() {
      set({ error: null });
    },

    toggleTheme() {
      const theme: Theme = get().theme === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined') localStorage.setItem(THEME_KEY, theme);
      applyTheme(theme);
      set({ theme });
    },

    enableDebug() {
      set({ debugEnabled: true });
    },

    toggleDebugInfiniteTimer() {
      const game = get().game;
      if (!game) return;
      const current = get().debugInfiniteTimer;
      set({ debugInfiniteTimer: current?.player === game.currentPlayer && current.turn === game.turn ? null : { player: game.currentPlayer, turn: game.turn } });
    },

    fastForwardTurn() {
      const game = get().game;
      if (!game) return;
      if (game.phase === 'startingRoll' || game.phase === 'setup' || game.phase === 'discard') {
        simulate((current) => current.phase === game.phase);
        return;
      }
      const player = game.currentPlayer;
      simulate((current) => current.phase !== 'gameOver' && current.currentPlayer === player);
    },

    simulatePhase() {
      const game = get().game;
      if (!game) return;
      const phase = game.phase;
      simulate((current) => current.phase === phase);
    },

    simulateToGameEnd() {
      simulate((current) => current.phase !== 'gameOver', 20_000, false);
    },
  };
});

// Expose the store in dev for smoke tests / debugging.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __game: typeof useGame }).__game = useGame;
}
