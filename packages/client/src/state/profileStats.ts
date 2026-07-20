import { RESOURCES, longestRoadLength, victoryPoints } from '@colonist/shared';
import type { DevCardType, GameState, PlayerStats, Resource } from '@colonist/shared';

const STORAGE_KEY = 'cv-profile-stats';
const VERSION = 1;
const DEV_TYPES: DevCardType[] = ['knight', 'roadBuilding', 'monopoly', 'yearOfPlenty', 'victoryPoint'];

export interface OverallProfileStats {
  gamesPlayed: number;
  wins: number;
  totalVictoryPoints: number;
  bestVictoryPoints: number;
  totalDurationMs: number;
  classicGames: number;
  classicWins: number;
  rushGames: number;
  rushWins: number;
  longestRoadAwards: number;
  largestArmyAwards: number;
  totalLongestRoad: number;
  bestLongestRoad: number;
  diceRolls: Record<number, number>;
  matchStats: PlayerStats;
}

interface StoredProfileStats {
  version: number;
  stats: OverallProfileStats;
}

const count = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

function emptyPlayerStats(): PlayerStats {
  return {
    resourcesCollected: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
    devCardsCollected: { knight: 0, roadBuilding: 0, monopoly: 0, yearOfPlenty: 0, victoryPoint: 0 },
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

export function emptyProfileStats(): OverallProfileStats {
  return {
    gamesPlayed: 0,
    wins: 0,
    totalVictoryPoints: 0,
    bestVictoryPoints: 0,
    totalDurationMs: 0,
    classicGames: 0,
    classicWins: 0,
    rushGames: 0,
    rushWins: 0,
    longestRoadAwards: 0,
    largestArmyAwards: 0,
    totalLongestRoad: 0,
    bestLongestRoad: 0,
    diceRolls: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [index + 2, 0])),
    matchStats: emptyPlayerStats(),
  };
}

export function normalizeProfileStats(value: unknown): OverallProfileStats {
  const source = value && typeof value === 'object' ? value as Partial<OverallProfileStats> : {};
  const match = source.matchStats && typeof source.matchStats === 'object' ? source.matchStats as Partial<PlayerStats> : {};
  const resources = match.resourcesCollected && typeof match.resourcesCollected === 'object' ? match.resourcesCollected as Partial<Record<Resource, number>> : {};
  const devCards = match.devCardsCollected && typeof match.devCardsCollected === 'object' ? match.devCardsCollected as Partial<Record<DevCardType, number>> : {};
  const diceRolls = source.diceRolls && typeof source.diceRolls === 'object' ? source.diceRolls as Record<number, number> : {};
  const normalizedMatch = emptyPlayerStats();
  for (const resource of RESOURCES) normalizedMatch.resourcesCollected[resource] = count(resources[resource]);
  for (const type of DEV_TYPES) normalizedMatch.devCardsCollected[type] = count(devCards[type]);
  for (const key of Object.keys(normalizedMatch) as Array<keyof PlayerStats>) {
    if (key !== 'resourcesCollected' && key !== 'devCardsCollected') normalizedMatch[key] = count(match[key]) as never;
  }
  return {
    gamesPlayed: count(source.gamesPlayed),
    wins: count(source.wins),
    totalVictoryPoints: count(source.totalVictoryPoints),
    bestVictoryPoints: count(source.bestVictoryPoints),
    totalDurationMs: count(source.totalDurationMs),
    classicGames: count(source.classicGames),
    classicWins: count(source.classicWins),
    rushGames: count(source.rushGames),
    rushWins: count(source.rushWins),
    longestRoadAwards: count(source.longestRoadAwards),
    largestArmyAwards: count(source.largestArmyAwards),
    totalLongestRoad: count(source.totalLongestRoad),
    bestLongestRoad: count(source.bestLongestRoad),
    diceRolls: Object.fromEntries(Array.from({ length: 11 }, (_, index) => {
      const roll = index + 2;
      return [roll, count(diceRolls[roll])];
    })),
    matchStats: normalizedMatch,
  };
}

export function loadProfileStats(): OverallProfileStats {
  if (typeof localStorage === 'undefined') return emptyProfileStats();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<StoredProfileStats> | null;
    return parsed?.version === VERSION ? normalizeProfileStats(parsed.stats) : emptyProfileStats();
  } catch {
    return emptyProfileStats();
  }
}

export function saveProfileStats(stats: OverallProfileStats): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, stats } satisfies StoredProfileStats));
  } catch {
    // The game remains playable when storage is blocked or full.
  }
}

function addPlayerStats(total: PlayerStats, match: PlayerStats): PlayerStats {
  const next = emptyPlayerStats();
  for (const resource of RESOURCES) next.resourcesCollected[resource] = total.resourcesCollected[resource] + match.resourcesCollected[resource];
  for (const type of DEV_TYPES) next.devCardsCollected[type] = total.devCardsCollected[type] + match.devCardsCollected[type];
  for (const key of Object.keys(next) as Array<keyof PlayerStats>) {
    if (key !== 'resourcesCollected' && key !== 'devCardsCollected') next[key] = (total[key] + match[key]) as never;
  }
  return next;
}

function addGameResult(current: OverallProfileStats, game: GameState, humanId: number, durationMs: number, won: boolean): OverallProfileStats {
  if (!game.players[humanId]) return current;
  const points = victoryPoints(game, humanId);
  const route = longestRoadLength(game, humanId);
  const classic = game.rules.mode === 'classic';
  return {
    gamesPlayed: current.gamesPlayed + 1,
    wins: current.wins + (won ? 1 : 0),
    totalVictoryPoints: current.totalVictoryPoints + points,
    bestVictoryPoints: Math.max(current.bestVictoryPoints, points),
    totalDurationMs: current.totalDurationMs + Math.max(0, durationMs),
    classicGames: current.classicGames + (classic ? 1 : 0),
    classicWins: current.classicWins + (classic && won ? 1 : 0),
    rushGames: current.rushGames + (classic ? 0 : 1),
    rushWins: current.rushWins + (!classic && won ? 1 : 0),
    longestRoadAwards: current.longestRoadAwards + (game.longestRoad.player === humanId ? 1 : 0),
    largestArmyAwards: current.largestArmyAwards + (game.largestArmy.player === humanId ? 1 : 0),
    totalLongestRoad: current.totalLongestRoad + route,
    bestLongestRoad: Math.max(current.bestLongestRoad, route),
    diceRolls: Object.fromEntries(Array.from({ length: 11 }, (_, index) => {
      const roll = index + 2;
      return [roll, (current.diceRolls[roll] ?? 0) + (game.diceStats[roll] ?? 0)];
    })),
    matchStats: addPlayerStats(current.matchStats, game.players[humanId].stats),
  };
}

export function addCompletedGame(current: OverallProfileStats, game: GameState, humanId: number, durationMs: number): OverallProfileStats {
  if (game.phase !== 'gameOver' || game.winner === null) return current;
  return addGameResult(current, game, humanId, durationMs, game.winner === humanId);
}

export function addAbandonedGame(current: OverallProfileStats, game: GameState, humanId: number, durationMs: number): OverallProfileStats {
  if (game.phase === 'gameOver') return current;
  return addGameResult(current, game, humanId, durationMs, false);
}

export function recordCompletedGame(game: GameState, humanId: number, durationMs: number): void {
  saveProfileStats(addCompletedGame(loadProfileStats(), game, humanId, durationMs));
}

export function recordAbandonedGame(game: GameState, humanId: number, durationMs: number): void {
  saveProfileStats(addAbandonedGame(loadProfileStats(), game, humanId, durationMs));
}
