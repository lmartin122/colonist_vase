import { RESOURCES, longestRoadLength, victoryPoints } from '@colonist/shared';
import type { DevCardType, PlayerStats, Resource } from '@colonist/shared';
import { config } from './config';
import type { Room } from './rooms';

/**
 * Best-effort persistence. If DATABASE_URL is unset (or the client isn't
 * generated yet), every function no-ops so the server still runs and plays.
 *
 * The Prisma client is loaded lazily and typed loosely on purpose, so the
 * server type-checks and runs before `prisma generate` has been executed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Prisma = any;

let client: Prisma = null;
let loaded = false;

async function db(): Promise<Prisma> {
  if (!config.databaseUrl) return null;
  if (!loaded) {
    loaded = true;
    try {
      const mod = await import('@prisma/client');
      client = new mod.PrismaClient();
    } catch (err) {
      console.warn('[db] Prisma unavailable, persistence disabled:', (err as Error).message);
      client = null;
    }
  }
  return client;
}

export async function upsertUser(auth0Sub: string, name: string): Promise<void> {
  const prisma = await db();
  if (!prisma) return;
  try {
    await prisma.user.upsert({
      where: { auth0Sub },
      update: { name },
      create: { auth0Sub, name },
    });
  } catch (err) {
    console.error('[db] upsertUser failed:', (err as Error).message);
  }
}

/** Persist a finished game + per-seat final scores. Called on gameOver. */
export async function recordFinishedGame(room: Room): Promise<void> {
  const prisma = await db();
  if (!prisma || !room.state || room.seed == null) return;
  const state = room.state;
  const winnerSeat = state.winner;
  const winnerSeatState = winnerSeat != null ? room.seats[winnerSeat] : undefined;
  const winnerAuth0 = winnerSeatState && !winnerSeatState.abandoned ? winnerSeatState.userId : null;

  try {
    const existing = await prisma.game.findUnique({ where: { roomCode: room.code } });
    if (existing) return;
    await Promise.all(room.seats.flatMap((seat) => seat.userId
      ? [prisma.user.upsert({
          where: { auth0Sub: seat.userId },
          update: { name: seat.name },
          create: { auth0Sub: seat.userId, name: seat.name },
        })]
      : []));
    await prisma.game.create({
      data: {
        roomCode: room.code,
        seed: room.seed,
        layout: room.layout,
        mode: state.rules.mode,
        diceStats: state.diceStats,
        startedAt: new Date(room.startedAt ?? Date.now()),
        endedAt: new Date(),
        winner: winnerAuth0 ? { connect: { auth0Sub: winnerAuth0 } } : undefined,
        players: {
          create: room.seats.map((seat) => ({
            seat: seat.seat,
            name: seat.name,
            isBot: seat.userId ? false : seat.isBot,
            finalVp: victoryPoints(state, seat.seat),
            stats: state.players[seat.seat]?.stats ?? emptyPlayerStats(),
            longestRoadLength: longestRoadLength(state, seat.seat),
            longestRoadAward: state.longestRoad.player === seat.seat,
            largestArmyAward: state.largestArmy.player === seat.seat,
            abandoned: seat.abandoned,
            user: seat.userId ? { connect: { auth0Sub: seat.userId } } : undefined,
          })),
        },
      },
    });
  } catch (err) {
    console.error('[db] recordFinishedGame failed:', (err as Error).message);
  }
}

const DEV_TYPES: DevCardType[] = ['knight', 'roadBuilding', 'monopoly', 'yearOfPlenty', 'victoryPoint'];

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

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

function normalizedPlayerStats(value: unknown): PlayerStats {
  const source = value && typeof value === 'object' ? value as Partial<PlayerStats> : {};
  const resources = source.resourcesCollected && typeof source.resourcesCollected === 'object'
    ? source.resourcesCollected as Partial<Record<Resource, number>>
    : {};
  const devCards = source.devCardsCollected && typeof source.devCardsCollected === 'object'
    ? source.devCardsCollected as Partial<Record<DevCardType, number>>
    : {};
  const result = emptyPlayerStats();
  for (const resource of RESOURCES) result.resourcesCollected[resource] = count(resources[resource]);
  for (const type of DEV_TYPES) result.devCardsCollected[type] = count(devCards[type]);
  for (const key of Object.keys(result) as Array<keyof PlayerStats>) {
    if (key !== 'resourcesCollected' && key !== 'devCardsCollected') result[key] = count(source[key]) as never;
  }
  return result;
}

function addPlayerStats(total: PlayerStats, match: PlayerStats): void {
  for (const resource of RESOURCES) total.resourcesCollected[resource] += match.resourcesCollected[resource];
  for (const type of DEV_TYPES) total.devCardsCollected[type] += match.devCardsCollected[type];
  for (const key of Object.keys(total) as Array<keyof PlayerStats>) {
    if (key !== 'resourcesCollected' && key !== 'devCardsCollected') total[key] = (total[key] + match[key]) as never;
  }
}

export interface ServerProfileStats {
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
  abandonedGames: number;
  totalLongestRoad: number;
  bestLongestRoad: number;
  diceRolls: Record<number, number>;
  matchStats: PlayerStats;
}

export interface StatsRow {
  roomCode: string;
  winnerId: string | null;
  mode: string;
  startedAt: Date;
  endedAt: Date;
  diceStats: unknown;
  players: Array<{
    userId: string | null;
    finalVp: number;
    stats: unknown;
    longestRoadLength: number;
    longestRoadAward: boolean;
    largestArmyAward: boolean;
    abandoned: boolean;
  }>;
}

/** Pure aggregation used by the API and regression tests. One database game
 * contributes at most one result, regardless of disconnect/rejoin count. */
export function aggregateUserStats(rows: StatsRow[], userId: string): ServerProfileStats {
  const result: ServerProfileStats = {
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
    abandonedGames: 0,
    totalLongestRoad: 0,
    bestLongestRoad: 0,
    diceRolls: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [index + 2, 0])),
    matchStats: emptyPlayerStats(),
  };
  const countedRooms = new Set<string>();
  for (const game of rows) {
    if (countedRooms.has(game.roomCode)) continue;
    const player = game.players.find((candidate) => candidate.userId === userId);
    if (!player) continue;
    countedRooms.add(game.roomCode);
    const won = game.winnerId === userId;
    const classic = game.mode !== 'rush';
    result.gamesPlayed += 1;
    result.wins += won ? 1 : 0;
    result.totalVictoryPoints += count(player.finalVp);
    result.bestVictoryPoints = Math.max(result.bestVictoryPoints, count(player.finalVp));
    result.totalDurationMs += Math.max(0, game.endedAt.getTime() - game.startedAt.getTime());
    result.classicGames += classic ? 1 : 0;
    result.classicWins += classic && won ? 1 : 0;
    result.rushGames += classic ? 0 : 1;
    result.rushWins += !classic && won ? 1 : 0;
    result.longestRoadAwards += player.longestRoadAward ? 1 : 0;
    result.largestArmyAwards += player.largestArmyAward ? 1 : 0;
    result.abandonedGames += player.abandoned ? 1 : 0;
    result.totalLongestRoad += count(player.longestRoadLength);
    result.bestLongestRoad = Math.max(result.bestLongestRoad, count(player.longestRoadLength));
    const dice = game.diceStats && typeof game.diceStats === 'object' ? game.diceStats as Record<string, unknown> : {};
    for (let roll = 2; roll <= 12; roll++) result.diceRolls[roll] += count(dice[String(roll)]);
    addPlayerStats(result.matchStats, normalizedPlayerStats(player.stats));
  }
  return result;
}

export async function getUserStats(auth0Sub: string): Promise<ServerProfileStats> {
  const prisma = await db();
  if (!prisma) return aggregateUserStats([], '');
  try {
    const user = await prisma.user.findUnique({ where: { auth0Sub } });
    if (!user) return aggregateUserStats([], '');
    const rows = await prisma.game.findMany({
      where: { players: { some: { userId: user.id } } },
      include: { players: true },
    });
    return aggregateUserStats(rows, user.id);
  } catch (err) {
    console.error('[db] getUserStats failed:', (err as Error).message);
    return aggregateUserStats([], '');
  }
}

export interface GameHistoryRow {
  id: string;
  seed: number;
  layout: string;
  endedAt: string;
  won: boolean;
  abandoned: boolean;
  finalVp: number;
  players: { seat: number; name: string; isBot: boolean; finalVp: number }[];
}

/** Games the given user took part in, most recent first. */
export async function listUserGames(auth0Sub: string): Promise<GameHistoryRow[]> {
  const prisma = await db();
  if (!prisma) return [];
  try {
    const user = await prisma.user.findUnique({ where: { auth0Sub } });
    if (!user) return [];
    const rows = await prisma.game.findMany({
      where: { players: { some: { userId: user.id } } },
      orderBy: { endedAt: 'desc' },
      take: 50,
      include: { players: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((g: any) => ({
      id: g.id,
      seed: g.seed,
      layout: g.layout,
      endedAt: g.endedAt.toISOString(),
      won: g.winnerId === user.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finalVp: g.players.find((p: any) => p.userId === user.id)?.finalVp ?? 0,
      abandoned: g.players.find((p: any) => p.userId === user.id)?.abandoned ?? false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      players: g.players.map((p: any) => ({ seat: p.seat, name: p.name, isBot: p.isBot, finalVp: p.finalVp })),
    }));
  } catch (err) {
    console.error('[db] listUserGames failed:', (err as Error).message);
    return [];
  }
}

export async function getOrCreateUser(auth0Sub: string, name: string): Promise<{ id: string; name: string } | null> {
  const prisma = await db();
  if (!prisma) return null;
  try {
    return await prisma.user.upsert({
      where: { auth0Sub },
      update: { name },
      create: { auth0Sub, name },
      select: { id: true, name: true },
    });
  } catch {
    return null;
  }
}
