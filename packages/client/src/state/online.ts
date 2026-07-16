import { create } from 'zustand';
import type { RoomSnapshot } from '@colonist/shared';
import { connectSocket, disconnectSocket, joinRoom } from '../net/socket';
import { useGame } from './store';

export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface GameOver {
  winnerSeat: number | null;
  scores: { seat: number; vp: number }[];
}

interface OnlineState {
  status: ConnStatus;
  room: RoomSnapshot | null;
  /** Room code we belong to, used to auto-rejoin after a reconnect. */
  code: string | null;
  gameOver: GameOver | null;
  error: string | null;

  connect: (token: string) => void;
  disconnect: () => void;
  setCode: (code: string | null) => void;
  clearError: () => void;
  clearGameOver: () => void;
}

export const useOnline = create<OnlineState>((set, get) => ({
  status: 'disconnected',
  room: null,
  code: null,
  gameOver: null,
  error: null,

  connect(token) {
    const socket = connectSocket(token);
    // Rebind cleanly so repeated connect() calls don't stack listeners.
    socket.off();

    socket.on('connect', () => {
      set({ status: 'connected' });
      // Reconnection: if we were in a room, transparently re-join it.
      const code = get().code;
      if (code) void joinRoom(code);
    });
    socket.on('connect_error', (err) => set({ status: 'error', error: err.message }));
    socket.on('disconnect', () => set({ status: 'disconnected' }));

    socket.on('room', (room) => set({ room, code: room.code }));
    socket.on('gameState', ({ state, yourSeat }) => useGame.getState().applyServerState(state, yourSeat));
    socket.on('gameOver', (payload) => set({ gameOver: payload }));
    socket.on('errorMsg', ({ message }) => set({ error: message }));

    // Reconcile immediately: if the socket was ALREADY connected when we
    // (re)bound handlers — e.g. React StrictMode's double-invoke in dev — the
    // 'connect' event won't fire again, so set the status here.
    set({ status: socket.connected ? 'connected' : 'connecting' });
  },

  disconnect() {
    disconnectSocket();
    set({ status: 'disconnected', room: null, code: null, gameOver: null });
  },

  setCode(code) {
    set({ code });
  },
  clearError() {
    set({ error: null });
  },
  clearGameOver() {
    set({ gameOver: null });
  },
}));
