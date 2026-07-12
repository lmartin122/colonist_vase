import type { Axial, Point } from './coords';
import type { RngState } from './rng';

/** The five producible resources. "desert" is a tile type only, never a resource. */
export type Resource = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
export const RESOURCES: Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

export type TileType = Resource | 'desert';

export type DevCardType = 'knight' | 'victoryPoint' | 'roadBuilding' | 'monopoly' | 'yearOfPlenty';

/** A bag of resources, keyed by resource. Missing keys read as 0 via helpers. */
export type ResourceBank = Record<Resource, number>;

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
export type PlayerColor = 'red' | 'blue' | 'orange' | 'green';

export interface Building {
  type: BuildingType;
  owner: number; // player index
}

export interface Player {
  id: number;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  resources: ResourceBank;
  /** Dev cards in hand, plus the turn they were bought (can't play same turn). */
  devCards: OwnedDevCard[];
  knightsPlayed: number;
  /** Pieces still available to place. */
  stock: { settlements: number; cities: number; roads: number };
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
    /** Free roads granted (road building card / setup) before returning to main. */
    freeRoads: number;
    /** Dev card already played this turn (only one allowed). */
    playedDevThisTurn: boolean;
    /** True once the current player has rolled this turn. */
    hasRolled: boolean;
  };

  winner: number | null;
  log: LogEntry[];
}

export interface GameRules {
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
}
