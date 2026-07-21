import { customAlphabet } from 'nanoid';
import {
  DEFAULT_RULES,
  MAX_CHAT_HISTORY,
  MAX_CHAT_LENGTH,
  PLAYER_COLORS,
  createGame,
  reduce,
  type BotDifficulty,
  type ChatMessage,
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
  /** True while this human-owned seat has been handed to a bot. */
  abandoned: boolean;
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
  /** Connected read-only viewers. They never occupy a player seat. */
  spectators: Set<string>;
  /** Invalidates an in-flight bot loop when seat control changes. */
  runtimeVersion: number;
  createdAt: number;
  /** Room-scoped chat, capped at MAX_CHAT_HISTORY; spans lobby and game. */
  chat: ChatMessage[];
  /** Monotonic id source for chat messages. */
  chatSeq: number;
}

/** Keep seat numbers contiguous after lobby changes without overwriting chosen colors. */
function reindex(room: Room): void {
  room.seats.forEach((seat, i) => {
    seat.seat = i;
  });
}

function availableColor(room: Room): PlayerColor {
  return PLAYER_COLORS.find((color) => !room.seats.some((seat) => seat.color === color)) ?? PLAYER_COLORS[0];
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
      spectators: new Set(),
      runtimeVersion: 0,
      createdAt: Date.now(),
      chat: [],
      chatSeq: 0,
    };
    this.rooms.set(code, room);
    this.addHuman(room, hostUserId, hostName);
    return room;
  }

  /** Join (or re-join) a room. Returns the seat, or an error string. */
  join(room: Room, userId: string, name: string, socketId: string): Seat | string {
    const existing = seatOfUser(room, userId);
    if (existing) {
      const reclaimingBot = existing.isBot;
      existing.connected = true;
      existing.socketId = socketId;
      existing.name = name;
      existing.abandoned = false;
      if (reclaimingBot) {
        existing.isBot = false;
        existing.botDifficulty = null;
        if (room.phase === 'lobby') existing.ready = false;
        if (room.state) {
          room.state = {
            ...room.state,
            players: room.state.players.map((player) => player.id === existing.seat
              ? { ...player, name, isBot: false, botDifficulty: null }
              : player),
            log: [...room.state.log, { turn: room.state.turn, player: existing.seat, message: `${name} rejoined and took control.` }],
          };
        }
        room.runtimeVersion += 1;
      }
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
      color: availableColor(room),
      isBot: false,
      botDifficulty: null,
      connected: true,
      ready: false,
      socketId: null,
      abandoned: false,
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
      color: availableColor(room),
      isBot: true,
      botDifficulty: difficulty,
      connected: true,
      ready: true,
      socketId: null,
      abandoned: false,
    });
    reindex(room);
    return null;
  }

  setBotDifficulty(room: Room, byUserId: string, seatNo: number, difficulty: BotDifficulty): string | null {
    if (room.hostUserId !== byUserId) return 'Only the host can change bot difficulty';
    if (room.phase !== 'lobby') return 'Game already started';
    const target = room.seats.find((seat) => seat.seat === seatNo);
    if (!target?.isBot) return 'No bot in that seat';
    target.botDifficulty = difficulty;
    return null;
  }

  setSeatColor(room: Room, byUserId: string, seatNo: number, color: PlayerColor): string | null {
    if (room.phase !== 'lobby') return 'Game already started';
    const target = room.seats.find((seat) => seat.seat === seatNo);
    if (!target) return 'No such seat';
    const canChange = target.userId === byUserId || (target.isBot && room.hostUserId === byUserId);
    if (!canChange) return 'You cannot change that player color';
    const other = room.seats.find((seat) => seat.seat !== seatNo && seat.color === color);
    if (other) return 'Color is already in use';
    target.color = color;
    return null;
  }

  /** Remove a human who voluntarily leaves and transfer hosting when needed. */
  leaveLobby(room: Room, userId: string): boolean {
    const target = seatOfUser(room, userId);
    if (!target) return room.seats.some((seat) => !seat.isBot);
    const wasHost = target.userId === room.hostUserId;
    room.seats = room.seats.filter((seat) => seat !== target);
    if (wasHost) {
      const nextHost = room.seats.find((seat) => !seat.isBot && seat.userId);
      if (nextHost?.userId) room.hostUserId = nextHost.userId;
    }
    reindex(room);
    return room.seats.some((seat) => !seat.isBot);
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

  private appendChat(room: Room, message: ChatMessage): ChatMessage {
    room.chat.push(message);
    if (room.chat.length > MAX_CHAT_HISTORY) room.chat.splice(0, room.chat.length - MAX_CHAT_HISTORY);
    return message;
  }

  /** Post a human chat line. Returns the stored message, or an error string. */
  postChat(room: Room, userId: string, text: string): ChatMessage | string {
    const sender = seatOfUser(room, userId);
    if (!sender || sender.isBot) return 'Only seated players can chat';
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH);
    if (!clean) return 'Message is empty';
    return this.appendChat(room, {
      id: ++room.chatSeq,
      seat: sender.seat,
      name: sender.name,
      color: sender.color,
      text: clean,
      ts: Date.now(),
    });
  }

  /** Post a system notice (joins, game start, …). */
  systemChat(room: Room, text: string): ChatMessage {
    return this.appendChat(room, {
      id: ++room.chatSeq,
      seat: null,
      name: 'System',
      color: null,
      text,
      ts: Date.now(),
      system: true,
    });
  }

  updateSettings(room: Room, byUserId: string, opts: { rules?: Partial<GameRules>; layout?: string }): string | null {
    if (room.hostUserId !== byUserId) return 'Only the host can change room settings';
    if (room.phase !== 'lobby') return 'Game already started';
    if (opts.layout !== undefined && opts.layout !== 'random' && opts.layout !== 'classic') return 'Invalid board layout';
    if (opts.rules) room.rules = { ...room.rules, ...opts.rules };
    if (opts.layout) room.layout = opts.layout;
    return null;
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

  /** Replace an abandoned in-game human with a medium bot while reserving the
   * seat for that same account to reclaim later. Pending responses from the
   * departing human are declined first so no trade can deadlock the match. */
  replaceWithBot(room: Room, userId: string, difficulty: BotDifficulty = 'medium'): boolean {
    const seat = seatOfUser(room, userId);
    if (!seat || seat.isBot || seat.connected || !room.seats.some((candidate) => candidate !== seat)) return false;

    if (room.phase !== 'playing' || !room.state) return false;

    let next = room.state;
    for (const offer of next.tradeOffers) {
      if (offer.responses[seat.seat]?.status !== 'pending') continue;
      const result = reduce(next, { type: 'respondTradeOffer', offerId: offer.id, responder: seat.seat, accepted: false });
      if (result.ok) next = result.state;
    }

    seat.isBot = true;
    seat.botDifficulty = difficulty;
    seat.connected = true;
    seat.socketId = null;
    seat.abandoned = true;
    room.state = {
      ...next,
      players: next.players.map((player) => player.id === seat.seat
        ? { ...player, isBot: true, botDifficulty: difficulty }
        : player),
      log: [...next.log, { turn: next.turn, player: seat.seat, message: `${seat.name} left; a bot took over.` }],
    };
    room.runtimeVersion += 1;
    return true;
  }

  /** Stop an active match once every human-owned seat has been abandoned. */
  endIfOnlyBotsRemain(room: Room): boolean {
    if (room.phase !== 'playing' || !room.state) return false;
    if (room.seats.some((seat) => seat.userId && !seat.isBot)) return false;
    room.state = {
      ...room.state,
      phase: 'gameOver',
      winner: null,
      log: [...room.state.log, {
        turn: room.state.turn,
        player: null,
        message: 'All players left. The game ended.',
      }],
    };
    room.runtimeVersion += 1;
    return true;
  }

  /** Start the game: freeze seats into a GameState with a server-chosen seed. */
  start(room: Room, byUserId: string): string | null {
    if (room.hostUserId !== byUserId) return 'Only the host can start the game';
    if (room.phase !== 'lobby') return 'Game already started';
    if (room.seats.length < 2) return 'Need at least 2 players';
    const humansReady = room.seats
      .filter((s) => !s.isBot)
      .every((s) => s.connected && (s.ready || s.userId === room.hostUserId));
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
