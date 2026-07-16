import { io, type Socket } from 'socket.io-client';
import type { Action, BotDifficulty, ClientToServerEvents, GameRules, Result, ServerToClientEvents } from '@colonist/shared';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** Open (or reuse) the authenticated socket. Pass a fresh Auth0 access token. */
export function connectSocket(token: string): GameSocket {
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(SERVER_URL, { auth: { token }, transports: ['websocket'], autoConnect: true });
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
    const ack = (res: Result<T>) => resolve(res ?? { ok: false, error: 'No response from server' });
    // Call through `socket` so Socket.IO keeps its `this` binding (a detached
    // `socket.emit` reference throws "Cannot read properties of undefined (_opts)").
    (socket.emit as (e: string, ...a: unknown[]) => void).call(socket, event, ...args, ack);
  });
}

export const sendGameAction = (action: Action) => request<null>('gameAction', { action });
export const createRoom = (payload: { rules?: Partial<GameRules>; layout?: string }) => request<{ code: string }>('createRoom', payload);
export const joinRoom = (code: string) => request<{ code: string }>('joinRoom', { code });
export const leaveRoom = () => request<null>('leaveRoom');
export const setReady = (ready: boolean) => request<null>('setReady', { ready });
export const addBot = (difficulty: BotDifficulty) => request<null>('addBot', { difficulty });
export const removeSeat = (seat: number) => request<null>('removeSeat', { seat });
export const startGame = () => request<null>('startGame');
