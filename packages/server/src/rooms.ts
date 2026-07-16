import { customAlphabet } from 'nanoid';
import {
  DEFAULT_RULES,
  PLAYER_COLORS,
  createGame,
  type BotDifficulty,
  type GameRules,
  type GameState,
  type PlayerColor,
  type RoomSnapshot,
  type SeatState,
} from '@colonist/shared';

// Unambiguous, uppercase room codes (no 0/O/1/I).
const genCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

const MAX_PLAYERS = 4;

export interface Seat {
  seat: number;
  userId: string | null; // null => bot
  name: string;
  color: PlayerColor;
  isBot: boolean;
  botDifficulty: BotDifficulty | null;
  connected: boolean;
  ready: boolean;
  socketId: string | null;
}

export interface Room {
  code: string;
  phase: 'lobby' | 'playing' | 'over';
  hostUserId: string;
  seats: Seat[];
  rules: GameRules;
  layout: string;
  maxPlayers: number;
  state: GameState | null;
  /** Original seed used to create the game (for reproducible replay). */
  seed: number | null;
  startedAt: number | null;
  botRunning: boolean;
  createdAt: number;
}

/** Keep seat numbers and colors consistent with array order (pre-game only). */
function reindex(room: Room): void {
  room.seats.forEach((seat, i) => {
    seat.seat = i;
    seat.color = PLAYER_COLORS[i % PLAYER_COLORS.length] as PlayerColor;
  });
}

export function seatOfUser(room: Room, userId: string): Seat | undefined {
  return room.seats.find((s) => s.userId === userId);
}

export function snapshot(room: Room): RoomSnapshot {
  const host = room.seats.find((s) => s.userId === room.hostUserId);
  const seats: SeatState[] = room.seats.map((s) => ({
    seat: s.seat,
    name: s.name,
    color: s.color,
    isBot: s.isBot,
    botDifficulty: s.botDifficulty,
    connected: s.connected,
    isHost: s.userId === room.hostUserId,
    ready: s.ready,
    userId: s.userId,
  }));
  return {
    code: room.code,
    phase: room.phase,
    hostSeat: host?.seat ?? 0,
    seats,
    rules: room.rules,
    layout: room.layout,
    maxPlayers: room.maxPlayers,
  };
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  create(hostUserId: string, hostName: string, opts: { rules?: Partial<GameRules>; layout?: string }): Room {
    let code = genCode();
    while (this.rooms.has(code)) code = genCode();

    const room: Room = {
      code,
      phase: 'lobby',
      hostUserId,
      seats: [],
      rules: { ...DEFAULT_RULES, ...opts.rules },
      layout: opts.layout ?? 'random',
      maxPlayers: MAX_PLAYERS,
      state: null,
      seed: null,
      startedAt: null,
      botRunning: false,
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    this.addHuman(room, hostUserId, hostName);
    return room;
  }

  /** Join (or re-join) a room. Returns the seat, or an error string. */
  join(room: Room, userId: string, name: string, socketId: string): Seat | string {
    const existing = seatOfUser(room, userId);
    if (existing) {
      existing.connected = true;
      existing.socketId = socketId;
      existing.name = name;
      return existing;
    }
    if (room.phase !== 'lobby') return 'Game already started';
    if (room.seats.length >= room.maxPlayers) return 'Room is full';
    const seat = this.addHuman(room, userId, name);
    seat.socketId = socketId;
    return seat;
  }

  private addHuman(room: Room, userId: string, name: string): Seat {
    const seat: Seat = {
      seat: room.seats.length,
      userId,
      name,
      color: 'blue',
      isBot: false,
      botDifficulty: null,
      connected: true,
      ready: false,
      socketId: null,
    };
    room.seats.push(seat);
    reindex(room);
    return seat;
  }

  addBot(room: Room, byUserId: string, difficulty: BotDifficulty): string | null {
    if (room.hostUserId !== byUserId) return 'Only the host can add bots';
    if (room.phase !== 'lobby') return 'Game already started';
    if (room.seats.length >= room.maxPlayers) return 'Room is full';
    const n = room.seats.filter((s) => s.isBot).length + 1;
    room.seats.push({
      seat: room.seats.length,
      userId: null,
      name: `Bot ${n}`,
      color: 'blue',
      isBot: true,
      botDifficulty: difficulty,
      connected: true,
      ready: true,
      socketId: null,
    });
    reindex(room);
    return null;
  }

  removeSeat(room: Room, byUserId: string, seatNo: number): string | null {
    if (room.hostUserId !== byUserId) return 'Only the host can remove seats';
    if (room.phase !== 'lobby') return 'Game already started';
    const target = room.seats.find((s) => s.seat === seatNo);
    if (!target) return 'No such seat';
    if (target.userId === room.hostUserId) return 'The host cannot be removed';
    room.seats = room.seats.filter((s) => s.seat !== seatNo);
    reindex(room);
    return null;
  }

  setReady(room: Room, userId: string, ready: boolean): void {
    const seat = seatOfUser(room, userId);
    if (seat) seat.ready = ready;
  }

  /** Detach a socket on disconnect; keep the seat so the player can reconnect. */
  disconnect(room: Room, socketId: string): Seat | undefined {
    const seat = room.seats.find((s) => s.socketId === socketId);
    if (seat) {
      seat.connected = false;
      seat.socketId = null;
    }
    return seat;
  }

  /** Start the game: freeze seats into a GameState with a server-chosen seed. */
  start(room: Room, byUserId: string): string | null {
    if (room.hostUserId !== byUserId) return 'Only the host can start the game';
    if (room.phase !== 'lobby') return 'Game already started';
    if (room.seats.length < 2) return 'Need at least 2 players';
    const humansReady = room.seats.filter((s) => !s.isBot).every((s) => s.ready || s.userId === room.hostUserId);
    if (!humansReady) return 'Not everyone is ready';

    const seed = (Math.random() * 2 ** 31) | 0; // authoritative: never from a client
    room.state = createGame({
      players: room.seats.map((s) => ({
        name: s.name,
        isBot: s.isBot,
        color: s.color,
        botDifficulty: s.botDifficulty ?? undefined,
      })),
      layout: room.layout as never,
      seed,
      rules: room.rules,
    });
    room.seed = seed;
    room.startedAt = Date.now();
    room.phase = 'playing';
    return null;
  }

  delete(code: string): void {
    this.rooms.delete(code.toUpperCase());
  }

  /** Drop empty/stale rooms (call periodically). */
  sweep(maxAgeMs = 6 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const anyHumanConnected = room.seats.some((s) => !s.isBot && s.connected);
      const tooOld = now - room.createdAt > maxAgeMs;
      if (!anyHumanConnected && (tooOld || room.phase === 'lobby')) this.rooms.delete(code);
    }
  }
}
