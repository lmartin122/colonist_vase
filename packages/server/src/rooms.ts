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
  /** Connected read-only viewers by socket id. They never occupy a player seat. */
  spectators: Map<string, { userId: string; name: string }>;
  /** Invalidates an in-flight bot loop when seat control changes. */
  runtimeVersion: number;
  createdAt: number;
  /** Room-scoped chat, capped at MAX_CHAT_HISTORY; spans lobby and game. */
  chat: ChatMessage[];
  /** Monotonic id source for chat messages. */
  chatSeq: number;
  /** Pending "play again" proposal, keyed by seat. */
  rematch: { proposedBy: number; votes: Record<number, 'pending' | 'yes' | 'no'> } | null;
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
  const proposer = room.rematch ? room.seats.find((s) => s.seat === room.rematch!.proposedBy) : undefined;
  // Dedupe by account so one person watching from several tabs counts once.
  const spectators = [...new Map(
    [...room.spectators.values()].map((viewer) => [viewer.userId, viewer.name]),
  )].map(([, name]) => ({ name }));
  return {
    code: room.code,
    phase: room.phase,
    hostSeat: host?.seat ?? 0,
    seats,
    rules: room.rules,
    layout: room.layout,
    maxPlayers: room.maxPlayers,
    spectators,
    rematch: room.rematch
      ? {
          proposedBy: room.rematch.proposedBy,
          proposedByName: proposer?.name ?? 'A player',
          votes: Object.entries(room.rematch.votes).map(([seat, vote]) => ({
            seat: Number(seat),
            name: room.seats.find((s) => s.seat === Number(seat))?.name ?? '',
            vote,
          })),
        }
      : null,
  };
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /**
   * The still-active room this account holds a seat in, if any. Seats are keyed
   * by userId and are reserved when a player leaves mid-game (a bot takes over),
   * so this is what lets "Rejoin" work from a fresh tab or another device.
   */
  findByUser(userId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.phase !== 'over' && seatOfUser(room, userId)) return room;
    }
    return undefined;
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
      spectators: new Map(),
      runtimeVersion: 0,
      createdAt: Date.now(),
      chat: [],
      chatSeq: 0,
      rematch: null,
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

  /** Post a system notice (joins, game start, …). `kind` drives a client sound
   *  for join/leave notices; omit it for notices that shouldn't play one. */
  systemChat(room: Room, text: string, kind?: 'join' | 'leave'): ChatMessage {
    return this.appendChat(room, {
      id: ++room.chatSeq,
      seat: null,
      name: 'System',
      color: null,
      text,
      ts: Date.now(),
      system: true,
      kind,
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

  /**
   * Offer a rematch after a finished game. Every OTHER connected human is asked
   * to opt in, so nobody is dragged into a new match they'd have to abandon.
   */
  proposeRematch(room: Room, userId: string): string | null {
    if (room.phase !== 'over') return 'The game is not over yet';
    if (room.rematch) return 'A rematch has already been proposed';
    const proposer = seatOfUser(room, userId);
    if (!proposer || proposer.isBot) return 'You have no seat in this game';
    const votes: Record<number, 'pending' | 'yes' | 'no'> = { [proposer.seat]: 'yes' };
    for (const seat of room.seats) {
      if (seat.isBot || seat.seat === proposer.seat) continue;
      if (seat.connected) votes[seat.seat] = 'pending';
    }
    room.rematch = { proposedBy: proposer.seat, votes };
    return null;
  }

  respondRematch(room: Room, userId: string, accept: boolean): string | null {
    if (!room.rematch) return 'No rematch was proposed';
    const seat = seatOfUser(room, userId);
    if (!seat || room.rematch.votes[seat.seat] === undefined) return 'You were not asked';
    room.rematch.votes[seat.seat] = accept ? 'yes' : 'no';
    return null;
  }

  /** True once nobody still connected owes an answer. */
  rematchSettled(room: Room): boolean {
    if (!room.rematch) return false;
    return Object.entries(room.rematch.votes).every(([seat, vote]) => {
      if (vote !== 'pending') return true;
      // A player who dropped out mid-vote no longer blocks the rematch.
      return !room.seats.find((s) => s.seat === Number(seat))?.connected;
    });
  }

  /**
   * Apply a settled rematch: keep bots and the humans who accepted, drop the
   * rest, and hand the room back to the lobby. Returns false (caller should drop
   * the room) when no human wants to continue.
   */
  applyRematch(room: Room): boolean {
    const votes = room.rematch?.votes ?? {};
    // Keep real bots and the humans who opted in; a seat a bot took over for a
    // departed player goes away with them.
    room.seats = room.seats.filter(
      (seat) => (seat.isBot && !seat.abandoned) || votes[seat.seat] === 'yes',
    );
    room.rematch = null;
    if (!room.seats.some((seat) => !seat.isBot)) return false;
    if (!room.seats.some((seat) => seat.userId === room.hostUserId)) {
      const nextHost = room.seats.find((seat) => !seat.isBot && seat.userId);
      if (nextHost?.userId) room.hostUserId = nextHost.userId;
    }
    for (const seat of room.seats) {
      seat.ready = seat.isBot;
      seat.abandoned = false;
    }
    reindex(room);
    room.phase = 'lobby';
    room.state = null;
    room.seed = null;
    room.startedAt = null;
    room.runtimeVersion += 1;
    return true;
  }

  cancelRematch(room: Room): void {
    room.rematch = null;
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
