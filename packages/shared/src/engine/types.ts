import type { Axial, Point } from './coords';
import type { RngState } from './rng';

/** The five producible resources. "desert" is a tile type only, never a resource. */
export type Resource = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
export const RESOURCES: Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

export type TileType = Resource | 'desert';

export type DevCardType = 'knight' | 'victoryPoint' | 'roadBuilding' | 'monopoly' | 'yearOfPlenty';
export type BotDifficulty = 'easy' | 'medium' | 'hard';

/** A bag of resources, keyed by resource. Missing keys read as 0 via helpers. */
export type ResourceBank = Record<Resource, number>;
export type ResourceBundle = Partial<Record<Resource, number>>;

export function emptyBank(): ResourceBank {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export interface Tile {
  id: number;
  axial: Axial;
  center: Point;
  type: TileType;
  /** Dice number that produces this tile (2–12, never 7). Desert has none. */
  number: number | null;
  vertexIds: number[];
  edgeIds: number[];
}

export interface Vertex {
  id: number;
  point: Point;
  tileIds: number[];
  edgeIds: number[];
  adjacentVertexIds: number[];
  /** Port trading offered at this vertex, if any. */
  port: PortType | null;
}

export interface Edge {
  id: number;
  vertexIds: [number, number];
  point: Point; // midpoint, for rendering/hit-testing
  /** True for perimeter edges that border the ocean. */
  coastal: boolean;
}

/** '3:1' generic, or a specific resource for a 2:1 port. */
export type PortType = '3:1' | Resource;

export interface Board {
  tiles: Tile[];
  vertices: Vertex[];
  edges: Edge[];
  robberTileId: number;
}

// ---------------------------------------------------------------------------
// Pieces & players
// ---------------------------------------------------------------------------

export type BuildingType = 'settlement' | 'city';
export type PlayerColor =
  | 'red'
  | 'blue'
  | 'orange'
  | 'green'
  | 'black'
  | 'bronze'
  | 'gold'
  | 'mysticblue'
  | 'pink'
  | 'purple'
  | 'silver'
  | 'white';

export interface Building {
  type: BuildingType;
  owner: number; // player index
}

export interface Player {
  id: number;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  botDifficulty: BotDifficulty | null;
  resources: ResourceBank;
  /** Dev cards in hand, plus the turn they were bought (can't play same turn). */
  devCards: OwnedDevCard[];
  knightsPlayed: number;
  /** Pieces still available to place. */
  stock: { settlements: number; cities: number; roads: number };
  /** Lifetime match counters used by the post-game statistics screen. */
  stats: PlayerStats;
}

export interface PlayerStats {
  resourcesCollected: ResourceBank;
  devCardsCollected: Record<DevCardType, number>;
  turnsTaken: number;
  roadsPlaced: number;
  settlementsPlaced: number;
  citiesBuilt: number;
  bankTrades: number;
  playerTrades: number;
  tradeOffers: number;
  robberMoves: number;
  successfulSteals: number;
  cardsStolen: number;
  cardsDiscarded: number;
  devCardsBought: number;
  devCardsPlayed: number;
}

export interface OwnedDevCard {
  type: DevCardType;
  boughtOnTurn: number;
  played: boolean;
}

// ---------------------------------------------------------------------------
// Game phases & state
// ---------------------------------------------------------------------------

export type Phase =
  | 'startingRoll' // players roll to determine the first setup player
  | 'setup' // initial snake-draft placement
  | 'roll' // current player must roll
  | 'discard' // players over the limit must discard after a 7
  | 'moveRobber' // current player moves robber (+ steals)
  | 'main' // build / trade / play dev cards, then end turn
  | 'rushRound' // Rush mode: every player may act; ends when all pass or time runs out
  | 'gameOver';

export interface GameState {
  players: Player[];
  board: Board;
  bank: ResourceBank;
  devDeck: DevCardType[];
  currentPlayer: number;
  /** Clockwise player order, rotated so the opening-roll winner is first. */
  turnOrder: number[];
  phase: Phase;
  dice: [number, number] | null;
  turn: number;
  rng: RngState;
  rules: GameRules;
  /** Normal gameplay dice totals. Opening-order rolls are intentionally excluded. */
  diceStats: Record<number, number>;

  /** Buildings keyed by vertex id; roads keyed by edge id (value = owner index). */
  buildings: Record<number, Building>;
  roads: Record<number, number>;

  longestRoad: { player: number | null; length: number };
  largestArmy: { player: number | null; size: number };

  /** Current roll-off round used to determine who starts setup. */
  startingRoll: {
    contenders: number[];
    rolls: Partial<Record<number, [number, number]>>;
  } | null;

  /** Setup progression: index into the snake-draft order. */
  setup: { order: number[]; step: number; lastSettlement: number | null } | null;

  /** Pending sub-phase data. */
  pending: {
    /** Player indices that still must discard, with how many. */
    discards: Record<number, number>;
    /** Free roads granted (road building card / setup) before returning to main, per player. */
    freeRoads: Record<number, number>;
    /** Dev card already played this turn (only one allowed), per player. */
    playedDevThisTurn: Record<number, boolean>;
    /** True once the current player has rolled this turn. */
    hasRolled: boolean;
    /** Prevents a bot from repeatedly proposing the same trade in one turn, per player. */
    botTradeOfferedThisTurn: Record<number, boolean>;
    /** Rush mode: players who have pressed Pass/Ready this round. */
    passed: Record<number, boolean>;
    /** Rush mode: player who resolves the robber on a 7 for the current round; rotates each round. */
    roundCaptain: number;
  };

  /** Player trade offers created during the active turn. */
  tradeOffers: TradeOffer[];
  nextTradeOfferId: number;

  winner: number | null;
  log: LogEntry[];
}

export interface TradeOfferResponse {
  status: 'pending' | 'accepted' | 'declined';
  /** Resource chosen by the accepting player for each wildcard request. */
  wildcardResource: Resource | null;
}

export interface TradeOffer {
  id: number;
  /** Round/turn in which the offer was created. */
  createdTurn: number;
  proposer: number;
  give: Partial<Record<Resource, number>>;
  receive: Partial<Record<Resource, number>>;
  anyCount: number;
  /** A bot-originated offer targets one human; human offers target all bots. */
  target: number | null;
  responses: Record<number, TradeOfferResponse>;
}

export type GameModeId = 'classic' | 'rush';

export interface GameRules {
  /** Classic: one player acts per turn. Rush: every round, all players act at once. */
  mode: GameModeId;
  /** Classic: seconds per turn. Rush: seconds per round. */
  turnTimer: 15 | 30 | 60;
  victoryPoints: number;
  discardLimit: number;
  hideBankCards: boolean;
  friendlyRobber: boolean;
  allowPlayerTrades: boolean;
}

export interface LogEntry {
  turn: number;
  player: number | null;
  message: string;
  /** Semantic data for rich history rendering; `message` remains the text fallback. */
  details?: LogEntryDetails;
}

export type LogResourceVisibility = 'public' | 'actor' | 'participants';

export type LogEntryDetails =
  | {
      type: 'dice';
      dice: [number, number];
      context: 'startingOrder' | 'turn' | 'rushRound';
      visibility: 'public';
    }
  | {
      type: 'piece';
      piece: 'road' | 'settlement' | 'city';
      verb: 'placed' | 'built';
      edge?: number;
      vertex?: number;
      visibility: 'public';
    }
  | {
      type: 'robber';
      tile: number;
      visibility: 'public';
    }
  | {
      type: 'developmentCard';
      visibility: 'public';
    }
  | {
      type: 'resourceGain';
      source: 'production' | 'setup' | 'yearOfPlenty';
      resources: ResourceBundle;
      visibility: 'public';
    }
  | {
      type: 'trade';
      kind: 'player' | 'bank';
      partner: number | null;
      give: ResourceBundle;
      receive: ResourceBundle;
      visibility: 'public';
    }
  | {
      type: 'tradeOffer';
      give: ResourceBundle;
      receive: ResourceBundle;
      anyCount: number;
      target: number | null;
      visibility: 'public';
    }
  | {
      type: 'discard';
      resources: ResourceBundle;
      count: number;
      visibility: 'public';
    }
  | {
      type: 'steal';
      victim: number;
      resource: Resource;
      visibility: 'participants';
    }
  | {
      type: 'monopoly';
      resource: Resource;
      count: number;
      visibility: 'public';
    };
