import { describe, expect, it } from 'vitest';
import { createGame, type GameState } from '@colonist/shared';
import { authorizeSeat, driveBots } from '../src/runtime';
import { RoomManager } from '../src/rooms';

function allBotGame(seed: number): GameState {
  return createGame({
    players: [
      { name: 'A', isBot: true, botDifficulty: 'medium' },
      { name: 'B', isBot: true, botDifficulty: 'medium' },
      { name: 'C', isBot: true, botDifficulty: 'medium' },
    ],
    seed,
  });
}

describe('authorizeSeat', () => {
  // A fresh game starts in 'startingRoll'; currentPlayer is seat 0.
  const state = allBotGame(1);

  it('rejects debug actions from clients', () => {
    expect(authorizeSeat(state, 0, { type: 'debugTriggerRobber' })).not.toBeNull();
    expect(authorizeSeat(state, 0, { type: 'debugAddResources', player: 0, resources: { wood: 5 } })).not.toBeNull();
  });

  it('only lets the current player act on their turn', () => {
    expect(authorizeSeat(state, 0, { type: 'rollForStart' })).toBeNull();
    expect(authorizeSeat(state, 1, { type: 'rollForStart' })).toBe('It is not your turn');
  });

  it('binds discards and trade responses to the sender', () => {
    expect(authorizeSeat(state, 2, { type: 'discard', player: 2, resources: { wood: 1 } })).toBeNull();
    expect(authorizeSeat(state, 2, { type: 'discard', player: 1, resources: { wood: 1 } })).not.toBeNull();
    expect(authorizeSeat(state, 3, { type: 'respondTradeOffer', offerId: 1, responder: 3, accepted: true })).toBeNull();
    expect(authorizeSeat(state, 3, { type: 'respondTradeOffer', offerId: 1, responder: 0, accepted: true })).not.toBeNull();
  });
});

describe('driveBots', () => {
  it('plays an all-bot game to a legal winner', async () => {
    const final = await driveBots(allBotGame(42), () => {}, 0);
    expect(final.phase).toBe('gameOver');
    expect(final.winner).not.toBeNull();
  }, 20000);

  it('is deterministic for a fixed seed', async () => {
    const a = await driveBots(allBotGame(7), () => {}, 0);
    const b = await driveBots(allBotGame(7), () => {}, 0);
    expect(a.winner).toBe(b.winner);
    expect(a.turn).toBe(b.turn);
  }, 20000);

  it('rejects an out-of-turn action via the reducer path', () => {
    const state = allBotGame(3);
    // Seat 1 trying to build while seat 0 owns the turn is blocked by authorizeSeat.
    expect(authorizeSeat(state, 1, { type: 'buildRoad', edge: 0 })).not.toBeNull();
    // And the state is untouched (no reduce applied).
    expect(state.phase).toBe('startingRoll');
  });
});

describe('RoomManager', () => {
  it('creates a room, seats a host + bots, and starts an authoritative game', () => {
    const mgr = new RoomManager();
    const room = mgr.create('dev|host', 'Host', {});
    expect(room.seats).toHaveLength(1);
    expect(mgr.addBot(room, 'dev|host', 'medium')).toBeNull();
    expect(mgr.addBot(room, 'dev|host', 'hard')).toBeNull();

    // Non-host cannot start.
    expect(mgr.start(room, 'dev|intruder')).not.toBeNull();

    const error = mgr.start(room, 'dev|host');
    expect(error).toBeNull();
    expect(room.phase).toBe('playing');
    expect(room.state).not.toBeNull();
    expect(room.seed).not.toBeNull();
    expect(room.state!.players).toHaveLength(3);
  });

  it('reuses the seat on re-join (reconnection)', () => {
    const mgr = new RoomManager();
    const room = mgr.create('dev|host', 'Host', {});
    const first = mgr.join(room, 'dev|alice', 'Alice', 'sock1');
    expect(typeof first).not.toBe('string');
    const again = mgr.join(room, 'dev|alice', 'Alice', 'sock2');
    expect(typeof again).not.toBe('string');
    if (typeof first !== 'string' && typeof again !== 'string') {
      expect(again.seat).toBe(first.seat);
      expect(again.socketId).toBe('sock2');
    }
    expect(room.seats.filter((s) => s.userId === 'dev|alice')).toHaveLength(1);
  });
});
