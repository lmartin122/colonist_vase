import { create } from 'zustand';
import { MAX_CHAT_HISTORY, type ChatMessage, type RoomSnapshot } from '@colonist/shared';
import { connectSocket, disconnectSocket, joinRoom, sendChat, watchGame } from '../net/socket';
import { useGame } from './store';

export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const LAST_ROOM_CODE_KEY = 'cv-last-room-code';

function storedLastCode(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(LAST_ROOM_CODE_KEY);
}

function rememberLastCode(code: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  if (code) sessionStorage.setItem(LAST_ROOM_CODE_KEY, code);
  else sessionStorage.removeItem(LAST_ROOM_CODE_KEY);
}

interface GameOver {
  winnerSeat: number | null;
  scores: { seat: number; vp: number }[];
}

interface OnlineState {
  status: ConnStatus;
  room: RoomSnapshot | null;
  /** This client's current lobby seat, confirmed by create/join acknowledgements. */
  seat: number | null;
  spectating: boolean;
  /** Room code we belong to, used to auto-rejoin after a reconnect. */
  code: string | null;
  /** Most recent room code, kept after an intentional leave so the seat can be reclaimed. */
  lastCode: string | null;
  gameOver: GameOver | null;
  error: string | null;
  /** Room chat, replayed by the server on join and appended live. */
  messages: ChatMessage[];

  connect: (token: string) => void;
  disconnect: () => void;
  setCode: (code: string | null) => void;
  setSeat: (seat: number | null) => void;
  clearError: () => void;
  clearGameOver: () => void;
  sendChat: (text: string) => Promise<boolean>;
}

export const useOnline = create<OnlineState>((set, get) => ({
  status: 'disconnected',
  room: null,
  seat: null,
  spectating: false,
  code: null,
  lastCode: storedLastCode(),
  gameOver: null,
  error: null,
  messages: [],

  connect(token) {
    const socket = connectSocket(token);
    // Rebind cleanly so repeated connect() calls don't stack listeners.
    socket.off();

    socket.on('connect', () => {
      set({ status: 'connected', error: null });
      // Reconnection: if we were in a room, transparently re-join it.
      const { code, spectating } = get();
      if (code)
        void (spectating ? watchGame(code) : joinRoom(code)).then((result) => {
          if (result.ok) {
            set({ seat: result.data.seat, spectating: result.data.seat === null });
            return;
          }
          set({ code: null, room: null, seat: null, spectating: false, error: result.error });
          if (window.location.pathname.startsWith('/room/') || window.location.pathname.startsWith('/game/'))
            window.history.replaceState(null, '', '/');
        });
    });
    socket.on('connect_error', (err) => set({ status: 'error', error: err.message }));
    socket.on('disconnect', () => set({ status: 'disconnected' }));

    socket.on('room', (room) => {
      rememberLastCode(room.code);
      const hasViewerSeat = room.yourSeat !== undefined;
      const seat = hasViewerSeat ? (room.yourSeat ?? null) : get().seat;
      set({ room, code: room.code, lastCode: room.code, seat, spectating: hasViewerSeat ? seat === null : get().spectating });
    });
    socket.on('gameState', ({ state, yourSeat, action }) =>
      useGame.getState().applyServerState(state, yourSeat, action),
    );
    socket.on('gameOver', (payload) => set({ gameOver: payload }));
    socket.on('errorMsg', ({ message }) => set({ error: message }));
    socket.on('chatHistory', ({ messages }) => set({ messages }));
    socket.on('chat', (message) =>
      set((state) => ({ messages: [...state.messages, message].slice(-MAX_CHAT_HISTORY) })),
    );

    // Reconcile immediately: if the socket was ALREADY connected when we
    // (re)bound handlers — e.g. React StrictMode's double-invoke in dev — the
    // 'connect' event won't fire again, so set the status here.
    set({ status: socket.connected ? 'connected' : 'connecting' });
  },

  disconnect() {
    disconnectSocket();
    rememberLastCode(null);
    set({
      status: 'disconnected',
      room: null,
      code: null,
      lastCode: null,
      seat: null,
      spectating: false,
      gameOver: null,
      messages: [],
    });
  },

  setCode(code) {
    set((state) => {
      const lastCode = code ?? state.code ?? state.lastCode;
      rememberLastCode(lastCode);
      return code === null
        ? { code: null, room: null, seat: null, spectating: false, lastCode, messages: [] }
        : { code, lastCode };
    });
  },
  setSeat(seat) {
    set({ seat, spectating: seat === null });
  },
  clearError() {
    set({ error: null });
  },
  clearGameOver() {
    set({ gameOver: null });
  },
  async sendChat(text) {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const result = await sendChat(trimmed);
    if (!result.ok) {
      set({ error: result.error });
      return false;
    }
    return true;
  },
}));
