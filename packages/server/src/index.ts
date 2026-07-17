import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import {
  reduce,
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
import { listUserGames, recordFinishedGame, upsertUser } from './db';
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
  io.to(room.code).emit('room', snapshot(room));
}

/** Send each connected human their own redacted view of the game. */
function broadcastState(room: Room): void {
  if (!room.state) return;
  for (const seat of room.seats) {
    if (seat.isBot || !seat.connected || !seat.socketId) continue;
    io.to(seat.socketId).emit('gameState', { state: redactState(room.state, seat.seat), yourSeat: seat.seat });
  }
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
  room.botRunning = true;
  try {
    room.state = await driveBots(
      room.state,
      (next) => {
        room.state = next;
        broadcastState(room);
      },
      config.botDelayMs,
    );
  } finally {
    room.botRunning = false;
  }
  await finishIfOver(room);
}

io.on('connection', (socket) => {
  const { userId, name } = socket.data;

  socket.on('createRoom', (payload, ack) => {
    const room = rooms.create(userId, name, { rules: payload?.rules, layout: payload?.layout });
    socketRoom.set(socket.id, room.code);
    socket.join(room.code);
    const seat = seatOfUser(room, userId);
    if (seat) seat.socketId = socket.id;
    broadcastRoom(room);
    ack(ok({ code: room.code }));
  });

  socket.on('joinRoom', ({ code }, ack) => {
    const room = rooms.get(code);
    if (!room) return ack(fail('Room not found'));
    const result = rooms.join(room, userId, name, socket.id);
    if (typeof result === 'string') return ack(fail(result));
    socketRoom.set(socket.id, room.code);
    socket.join(room.code);
    broadcastRoom(room);
    // Reconnection: replay the current game view straight to this socket.
    if (room.phase !== 'lobby' && room.state) {
      socket.emit('gameState', { state: redactState(room.state, result.seat), yourSeat: result.seat });
    }
    ack(ok({ code: room.code }));
  });

  socket.on('leaveRoom', (ack) => {
    const room = roomOf(socket.id);
    if (room) {
      if (room.phase === 'lobby') {
        rooms.removeSeat(room, room.hostUserId, seatOfUser(room, userId)?.seat ?? -1);
      } else {
        rooms.disconnect(room, socket.id);
      }
      socket.leave(room.code);
      broadcastRoom(room);
    }
    socketRoom.delete(socket.id);
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
    broadcastState(room);
    await finishIfOver(room);
    await driveAndBroadcast(room);
  });

  socket.on('disconnect', () => {
    const room = roomOf(socket.id);
    if (room) {
      rooms.disconnect(room, socket.id);
      broadcastRoom(room);
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
