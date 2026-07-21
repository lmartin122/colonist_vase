import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import {
  reduce,
  redactAction,
  redactState,
  victoryPoints,
  type Action,
  type ClientToServerEvents,
  type Result,
  type ServerToClientEvents,
  type SocketData,
} from '@colonist/shared';
import { verifyToken } from './auth';
import { config } from './config';
import { getUserStats, listUserGames, recordFinishedGame, upsertUser } from './db';
import { RoomManager, seatOfUser, snapshot, type Room } from './rooms';
import { authorizeSeat, driveBots } from './runtime';

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (error: string): Result<never> => ({ ok: false, error });

function isAction(value: unknown): value is Action {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

const rooms = new RoomManager();
/** socket.id → room code, so we can find a socket's room on any event. */
const socketRoom = new Map<string, string>();
/** Give a player a short window to recover an accidental disconnect. */
const RECONNECT_GRACE_MS = 10_000;
const departureTimers = new Map<string, ReturnType<typeof setTimeout>>();

function departureKey(roomCode: string, userId: string): string {
  return `${roomCode}:${userId}`;
}

function cancelDeparture(roomCode: string, userId: string): void {
  const key = departureKey(roomCode, userId);
  const timer = departureTimers.get(key);
  if (timer) clearTimeout(timer);
  departureTimers.delete(key);
}

function scheduleDeparture(room: Room, userId: string): void {
  cancelDeparture(room.code, userId);
  const key = departureKey(room.code, userId);
  departureTimers.set(key, setTimeout(() => {
    departureTimers.delete(key);
    const current = rooms.get(room.code);
    const seat = current && seatOfUser(current, userId);
    if (!current || !seat || seat.connected) return;
    if (current.phase === 'lobby') {
      const hasHumans = rooms.leaveLobby(current, userId);
      if (hasHumans) broadcastRoom(current);
      else rooms.delete(current.code);
      return;
    }
    if (current.phase === 'playing' && rooms.replaceWithBot(current, userId)) {
      const ended = rooms.endIfOnlyBotsRemain(current);
      if (ended) void finishIfOver(current);
      broadcastRoom(current);
      broadcastState(current);
      if (!ended) void driveAndBroadcast(current);
    }
  }, RECONNECT_GRACE_MS));
}

// ---------------------------------------------------------------------------
// HTTP (REST) — profile + match history
// ---------------------------------------------------------------------------

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

interface AuthedRequest extends express.Request {
  identity?: { userId: string; name: string };
}

async function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }
  try {
    req.identity = await verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json(req.identity);
});

app.get('/me/games', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await listUserGames(req.identity!.userId));
});

app.get('/me/stats', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await getUserStats(req.identity!.userId));
});

// ---------------------------------------------------------------------------
// WebSocket (Socket.IO) — lobby + authoritative gameplay
// ---------------------------------------------------------------------------

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: { origin: config.corsOrigin },
});

// Authenticate every socket from the Auth0 access token in the handshake.
io.use(async (socket, next) => {
  try {
    const token = String(socket.handshake.auth?.token ?? '');
    const identity = await verifyToken(token);
    socket.data.userId = identity.userId;
    socket.data.name = identity.name;
    void upsertUser(identity.userId, identity.name);
    next();
  } catch (err) {
    console.warn('[auth] socket rejected:', (err as Error).message, '| devNoAuth:', config.devNoAuth, '| domain set:', Boolean(config.auth.domain), '| audience:', config.auth.audience || '(none)');
    next(new Error('unauthorized'));
  }
});

function roomOf(socketId: string): Room | undefined {
  const code = socketRoom.get(socketId);
  return code ? rooms.get(code) : undefined;
}

function broadcastRoom(room: Room): void {
  const publicSnapshot = snapshot(room);
  for (const seat of room.seats) {
    if (seat.isBot || !seat.connected || !seat.socketId) continue;
    io.to(seat.socketId).emit('room', { ...publicSnapshot, yourSeat: seat.seat });
  }
  for (const socketId of room.spectators) {
    io.to(socketId).emit('room', { ...publicSnapshot, yourSeat: null });
  }
}

/** Send each connected human their own redacted view of the game. */
function broadcastState(room: Room, action: Action | null = null, actorSeat: number | null = null): void {
  if (!room.state) return;
  for (const seat of room.seats) {
    if (seat.isBot || !seat.connected || !seat.socketId) continue;
    io.to(seat.socketId).emit('gameState', {
      state: redactState(room.state, seat.seat),
      yourSeat: seat.seat,
      action: action && actorSeat !== null ? redactAction(action, actorSeat, seat.seat) : null,
    });
  }
  for (const socketId of room.spectators) {
    io.to(socketId).emit('gameState', {
      state: redactState(room.state, null),
      yourSeat: null,
      action: action && actorSeat !== null ? redactAction(action, actorSeat, -1) : null,
    });
  }
}

/** Replay a room's recent chat straight to one socket (on join/watch). */
function emitChatHistory(room: Room, socketId: string): void {
  io.to(socketId).emit('chatHistory', { messages: room.chat });
}

async function finishIfOver(room: Room): Promise<void> {
  if (!room.state || room.state.phase !== 'gameOver' || room.phase === 'over') return;
  room.phase = 'over';
  const scores = room.seats.map((s) => ({ seat: s.seat, vp: victoryPoints(room.state!, s.seat) }));
  io.to(room.code).emit('gameOver', { winnerSeat: room.state.winner, scores });
  await recordFinishedGame(room);
}

/** Advance bots (one room at a time) and stream each step to the clients. */
async function driveAndBroadcast(room: Room): Promise<void> {
  if (room.botRunning || !room.state) return;
  const runtimeVersion = room.runtimeVersion;
  room.botRunning = true;
  let settled = room.state;
  try {
    settled = await driveBots(
      room.state,
      (next, action, actor) => {
        if (room.runtimeVersion !== runtimeVersion) return;
        room.state = next;
        broadcastState(room, action, actor);
      },
      config.botDelayMs,
      () => room.runtimeVersion === runtimeVersion,
    );
  } finally {
    room.botRunning = false;
  }
  if (room.runtimeVersion !== runtimeVersion) {
    await driveAndBroadcast(room);
    return;
  }
  room.state = settled;
  await finishIfOver(room);
}

io.on('connection', (socket) => {
  const { userId, name } = socket.data;
  /** Sliding-window timestamps for this socket's chat, to throttle spam. */
  const chatTimes: number[] = [];

  socket.on('createRoom', (payload, ack) => {
    const room = rooms.create(userId, name, { rules: payload?.rules, layout: payload?.layout });
    socketRoom.set(socket.id, room.code);
    socket.join(room.code);
    const seat = seatOfUser(room, userId);
    if (seat) seat.socketId = socket.id;
    broadcastRoom(room);
    emitChatHistory(room, socket.id);
    ack(ok({ code: room.code, seat: seat?.seat ?? 0 }));
  });

  socket.on('joinRoom', ({ code }, ack) => {
    const room = rooms.get(code);
    if (!room) return ack(fail('Room not found'));
    const isNewSeat = !seatOfUser(room, userId);
    const result = rooms.join(room, userId, name, socket.id);
    if (typeof result === 'string') return ack(fail(result));
    cancelDeparture(room.code, userId);
    socketRoom.set(socket.id, room.code);
    socket.join(room.code);
    broadcastRoom(room);
    emitChatHistory(room, socket.id);
    if (isNewSeat) io.to(room.code).emit('chat', rooms.systemChat(room, `${name} joined the room.`));
    // Reconnection: replay the current game view straight to this socket.
    if (room.phase !== 'lobby' && room.state) {
      broadcastState(room);
    }
    ack(ok({ code: room.code, seat: result.seat, phase: room.phase }));
  });

  socket.on('watchGame', ({ code }, ack) => {
    const room = rooms.get(code);
    if (!room || !room.state || room.phase === 'lobby') return ack(fail('Game not found'));

    const existing = seatOfUser(room, userId);
    if (existing) {
      const result = rooms.join(room, userId, name, socket.id);
      if (typeof result === 'string') return ack(fail(result));
      cancelDeparture(room.code, userId);
      socketRoom.set(socket.id, room.code);
      socket.join(room.code);
      broadcastRoom(room);
      emitChatHistory(room, socket.id);
      broadcastState(room);
      return ack(ok({ code: room.code, seat: result.seat }));
    }

    room.spectators.add(socket.id);
    socketRoom.set(socket.id, room.code);
    socket.join(room.code);
    socket.emit('room', { ...snapshot(room), yourSeat: null });
    emitChatHistory(room, socket.id);
    socket.emit('gameState', { state: redactState(room.state, null), yourSeat: null, action: null });
    ack(ok({ code: room.code, seat: null }));
  });

  socket.on('leaveRoom', (ack) => {
    const room = roomOf(socket.id);
    if (room) {
      // Detach first so the broadcasts below cannot put the room back into the
      // leaving client's freshly-cleared StartScreen state.
      socket.leave(room.code);
      socketRoom.delete(socket.id);
      if (room.spectators.delete(socket.id)) {
        ack(ok(null));
        return;
      }
      if (room.phase === 'lobby') {
        cancelDeparture(room.code, userId);
        rooms.disconnect(room, socket.id);
        const hasHumans = rooms.leaveLobby(room, userId);
        if (hasHumans) broadcastRoom(room);
        else rooms.delete(room.code);
      } else {
        cancelDeparture(room.code, userId);
        const disconnectedSeat = rooms.disconnect(room, socket.id);
        if (disconnectedSeat) {
          const replaced = room.phase === 'playing' && rooms.replaceWithBot(room, userId);
          const ended = replaced && rooms.endIfOnlyBotsRemain(room);
          if (ended) void finishIfOver(room);
          broadcastRoom(room);
          if (replaced) {
            broadcastState(room);
            if (!ended) void driveAndBroadcast(room);
          }
        }
      }
    }
    socketRoom.delete(socket.id);
    ack(ok(null));
  });

  socket.on('updateRoom', (payload, ack) => {
    const room = roomOf(socket.id);
    if (!room) return ack(fail('Not in a room'));
    const error = rooms.updateSettings(room, userId, payload);
    if (error) return ack(fail(error));
    broadcastRoom(room);
    ack(ok(null));
  });

  socket.on('setReady', ({ ready }, ack) => {
    const room = roomOf(socket.id);
    if (!room) return ack(fail('Not in a room'));
    rooms.setReady(room, userId, ready);
    broadcastRoom(room);
    ack(ok(null));
  });

  socket.on('addBot', ({ difficulty }, ack) => {
    const room = roomOf(socket.id);
    if (!room) return ack(fail('Not in a room'));
    const error = rooms.addBot(room, userId, difficulty);
    if (error) return ack(fail(error));
    broadcastRoom(room);
    ack(ok(null));
  });

  socket.on('setBotDifficulty', ({ seat, difficulty }, ack) => {
    const room = roomOf(socket.id);
    if (!room) return ack(fail('Not in a room'));
    const error = rooms.setBotDifficulty(room, userId, seat, difficulty);
    if (error) return ack(fail(error));
    broadcastRoom(room);
    ack(ok(null));
  });

  socket.on('setSeatColor', ({ seat, color }, ack) => {
    const room = roomOf(socket.id);
    if (!room) return ack(fail('Not in a room'));
    const error = rooms.setSeatColor(room, userId, seat, color);
    if (error) return ack(fail(error));
    broadcastRoom(room);
    ack(ok(null));
  });

  socket.on('removeSeat', ({ seat }, ack) => {
    const room = roomOf(socket.id);
    if (!room) return ack(fail('Not in a room'));
    const error = rooms.removeSeat(room, userId, seat);
    if (error) return ack(fail(error));
    broadcastRoom(room);
    ack(ok(null));
  });

  socket.on('startGame', async (ack) => {
    const room = roomOf(socket.id);
    if (!room) return ack(fail('Not in a room'));
    const error = rooms.start(room, userId);
    if (error) return ack(fail(error));
    ack(ok(null));
    broadcastRoom(room);
    io.to(room.code).emit('chat', rooms.systemChat(room, 'The game has started. Good luck!'));
    broadcastState(room);
    await driveAndBroadcast(room);
  });

  socket.on('gameAction', async ({ action }, ack) => {
    const room = roomOf(socket.id);
    if (!room || !room.state || room.phase !== 'playing') return ack(fail('No game in progress'));
    if (!isAction(action)) return ack(fail('Malformed action'));
    const seat = seatOfUser(room, userId);
    if (!seat) return ack(fail('You have no seat in this game'));

    const authError = authorizeSeat(room.state, seat.seat, action);
    if (authError) return ack(fail(authError));

    const result = reduce(room.state, action);
    if (!result.ok) return ack(fail(result.error));

    room.state = result.state;
    ack(ok(null));
    broadcastState(room, action, seat.seat);
    await finishIfOver(room);
    await driveAndBroadcast(room);
  });

  socket.on('sendChat', ({ text }, ack) => {
    const room = roomOf(socket.id);
    if (!room) return ack(fail('Not in a room'));
    if (typeof text !== 'string') return ack(fail('Malformed message'));
    const now = Date.now();
    while (chatTimes.length && now - chatTimes[0] > 10_000) chatTimes.shift();
    if (chatTimes.length >= 10) return ack(fail('You are sending messages too quickly'));
    const message = rooms.postChat(room, userId, text);
    if (typeof message === 'string') return ack(fail(message));
    chatTimes.push(now);
    io.to(room.code).emit('chat', message);
    ack(ok(null));
  });

  socket.on('disconnect', () => {
    const room = roomOf(socket.id);
    if (room) {
      if (room.spectators.delete(socket.id)) {
        socketRoom.delete(socket.id);
        return;
      }
      const disconnectedSeat = rooms.disconnect(room, socket.id);
      if (disconnectedSeat) {
        broadcastRoom(room);
        if (room.phase !== 'over' && disconnectedSeat.userId) scheduleDeparture(room, disconnectedSeat.userId);
      }
    }
    socketRoom.delete(socket.id);
  });
});

// Periodically drop stale/empty rooms.
setInterval(() => rooms.sweep(), 10 * 60 * 1000);

httpServer.listen(config.port, () => {
  console.log(`Colonist server listening on :${config.port} (client origin ${config.clientOrigin})`);
  if (config.devNoAuth) console.warn('DEV_NO_AUTH is ON — tokens are NOT verified. Do not use in production.');
});
