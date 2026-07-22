// Network protocol shared by the browser client and the authoritative server.
// This file is PURE (no socket.io / node imports) so both sides agree on the
// exact wire shapes and on how state is redacted before it leaves the server.

import type { Action } from '../engine/actions';
import { emptyBank } from '../engine/types';
import type { BotDifficulty, GameRules, GameState, Player, PlayerColor } from '../engine/types';
import { totalResources } from '../engine/helpers';

// ---------------------------------------------------------------------------
// Redaction — what a given seat is allowed to see
// ---------------------------------------------------------------------------

/** A player as seen by a specific viewer. Opponents' private cards are stripped,
 *  but their public counts are preserved so the UI can still show hand sizes. */
export interface RedactedPlayer extends Player {
  /** Total resource cards in hand (always accurate, even for opponents). */
  handCount: number;
  /** Number of unplayed dev cards in hand (always accurate). */
  unplayedDevCount: number;
}

/** A GameState personalized for one seat. Structurally a superset of GameState,
 *  so existing view code that reads a GameState keeps working. */
export interface RedactedGameState extends Omit<GameState, 'players'> {
  players: RedactedPlayer[];
  /** How many dev cards remain in the deck (order hidden). */
  devDeckCount: number;
}

/**
 * Produce the view of `state` that seat `forSeat` is allowed to receive.
 *
 * Hides, for everyone but the viewer:
 *  - opponents' exact resource hands (kept as a count only),
 *  - opponents' dev cards (kept as an unplayed count only),
 *  - the dev-deck ORDER (would reveal the next card to be bought),
 *  - the RNG seed (would let a client predict every future die roll, steal and
 *    shuffle — the single most important anti-cheat redaction),
 *  - the bank composition when the `hideBankCards` rule is on.
 *
 * Pure: never mutates `state`.
 */
export function redactState(state: GameState, forSeat: number | null): RedactedGameState {
  const players = state.players.map((p): RedactedPlayer => {
    const handCount = totalResources(p.resources);
    const unplayedDevCount = p.devCards.filter((c) => !c.played).length;
    if (p.id === forSeat) {
      return { ...p, handCount, unplayedDevCount };
    }
    return { ...p, resources: emptyBank(), devCards: [], handCount, unplayedDevCount };
  });

  return {
    ...state,
    players,
    devDeck: [],
    devDeckCount: state.devDeck.length,
    rng: { seed: 0 },
    bank: state.rules.hideBankCards ? emptyBank() : state.bank,
  };
}

/** Keep effect-relevant action context while hiding private resource choices. */
export function redactAction(action: Action, actorSeat: number, forSeat: number): Action {
  if (action.type === 'discard' && action.player !== forSeat) {
    return { ...action, resources: {} };
  }
  if (action.type === 'playYearOfPlenty' && actorSeat !== forSeat) {
    return { ...action, resources: [] };
  }
  return action;
}

// --- View accessors that work on BOTH raw and redacted players --------------
// Local play holds a raw GameState; online play holds a RedactedGameState.
// These let the UI use a single code path in either mode.

export function handSize(p: Player | RedactedPlayer): number {
  return 'handCount' in p ? p.handCount : totalResources(p.resources);
}

export function unplayedDevCount(p: Player | RedactedPlayer): number {
  return 'unplayedDevCount' in p ? p.unplayedDevCount : p.devCards.filter((c) => !c.played).length;
}

/** Dev cards left in the deck. Works on raw (local) or redacted (online) state. */
export function devDeckSize(state: GameState | RedactedGameState): number {
  return 'devDeckCount' in state ? state.devDeckCount : state.devDeck.length;
}

// ---------------------------------------------------------------------------
// Lobby / room wire types
// ---------------------------------------------------------------------------

export type RoomPhase = 'lobby' | 'playing' | 'over';

/** One seat in a room, as broadcast to every member of the room. */
export interface SeatState {
  seat: number;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  botDifficulty: BotDifficulty | null;
  /** For human seats: are they currently connected? Always true for bots. */
  connected: boolean;
  isHost: boolean;
  ready: boolean;
  /** Auth0-derived user id for human seats; null for bots. Not secret. */
  userId: string | null;
}

/** One seat's answer to a rematch proposal. */
export interface RematchVote {
  seat: number;
  name: string;
  vote: 'pending' | 'yes' | 'no';
}

/** A pending "play again" proposal. Nobody is pulled into a new game until every
 *  connected human has answered; decliners simply keep their seat out of it. */
export interface RematchState {
  proposedBy: number;
  proposedByName: string;
  votes: RematchVote[];
}

/** Public snapshot of a room's lobby, broadcast on every change. */
export interface RoomSnapshot {
  code: string;
  /** Seat belonging to the receiving socket; null for spectators. */
  yourSeat?: number | null;
  phase: RoomPhase;
  hostSeat: number;
  seats: SeatState[];
  rules: GameRules;
  layout: string;
  maxPlayers: number;
  /** Connected read-only viewers, deduplicated per account. */
  spectators: { name: string }[];
  /** Set while a "play again" proposal is awaiting answers. */
  rematch: RematchState | null;
}

/** Result envelope returned via Socket.IO acknowledgements. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Chat — room-scoped, spans the lobby and the live game
// ---------------------------------------------------------------------------

/** Longest chat message the server accepts; longer text is trimmed. */
export const MAX_CHAT_LENGTH = 300;
/** How many recent messages a room keeps (and replays to joiners). */
export const MAX_CHAT_HISTORY = 100;

/** One chat line. `seat` is null (and `color` is null) for system notices. */
export interface ChatMessage {
  id: number;
  seat: number | null;
  name: string;
  color: PlayerColor | null;
  text: string;
  ts: number;
  system?: boolean;
  /** Drives a join/leave sound on the client; unset for other system notices. */
  kind?: 'join' | 'leave';
}

// ---------------------------------------------------------------------------
// Socket.IO typed events (used to parametrize Server<>/Socket<> on both sides)
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  createRoom: (payload: { rules?: Partial<GameRules>; layout?: string }, ack: (res: Result<{ code: string; seat: number }>) => void) => void;
  joinRoom: (payload: { code: string }, ack: (res: Result<{ code: string; seat: number; phase: RoomPhase }>) => void) => void;
  watchGame: (payload: { code: string }, ack: (res: Result<{ code: string; seat: number | null }>) => void) => void;
  /** The still-active room this ACCOUNT holds a seat in, so "Rejoin" survives a
   *  new tab, browser or device. Null when the account holds no seat. */
  findMyRoom: (ack: (res: Result<{ code: string; phase: RoomPhase } | null>) => void) => void;
  leaveRoom: (ack: (res: Result<null>) => void) => void;
  updateRoom: (payload: { rules?: Partial<GameRules>; layout?: string }, ack: (res: Result<null>) => void) => void;
  setReady: (payload: { ready: boolean }, ack: (res: Result<null>) => void) => void;
  addBot: (payload: { difficulty: BotDifficulty }, ack: (res: Result<null>) => void) => void;
  setBotDifficulty: (payload: { seat: number; difficulty: BotDifficulty }, ack: (res: Result<null>) => void) => void;
  setSeatColor: (payload: { seat: number; color: PlayerColor }, ack: (res: Result<null>) => void) => void;
  removeSeat: (payload: { seat: number }, ack: (res: Result<null>) => void) => void;
  startGame: (ack: (res: Result<null>) => void) => void;
  /** Offer a rematch once the game is over; asks every other human to opt in. */
  proposeRematch: (ack: (res: Result<null>) => void) => void;
  respondRematch: (payload: { accept: boolean }, ack: (res: Result<null>) => void) => void;
  gameAction: (payload: { action: Action }, ack: (res: Result<null>) => void) => void;
  sendChat: (payload: { text: string }, ack: (res: Result<null>) => void) => void;
}

export interface ServerToClientEvents {
  room: (snapshot: RoomSnapshot) => void;
  gameState: (payload: { state: RedactedGameState; yourSeat: number | null; action: Action | null }) => void;
  gameOver: (payload: { winnerSeat: number | null; scores: { seat: number; vp: number }[] }) => void;
  errorMsg: (payload: { message: string }) => void;
  chat: (message: ChatMessage) => void;
  chatHistory: (payload: { messages: ChatMessage[] }) => void;
}

/** Data attached to each authenticated socket (set by the auth middleware). */
export interface SocketData {
  userId: string;
  name: string;
}
