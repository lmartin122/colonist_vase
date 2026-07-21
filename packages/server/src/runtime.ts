import type { Action, GameState } from '@colonist/shared';
import { botHasMoveAvailable, isConcurrentPhase, nextBotAction, reduce } from '@colonist/shared';

/**
 * The authoritative game runtime. Pure/deterministic and independent of
 * Socket.IO or the database, so it can be unit-tested directly.
 */

/**
 * Authorize that `seat` is allowed to perform `action` right now.
 * Returns an error string to reject, or null to allow.
 *
 * The engine's `reduce` assumes the acting player IS `state.currentPlayer` for
 * most actions, so we MUST verify the sender owns the current turn — otherwise a
 * client could drive another player's turn. Discards and trade responses carry
 * an explicit player and are checked against the sender. Debug actions (which
 * grant resources/cards) are never accepted from a network client.
 */
export function authorizeSeat(state: GameState, seat: number, action: Action): string | null {
  switch (action.type) {
    case 'debugAddResources':
    case 'debugGrantDevCard':
    case 'debugTriggerRobber':
      return 'Debug actions are not allowed online';
    case 'expireTradeOffer':
      // Server-driven cleanup only, so a client cannot cut the rejection short.
      return 'Trade offers expire on their own';
    case 'discard':
      return action.player === seat ? null : 'You can only discard your own cards';
    case 'respondTradeOffer':
      return action.responder === seat ? null : 'You can only respond to trades for yourself';
    default:
      if (isConcurrentPhase(state)) {
        if (!('player' in action) || action.player !== seat) return 'Action must identify your own seat';
        return state.pending.passed[seat] ? 'You have already passed this round' : null;
      }
      return seat === state.currentPlayer ? null : 'It is not your turn';
  }
}

/**
 * Which bot seat, if any, is owed an action in the current state. Mirrors the
 * client's `automatedActor`, generalized to any number of humans: the server
 * drives only bot seats, and never auto-progresses while a HUMAN still owes a
 * trade-offer response (they must answer via the UI first).
 */
export function botActor(state: GameState): number | null {
  if (state.phase === 'gameOver') return null;

  if (state.phase === 'discard') {
    const botOwing = Object.keys(state.pending.discards)
      .map(Number)
      .find((p) => state.players[p].isBot);
    return botOwing ?? null;
  }

  if (state.phase === 'moveRobber') {
    return state.players[state.currentPlayer].isBot ? state.currentPlayer : null;
  }

  if (isConcurrentPhase(state)) {
    const bots = state.turnOrder.filter((seat) => state.players[seat].isBot);
    if (!bots.length) return null;
    const start = state.log.length % bots.length;
    for (let index = 0; index < bots.length; index++) {
      const seat = bots[(start + index) % bots.length];
      if (!state.pending.passed[seat] && botHasMoveAvailable(state, seat)) return seat;
    }
    return null;
  }

  const humanResponsePending = state.tradeOffers.some((offer) =>
    Object.entries(offer.responses).some(
      ([seat, response]) => response.status === 'pending' && !state.players[Number(seat)].isBot,
    ),
  );
  if (humanResponsePending) return null;

  return state.players[state.currentPlayer].isBot ? state.currentPlayer : null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Advance the game by applying bot actions until control returns to a human (or
 * the game ends). `onState` is called after every applied action so the caller
 * can broadcast each step. Returns the settled state.
 */
export async function driveBots(
  state: GameState,
  onState: (next: GameState, action: Action, actor: number) => void,
  delayMs = 0,
  shouldContinue: () => boolean = () => true,
): Promise<GameState> {
  let current = state;
  for (;;) {
    if (!shouldContinue()) break;
    const actor = botActor(current);
    if (actor === null) break;
    if (delayMs > 0) await wait(delayMs);
    if (!shouldContinue()) break;

    const action = nextBotAction(current, actor);
    if (!action) break;

    const result = reduce(current, action);
    if (!result.ok) {
      // A bot should never emit an illegal move; end its turn as a safety net.
      console.warn('[bot] illegal action, ending turn:', action, result.error);
      const fallbackAction: Action = isConcurrentPhase(current)
        ? { type: 'passRound', player: actor }
        : { type: 'endTurn' };
      const fallback = reduce(current, fallbackAction);
      if (!fallback.ok) break;
      current = fallback.state;
      onState(current, fallbackAction, actor);
      continue;
    }
    current = result.state;
    onState(current, action, actor);
  }
  return current;
}
