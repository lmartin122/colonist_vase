import { describe, expect, it } from 'vitest';
import { createGame, type GameState } from '@colonist/shared';
import { authorizeSeat, botActor, driveBots } from '../src/runtime';
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

function allBotRushGame(seed: number): GameState {
  return createGame({
    players: [
      { name: 'A', isBot: true, botDifficulty: 'medium' },
      { name: 'B', isBot: true, botDifficulty: 'medium' },
      { name: 'C', isBot: true, botDifficulty: 'medium' },
    ],
    seed,
    rules: { mode: 'rush' },
  });
}

describe('authorizeSeat', () => {
  // A fresh game starts in 'startingRoll'; currentPlayer is seat 0.
  const state = allBotGame(1);

  it('rejects debug actions from clients', () => {
    expect(authorizeSeat(state, 0, { type: 'debugTriggerRobber' })).not.toBeNull();
    expect(
      authorizeSeat(state, 0, { type: 'debugAddResources', player: 0, resources: { wood: 5 } }),
    ).not.toBeNull();
  });

  it('only lets the current player act on their turn', () => {
    expect(authorizeSeat(state, 0, { type: 'rollForStart' })).toBeNull();
    expect(authorizeSeat(state, 1, { type: 'rollForStart' })).toBe('It is not your turn');
  });

  it('binds discards and trade responses to the sender', () => {
    expect(
      authorizeSeat(state, 2, { type: 'discard', player: 2, resources: { wood: 1 } }),
    ).toBeNull();
    expect(
      authorizeSeat(state, 2, { type: 'discard', player: 1, resources: { wood: 1 } }),
    ).not.toBeNull();
    expect(
      authorizeSeat(state, 3, {
        type: 'respondTradeOffer',
        offerId: 1,
        responder: 3,
        accepted: true,
      }),
    ).toBeNull();
    expect(
      authorizeSeat(state, 3, {
        type: 'respondTradeOffer',
        offerId: 1,
        responder: 0,
        accepted: true,
      }),
    ).not.toBeNull();
  });

  it('binds concurrent Rush actions to the sending seat', () => {
    const state = { ...allBotRushGame(11), phase: 'rushRound' as const };
    expect(authorizeSeat(state, 1, { type: 'buyDevCard', player: 1 })).toBeNull();
    expect(authorizeSeat(state, 1, { type: 'buyDevCard', player: 2 })).not.toBeNull();
    expect(authorizeSeat(state, 1, { type: 'buyDevCard' })).not.toBeNull();
  });
});

describe('driveBots', () => {
  it('stops an in-flight bot loop when seat ownership changes', async () => {
    let active = true;
    let streamed = 0;
    await driveBots(
      allBotGame(8),
      () => {
        streamed += 1;
        active = false;
      },
      0,
      () => active,
    );
    expect(streamed).toBe(1);
  });

  it('reports the action and actor for every streamed bot state', async () => {
    const streamed: { type: string; actor: number }[] = [];
    await driveBots(
      allBotGame(9),
      (_next, action, actor) => streamed.push({ type: action.type, actor }),
      0,
    );
    expect(streamed.length).toBeGreaterThan(0);
    expect(streamed.every(({ actor }) => Number.isInteger(actor))).toBe(true);
    expect(streamed.some(({ type }) => type === 'placeSetupSettlement')).toBe(true);
  }, 20000);

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

  it('plays an all-bot Rush game to a legal winner', async () => {
    const final = await driveBots(allBotRushGame(42), () => {}, 0);
    expect(final.phase).toBe('gameOver');
    expect(final.winner).not.toBeNull();
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

  it('accepts, trims and attributes chat from seated players, and rejects outsiders', () => {
    const mgr = new RoomManager();
    const room = mgr.create('dev|host', 'Host', {});
    mgr.join(room, 'dev|alice', 'Alice', 'sock1');

    const message = mgr.postChat(room, 'dev|alice', '  hello   there  ');
    expect(typeof message).not.toBe('string');
    if (typeof message !== 'string') {
      expect(message.text).toBe('hello there');
      expect(message.name).toBe('Alice');
      expect(message.seat).toBe(1);
      expect(message.system).toBeUndefined();
    }

    expect(mgr.postChat(room, 'dev|alice', '   ')).toBe('Message is empty');
    expect(mgr.postChat(room, 'dev|stranger', 'hi')).toBe('Only seated players can chat');

    // Bots occupy seats but must never chat.
    mgr.addBot(room, 'dev|host', 'medium');
    const botSeat = room.seats.find((seat) => seat.isBot)!;
    expect(mgr.postChat(room, botSeat.userId ?? '', 'beep')).toBe('Only seated players can chat');

    const system = mgr.systemChat(room, 'The game has started.');
    expect(system).toMatchObject({ seat: null, color: null, system: true });
    expect(room.chat).toHaveLength(2);
  });

  it('caps chat history at MAX_CHAT_HISTORY, keeping the most recent lines', () => {
    const mgr = new RoomManager();
    const room = mgr.create('dev|host', 'Host', {});
    for (let index = 0; index < 130; index++) mgr.postChat(room, 'dev|host', `msg ${index}`);
    expect(room.chat.length).toBe(100);
    expect(room.chat[0].text).toBe('msg 30');
    expect(room.chat.at(-1)?.text).toBe('msg 129');
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
    // A late disconnect event from the replaced socket must not disconnect
    // the newly attached session.
    expect(mgr.disconnect(room, 'sock1')).toBeUndefined();
    expect(room.seats[1].connected).toBe(true);
    expect(room.seats[1].socketId).toBe('sock2');
    expect(room.seats.filter((s) => s.userId === 'dev|alice')).toHaveLength(1);
  });

  it('does not start while a ready human is disconnected, but preserves their seat for reconnection', () => {
    const mgr = new RoomManager();
    const room = mgr.create('dev|host', 'Host', {});
    const alice = mgr.join(room, 'dev|alice', 'Alice', 'sock1');
    expect(typeof alice).not.toBe('string');
    mgr.setReady(room, 'dev|alice', true);

    expect(mgr.disconnect(room, 'sock1')?.userId).toBe('dev|alice');
    expect(room.seats[1]).toMatchObject({ connected: false, ready: true, socketId: null });
    expect(mgr.start(room, 'dev|host')).toBe('Not everyone is ready');

    const rejoined = mgr.join(room, 'dev|alice', 'Alice', 'sock2');
    expect(typeof rejoined).not.toBe('string');
    expect(room.seats[1]).toMatchObject({ connected: true, ready: true, socketId: 'sock2' });
    expect(mgr.start(room, 'dev|host')).toBeNull();
  });

  it('replaces an abandoned in-game player with a bot and lets the same account reclaim the seat', () => {
    const mgr = new RoomManager();
    const room = mgr.create('dev|host', 'Host', {});
    const alice = mgr.join(room, 'dev|alice', 'Alice', 'sock1');
    expect(typeof alice).not.toBe('string');
    mgr.setReady(room, 'dev|alice', true);
    expect(mgr.start(room, 'dev|host')).toBeNull();
    const originalSeat = typeof alice === 'string' ? -1 : alice.seat;

    expect(mgr.disconnect(room, 'sock1')?.userId).toBe('dev|alice');
    expect(mgr.replaceWithBot(room, 'dev|alice')).toBe(true);
    expect(room.seats[originalSeat]).toMatchObject({
      userId: 'dev|alice',
      isBot: true,
      connected: true,
      socketId: null,
      abandoned: true,
    });
    expect(room.state!.players[originalSeat]).toMatchObject({
      isBot: true,
      botDifficulty: 'medium',
    });
    expect(room.state!.log.at(-1)?.message).toContain('a bot took over');

    const reclaimed = mgr.join(room, 'dev|alice', 'Alice', 'sock2');
    expect(typeof reclaimed).not.toBe('string');
    expect(typeof reclaimed === 'string' ? -1 : reclaimed.seat).toBe(originalSeat);
    expect(room.seats[originalSeat]).toMatchObject({
      userId: 'dev|alice',
      isBot: false,
      connected: true,
      socketId: 'sock2',
      abandoned: false,
    });
    expect(room.state!.players[originalSeat]).toMatchObject({ isBot: false, botDifficulty: null });
    expect(room.state!.log.at(-1)?.message).toContain('rejoined and took control');
  });

  it("hands a disconnected player's active turn to the replacement bot", async () => {
    const mgr = new RoomManager();
    const room = mgr.create('dev|host', 'Host', {});
    const alice = mgr.join(room, 'dev|alice', 'Alice', 'sock1');
    expect(typeof alice).not.toBe('string');
    mgr.setReady(room, 'dev|alice', true);
    expect(mgr.start(room, 'dev|host')).toBeNull();
    const aliceSeat = typeof alice === 'string' ? -1 : alice.seat;

    room.state = {
      ...room.state!,
      currentPlayer: aliceSeat,
      phase: 'main',
      pending: { ...room.state!.pending, hasRolled: true },
    };
    expect(mgr.disconnect(room, 'sock1')?.userId).toBe('dev|alice');
    expect(mgr.replaceWithBot(room, 'dev|alice')).toBe(true);
    expect(botActor(room.state!)).toBe(aliceSeat);

    const actors: number[] = [];
    await driveBots(
      room.state!,
      (_next, _action, actor) => actors.push(actor),
      0,
      () => actors.length < 1,
    );
    expect(actors).toEqual([aliceSeat]);
  });

  it('ends the game without a winner when every human-owned seat is abandoned', () => {
    const mgr = new RoomManager();
    const room = mgr.create('dev|host', 'Host', {});
    room.seats[0].socketId = 'host-socket';
    const alice = mgr.join(room, 'dev|alice', 'Alice', 'alice-socket');
    expect(typeof alice).not.toBe('string');
    mgr.setReady(room, 'dev|alice', true);
    expect(mgr.start(room, 'dev|host')).toBeNull();

    mgr.disconnect(room, 'host-socket');
    expect(mgr.replaceWithBot(room, 'dev|host')).toBe(true);
    expect(mgr.endIfOnlyBotsRemain(room)).toBe(false);
    mgr.disconnect(room, 'alice-socket');
    expect(mgr.replaceWithBot(room, 'dev|alice')).toBe(true);
    expect(mgr.endIfOnlyBotsRemain(room)).toBe(true);

    expect(room.state).toMatchObject({ phase: 'gameOver', winner: null });
    expect(room.seats.filter((seat) => seat.abandoned)).toHaveLength(2);
  });

  it('removes a departed lobby player and transfers hosting without adding a bot', () => {
    const mgr = new RoomManager();
    const room = mgr.create('dev|host', 'Host', {});
    room.seats[0].socketId = 'host-socket';
    const alice = mgr.join(room, 'dev|alice', 'Alice', 'alice-socket');
    expect(typeof alice).not.toBe('string');
    const hostColor = room.seats[0].color;

    expect(mgr.disconnect(room, 'host-socket')?.userId).toBe('dev|host');
    expect(mgr.replaceWithBot(room, 'dev|host')).toBe(false);
    expect(mgr.leaveLobby(room, 'dev|host')).toBe(true);
    expect(room.hostUserId).toBe('dev|alice');
    expect(room.seats).toHaveLength(1);
    expect(room.seats[0]).toMatchObject({ userId: 'dev|alice', seat: 0, isBot: false });
    expect(room.seats.some((seat) => seat.color === hostColor)).toBe(false);
  });

  it('keeps multiple active rooms isolated', () => {
    const mgr = new RoomManager();
    const first = mgr.create('dev|host-a', 'Host A', {});
    const second = mgr.create('dev|host-b', 'Host B', {});
    expect(mgr.addBot(first, 'dev|host-a', 'easy')).toBeNull();
    expect(mgr.addBot(second, 'dev|host-b', 'hard')).toBeNull();
    expect(mgr.start(first, 'dev|host-a')).toBeNull();
    expect(mgr.start(second, 'dev|host-b')).toBeNull();

    expect(first.code).not.toBe(second.code);
    expect(first.state).not.toBe(second.state);
    first.botRunning = true;
    first.state = { ...first.state!, turn: 99 };
    expect(second.botRunning).toBe(false);
    expect(second.state!.turn).not.toBe(99);
    expect(mgr.get(first.code)).toBe(first);
    expect(mgr.get(second.code)).toBe(second);
  });

  it('rejects occupied colors and transfers hosting when the host leaves', () => {
    const mgr = new RoomManager();
    const room = mgr.create('dev|host', 'Host', {});
    const joined = mgr.join(room, 'dev|alice', 'Alice', 'sock1');
    expect(typeof joined).not.toBe('string');

    expect(mgr.setSeatColor(room, 'dev|alice', 1, 'green')).toBeNull();
    expect(room.seats[1].color).toBe('green');
    const hostColor = room.seats[0].color;
    expect(mgr.setSeatColor(room, 'dev|host', 0, 'green')).toBe('Color is already in use');
    expect(room.seats.map((seat) => seat.color)).toEqual([hostColor, 'green']);
    expect(new Set(room.seats.map((seat) => seat.color)).size).toBe(2);

    expect(mgr.leaveLobby(room, 'dev|host')).toBe(true);
    expect(room.hostUserId).toBe('dev|alice');
    expect(room.seats).toHaveLength(1);
    expect(room.seats[0].seat).toBe(0);
  });
});
