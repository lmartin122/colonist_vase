import { generateBoard, type BoardOptions } from './board';
import {
  BANK_PER_RESOURCE,
  DEV_DECK,
  PLAYER_COLORS,
  STARTING_STOCK,
} from './constants';
import { shuffle, type RngState } from './rng';
import type { GameRules, GameState, Player, PlayerColor } from './types';
import { emptyBank } from './types';

export interface PlayerConfig {
  name: string;
  isBot: boolean;
}

export interface GameConfig {
  players: PlayerConfig[];
  layout?: BoardOptions['layout'];
  seed?: number;
  rules?: Partial<GameRules>;
}

export const DEFAULT_RULES: GameRules = {
  turnTimer: 60,
  victoryPoints: 10,
  discardLimit: 7,
  hideBankCards: false,
  friendlyRobber: false,
  allowPlayerTrades: true,
};

/** Build the initial GameState, beginning with the roll for placement order. */
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

  return {
    players,
    board: boardResult.board,
    bank,
    devDeck: deckResult.items,
    currentPlayer: players[0].id,
    turnOrder: players.map((p) => p.id),
    phase: 'startingRoll',
    dice: null,
    turn: 0,
    rng,
    rules: { ...DEFAULT_RULES, ...config.rules },
    buildings: {},
    roads: {},
    longestRoad: { player: null, length: 0 },
    largestArmy: { player: null, size: 0 },
    startingRoll: { contenders: players.map((p) => p.id), rolls: {} },
    setup: null,
    pending: {
      discards: {},
      freeRoads: 0,
      playedDevThisTurn: false,
      hasRolled: false,
    },
    winner: null,
    log: [{ turn: 0, player: null, message: 'Game created. Roll to determine who places first.' }],
  };
}
