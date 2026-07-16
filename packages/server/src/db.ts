import { victoryPoints } from '@colonist/shared';
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
  const winnerAuth0 = winnerSeat != null ? room.seats[winnerSeat]?.userId ?? null : null;

  try {
    await prisma.game.create({
      data: {
        seed: room.seed,
        layout: room.layout,
        startedAt: new Date(room.startedAt ?? Date.now()),
        endedAt: new Date(),
        winner: winnerAuth0 ? { connect: { auth0Sub: winnerAuth0 } } : undefined,
        players: {
          create: room.seats.map((seat) => ({
            seat: seat.seat,
            name: seat.name,
            isBot: seat.isBot,
            finalVp: victoryPoints(state, seat.seat),
            user: seat.userId ? { connect: { auth0Sub: seat.userId } } : undefined,
          })),
        },
      },
    });
  } catch (err) {
    console.error('[db] recordFinishedGame failed:', (err as Error).message);
  }
}

export interface GameHistoryRow {
  id: string;
  seed: number;
  layout: string;
  endedAt: string;
  won: boolean;
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
