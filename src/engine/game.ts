import { generateBoard, type BoardOptions } from './board';
import {
  BANK_PER_RESOURCE,
  DEV_DECK,
  PLAYER_COLORS,
  STARTING_STOCK,
} from './constants';
import { shuffle, type RngState } from './rng';
import type { GameState, Player, PlayerColor } from './types';
import { emptyBank } from './types';

export interface PlayerConfig {
  name: string;
  isBot: boolean;
}

export interface GameConfig {
  players: PlayerConfig[];
  layout?: BoardOptions['layout'];
  seed?: number;
}

/** Build the initial, ready-to-play GameState (phase = 'setup'). */
export function createGame(config: GameConfig): GameState {
  const seed = config.seed ?? (Math.random() * 2 ** 31) | 0;
  let rng: RngState = { seed };

  const boardResult = generateBoard({ layout: config.layout ?? 'random' }, rng);
  rng = boardResult.rng;

  const deckResult = shuffle(DEV_DECK, rng);
  rng = deckResult.rng;

  const players: Player[] = config.players.map((p, i) => ({
    id: i,
    name: p.name,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length] as PlayerColor,
    isBot: p.isBot,
    resources: emptyBank(),
    devCards: [],
    knightsPlayed: 0,
    stock: { ...STARTING_STOCK },
  }));

  const bank = emptyBank();
  for (const r of Object.keys(bank) as (keyof typeof bank)[]) bank[r] = BANK_PER_RESOURCE;

  // Snake-draft order: 0..n-1 then n-1..0.
  const forward = players.map((p) => p.id);
  const order = [...forward, ...forward.slice().reverse()];

  return {
    players,
    board: boardResult.board,
    bank,
    devDeck: deckResult.items,
    currentPlayer: order[0],
    phase: 'setup',
    dice: null,
    turn: 0,
    rng,
    buildings: {},
    roads: {},
    longestRoad: { player: null, length: 0 },
    largestArmy: { player: null, size: 0 },
    setup: { order, step: 0, lastSettlement: null },
    pending: {
      discards: {},
      freeRoads: 0,
      playedDevThisTurn: false,
      hasRolled: false,
    },
    winner: null,
    log: [{ turn: 0, player: null, message: 'Game created. Place your first settlement.' }],
  };
}
