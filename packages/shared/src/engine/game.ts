import { generateBoard, type BoardOptions } from './board';
import {
  BANK_PER_RESOURCE,
  DEV_DECK,
  MAX_VICTORY_POINTS,
  PLAYER_COLORS,
  STARTING_STOCK,
} from './constants';
import { shuffle, type RngState } from './rng';
import type { BotDifficulty, DevCardType, GameRules, GameState, Player, PlayerColor, PlayerStats } from './types';
import { emptyBank } from './types';

export interface PlayerConfig {
  name: string;
  isBot: boolean;
  color?: PlayerColor;
  botDifficulty?: BotDifficulty;
}

export interface GameConfig {
  players: PlayerConfig[];
  layout?: BoardOptions['layout'];
  seed?: number;
  rules?: Partial<GameRules>;
}

export const DEFAULT_RULES: GameRules = {
  mode: 'classic',
  turnTimer: 60,
  victoryPoints: 10,
  discardLimit: 7,
  hideBankCards: false,
  friendlyRobber: false,
  allowPlayerTrades: true,
};

const DEV_TYPES: DevCardType[] = ['knight', 'roadBuilding', 'monopoly', 'yearOfPlenty', 'victoryPoint'];

function emptyPlayerStats(): PlayerStats {
  return {
    resourcesCollected: emptyBank(),
    devCardsCollected: Object.fromEntries(DEV_TYPES.map((type) => [type, 0])) as Record<DevCardType, number>,
    turnsTaken: 0,
    roadsPlaced: 0,
    settlementsPlaced: 0,
    citiesBuilt: 0,
    bankTrades: 0,
    playerTrades: 0,
    tradeOffers: 0,
    robberMoves: 0,
    successfulSteals: 0,
    cardsStolen: 0,
    cardsDiscarded: 0,
    devCardsBought: 0,
    devCardsPlayed: 0,
  };
}

/** Build the initial GameState, beginning with the roll for placement order. */
export function createGame(config: GameConfig): GameState {
  const rules = { ...DEFAULT_RULES, ...config.rules };
  if (rules.mode !== 'classic' && rules.mode !== 'rush') {
    throw new RangeError(`Unknown game mode: ${String(rules.mode)}`);
  }
  if (!Number.isInteger(rules.victoryPoints) || rules.victoryPoints < 3 || rules.victoryPoints > MAX_VICTORY_POINTS) {
    throw new RangeError(`Victory points must be a whole number from 3 to ${MAX_VICTORY_POINTS}`);
  }
  const seed = config.seed ?? (Math.random() * 2 ** 31) | 0;
  let rng: RngState = { seed };

  const boardResult = generateBoard({ layout: config.layout ?? 'random' }, rng);
  rng = boardResult.rng;

  const deckResult = shuffle(DEV_DECK, rng);
  rng = deckResult.rng;

  const players: Player[] = config.players.map((p, i) => ({
    id: i,
    name: p.name,
    color: p.color ?? (PLAYER_COLORS[i % PLAYER_COLORS.length] as PlayerColor),
    isBot: p.isBot,
    botDifficulty: p.isBot ? p.botDifficulty ?? 'medium' : null,
    resources: emptyBank(),
    devCards: [],
    knightsPlayed: 0,
    stock: { ...STARTING_STOCK },
    stats: emptyPlayerStats(),
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
    rules,
    diceStats: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [index + 2, 0])),
    buildings: {},
    roads: {},
    longestRoad: { player: null, length: 0 },
    largestArmy: { player: null, size: 0 },
    startingRoll: { contenders: players.map((p) => p.id), rolls: {} },
    setup: null,
    pending: {
      discards: {},
      freeRoads: {},
      playedDevThisTurn: {},
      hasRolled: false,
      botTradeOfferedThisTurn: {},
      passed: {},
      roundCaptain: players[0].id,
    },
    tradeOffers: [],
    nextTradeOfferId: 1,
    winner: null,
    log: [{ turn: 0, player: null, message: 'Game created. Roll to determine who places first.' }],
  };
}
