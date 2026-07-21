import { io, type Socket } from 'socket.io-client';
import type {
  Action,
  BotDifficulty,
  ClientToServerEvents,
  GameRules,
  PlayerColor,
  RoomPhase,
  Result,
  ServerToClientEvents,
} from '@colonist/shared';
import { SERVER_URL } from '../auth/config';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Open (or reuse) the authenticated socket. Pass a fresh Auth0 access token.
 * `name` is the display name from the ID token: Auth0 access tokens carry no
 * profile claims, so the server uses this unless a verified name claim exists.
 */
export function connectSocket(token: string, name = ''): GameSocket {
  if (socket) {
    socket.auth = { token, name };
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(SERVER_URL, { auth: { token, name }, transports: ['websocket'], autoConnect: true });
  return socket;
}

export function getSocket(): GameSocket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** Emit an event and resolve with the server's ack (or an error envelope). */
function request<T>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<Result<T>> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, error: 'Not connected to the server' });
    let settled = false;
    const finish = (result: Result<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(
      () => finish({ ok: false, error: 'The server did not respond' }),
      REQUEST_TIMEOUT_MS,
    );
    const ack = (res: Result<T>) => finish(res ?? { ok: false, error: 'No response from server' });
    // Call through `socket` so Socket.IO keeps its `this` binding (a detached
    // `socket.emit` reference throws "Cannot read properties of undefined (_opts)").
    (socket.emit as (e: string, ...a: unknown[]) => void).call(socket, event, ...args, ack);
  });
}

export const sendGameAction = (action: Action) => request<null>('gameAction', { action });
export const createRoom = (payload: { rules?: Partial<GameRules>; layout?: string }) =>
  request<{ code: string; seat: number }>('createRoom', payload);
export const joinRoom = (code: string) =>
  request<{ code: string; seat: number; phase: RoomPhase }>('joinRoom', { code });
export const watchGame = (code: string) =>
  request<{ code: string; seat: number | null }>('watchGame', { code });
/** Ask the server which active room this account still holds a seat in. */
export const findMyRoom = () => request<{ code: string; phase: RoomPhase } | null>('findMyRoom');
export const leaveRoom = () => request<null>('leaveRoom');
export const updateRoom = (payload: { rules?: Partial<GameRules>; layout?: string }) =>
  request<null>('updateRoom', payload);
export const setReady = (ready: boolean) => request<null>('setReady', { ready });
export const addBot = (difficulty: BotDifficulty) => request<null>('addBot', { difficulty });
export const setBotDifficulty = (seat: number, difficulty: BotDifficulty) =>
  request<null>('setBotDifficulty', { seat, difficulty });
export const setSeatColor = (seat: number, color: PlayerColor) =>
  request<null>('setSeatColor', { seat, color });
export const removeSeat = (seat: number) => request<null>('removeSeat', { seat });
export const startGame = () => request<null>('startGame');
export const proposeRematch = () => request<null>('proposeRematch');
export const respondRematch = (accept: boolean) => request<null>('respondRematch', { accept });
export const sendChat = (text: string) => request<null>('sendChat', { text });
