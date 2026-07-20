import { describe, expect, it } from 'vitest';
import { applyOrThrow, botHasMoveAvailable, createGame, isConcurrentPhase, legalRoadEdges, nextBotAction, reduce, robberTargetTiles, stealableOpponents, victoryPoints } from '@colonist/shared';
import type { BotDifficulty, GameState, Resource } from '@colonist/shared';
import { automatedActor } from '../src/state/store';

function newRushGame(seed: number) {
  return createGame({
    players: [
      { name: 'A', isBot: true },
      { name: 'B', isBot: true },
      { name: 'C', isBot: true },
      { name: 'D', isBot: true },
    ],
    layout: 'random',
    seed,
    rules: { mode: 'rush' },
  });
}

function firstOpenVertex(state: GameState): number {
  return state.board.vertices.find((v) => {
    if (state.buildings[v.id]) return false;
    return v.adjacentVertexIds.every((a) => !state.buildings[a]);
  })!.id;
}

function edgeAt(state: GameState, vertex: number): number {
  return state.board.vertices[vertex].edgeIds.find((e) => state.roads[e] === undefined)!;
}

function autoSetup(state: GameState): GameState {
  let s = state;
  while (s.phase === 'startingRoll') s = applyOrThrow(s, { type: 'rollForStart' });
  while (s.phase === 'setup') {
    const v = firstOpenVertex(s);
    s = applyOrThrow(s, { type: 'placeSetupSettlement', vertex: v });
    s = applyOrThrow(s, { type: 'placeSetupRoad', edge: edgeAt(s, v) });
  }
  return s;
}

const RESOURCE_KEYS = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;

function autoDiscard(state: GameState, player: number): GameState {
  const required = state.pending.discards[player];
  const held = state.players[player].resources;
  const resources: Partial<Record<(typeof RESOURCE_KEYS)[number], number>> = {};
  let remaining = required;
  for (const resource of RESOURCE_KEYS) {
    const take = Math.min(remaining, held[resource]);
    if (take > 0) resources[resource] = take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  return applyOrThrow(state, { type: 'discard', player, resources });
}

function autoMoveRobber(state: GameState): GameState {
  const captain = state.pending.roundCaptain;
  const tile = robberTargetTiles(state, captain)[0];
  const victim = stealableOpponents(state, tile, captain)[0] ?? null;
  return applyOrThrow(state, { type: 'moveRobber', tile, stealFrom: victim, player: captain });
}

function reachRushRound(state: GameState): GameState {
  let next = autoSetup(state);
  while (next.phase === 'discard' || next.phase === 'moveRobber') {
    next = next.phase === 'discard'
      ? autoDiscard(next, Number(Object.keys(next.pending.discards)[0]))
      : autoMoveRobber(next);
  }
  expect(next.phase).toBe('rushRound');
  return next;
}

function setResources(state: GameState, player: number, resources: Partial<Record<Resource, number>>): GameState {
  return {
    ...state,
    players: state.players.map((item) => item.id === player ? {
      ...item,
      resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, ...resources },
    } : item),
  };
}

function mixedRushGame(seed: number): GameState {
  return createGame({
    players: [
      { name: 'You', isBot: false },
      { name: 'B', isBot: true },
      { name: 'C', isBot: true },
      { name: 'D', isBot: true },
    ],
    layout: 'random',
    seed,
    rules: { mode: 'rush' },
  });
}

function rushActor(state: GameState): number {
  if (state.phase === 'discard') return Number(Object.keys(state.pending.discards)[0]);
  if (isConcurrentPhase(state)) return state.turnOrder.find((id) => !state.pending.passed[id])!;
  return state.currentPlayer;
}

function playOutRush(seed: number, difficulties: BotDifficulty[] = ['medium', 'medium', 'medium', 'medium']): { state: GameState; actions: number } {
  let state = createGame({
    players: [
      { name: 'A', isBot: true, botDifficulty: difficulties[0] },
      { name: 'B', isBot: true, botDifficulty: difficulties[1] },
      { name: 'C', isBot: true, botDifficulty: difficulties[2] },
      { name: 'D', isBot: true, botDifficulty: difficulties[3] },
    ],
    layout: 'random',
    seed,
    rules: { mode: 'rush' },
  });

  let actions = 0;
  const MAX = 20000;
  while (state.phase !== 'gameOver' && actions < MAX) {
    const actor = rushActor(state);
    const action = nextBotAction(state, actor);
    expect(action, `no action at phase ${state.phase}`).not.toBeNull();
    const result = reduce(state, action!);
    if (!result.ok) {
      throw new Error(`Illegal AI action ${action!.type} at phase ${state.phase}: ${result.error}`);
    }
    state = result.state;
    actions += 1;
  }
  return { state, actions };
}

describe('rush mode', () => {
  it('enters a rushRound (or discard/moveRobber on a 7) right after setup', () => {
    const state = autoSetup(newRushGame(1));
    expect(['rushRound', 'discard', 'moveRobber']).toContain(state.phase);
    expect(state.pending.roundCaptain).toBe(state.turnOrder[0]);
    expect(state.pending.hasRolled).toBe(true);
    expect(Object.values(state.diceStats).reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(state.players.every((player) => player.stats.turnsTaken === 1)).toBe(true);
  });

  it('lets any player act regardless of turnOrder position, rejects passed players', () => {
    let state = autoSetup(newRushGame(2));
    while (state.phase !== 'rushRound') {
      if (state.phase === 'discard') {
        const owing = Number(Object.keys(state.pending.discards)[0]);
        state = autoDiscard(state, owing);
        continue;
      }
      if (state.phase === 'moveRobber') {
        state = autoMoveRobber(state);
        continue;
      }
      break;
    }
    expect(state.phase).toBe('rushRound');

    const actorId = state.turnOrder[state.turnOrder.length - 1];
    state = applyOrThrow(state, { type: 'debugAddResources', player: actorId, resources: { wood: 1, brick: 1 } });
    const before = state.players[actorId].stock.roads;
    const [edge] = legalRoadEdges(state, actorId);
    expect(edge).toBeDefined();
    state = applyOrThrow(state, { type: 'buildRoad', edge, player: actorId });
    expect(state.players[actorId].stock.roads).toBe(before - 1);

    state = applyOrThrow(state, { type: 'passRound', player: actorId });
    expect(state.pending.passed[actorId]).toBe(true);
    const [anotherEdge] = legalRoadEdges(state, actorId);
    const result = reduce(state, { type: 'buildRoad', edge: anotherEdge ?? edge, player: actorId });
    expect(result.ok).toBe(false);
  });

  it('closes the round once every player passes, rotating the captain and re-rolling', () => {
    let state = autoSetup(newRushGame(3));
    while (state.phase === 'discard' || state.phase === 'moveRobber') {
      if (state.phase === 'discard') {
        const owing = Number(Object.keys(state.pending.discards)[0]);
        state = autoDiscard(state, owing);
      } else {
        state = autoMoveRobber(state);
      }
    }
    expect(state.phase).toBe('rushRound');
    const captain = state.pending.roundCaptain;
    const turn = state.turn;

    for (const player of state.players) {
      state = applyOrThrow(state, { type: 'passRound', player: player.id });
    }

    expect(state.turn).toBe(turn + 1);
    expect(Object.values(state.diceStats).reduce((sum, count) => sum + count, 0)).toBe(2);
    expect(state.players.every((player) => player.stats.turnsTaken === 2)).toBe(true);
    expect(Object.values(state.pending.passed).every((v) => !v)).toBe(true);
    const expectedNextCaptain = state.turnOrder[(state.turnOrder.indexOf(captain) + 1) % state.turnOrder.length];
    expect(state.pending.roundCaptain).toBe(expectedNextCaptain);
  });

  it('lets a player cancel a pass and keep deciding', () => {
    let state = autoSetup(newRushGame(2));
    while (state.phase !== 'rushRound') {
      if (state.phase === 'discard') {
        state = autoDiscard(state, Number(Object.keys(state.pending.discards)[0]));
        continue;
      }
      if (state.phase === 'moveRobber') {
        state = autoMoveRobber(state);
        continue;
      }
      break;
    }
    expect(state.phase).toBe('rushRound');
    const actorId = state.turnOrder[0];
    state = applyOrThrow(state, { type: 'passRound', player: actorId });
    expect(state.pending.passed[actorId]).toBe(true);

    state = applyOrThrow(state, { type: 'cancelPass', player: actorId });
    expect(state.pending.passed[actorId]).toBe(false);
    expect(state.phase).toBe('rushRound');

    state = applyOrThrow(state, { type: 'debugAddResources', player: actorId, resources: { wood: 1, brick: 1 } });
    const [edge] = legalRoadEdges(state, actorId);
    expect(() => applyOrThrow(state, { type: 'buildRoad', edge, player: actorId })).not.toThrow();
  });

  it('keeps a player\'s outgoing trade visible when they pass', () => {
    let state = autoSetup(newRushGame(2));
    while (state.phase !== 'rushRound') {
      if (state.phase === 'discard') {
        state = autoDiscard(state, Number(Object.keys(state.pending.discards)[0]));
        continue;
      }
      if (state.phase === 'moveRobber') {
        state = autoMoveRobber(state);
        continue;
      }
      break;
    }
    const proposer = state.turnOrder[0];
    state = applyOrThrow(state, { type: 'debugAddResources', player: proposer, resources: { wood: 1 } });
    state = applyOrThrow(state, { type: 'createTradeOffer', give: { wood: 1 }, receive: { ore: 1 }, anyCount: 0, player: proposer });
    expect(state.tradeOffers).toHaveLength(1);

    state = applyOrThrow(state, { type: 'passRound', player: proposer });
    expect(state.tradeOffers).toHaveLength(1);
    expect(state.tradeOffers[0].proposer).toBe(proposer);
    expect(state.pending.passed[proposer]).toBe(true);
    expect(state.log.at(-1)?.message).toContain('passed');

    const turn = state.turn;
    for (const player of state.players) {
      if (player.id !== proposer) state = applyOrThrow(state, { type: 'passRound', player: player.id });
    }
    expect(state.turn).toBe(turn + 1);
    expect(state.tradeOffers).toHaveLength(1);
    expect(state.tradeOffers[0].proposer).toBe(proposer);
    expect(state.tradeOffers[0].createdTurn).toBe(turn);
  });

  it('auto-declines a passing player\'s unanswered incoming offer without cancelling it', () => {
    let state = autoSetup(createGame({
      players: [
        { name: 'You', isBot: false },
        { name: 'B', isBot: true },
        { name: 'C', isBot: true },
        { name: 'D', isBot: true },
      ],
      layout: 'random',
      seed: 2,
      rules: { mode: 'rush' },
    }));
    while (state.phase !== 'rushRound') {
      if (state.phase === 'discard') {
        state = autoDiscard(state, Number(Object.keys(state.pending.discards)[0]));
        continue;
      }
      if (state.phase === 'moveRobber') {
        state = autoMoveRobber(state);
        continue;
      }
      break;
    }
    const target = 0; // the human
    const proposer = state.turnOrder.find((id) => id !== target)!;
    state = applyOrThrow(state, { type: 'debugAddResources', player: proposer, resources: { wood: 1 } });
    state = applyOrThrow(state, { type: 'createTradeOffer', give: { wood: 1 }, receive: { ore: 1 }, anyCount: 0, target, player: proposer });
    const offer = state.tradeOffers[0];
    expect(offer.responses[target].status).toBe('pending');

    state = applyOrThrow(state, { type: 'passRound', player: target });
    expect(state.tradeOffers[0].responses[target].status).toBe('declined');

    const action = nextBotAction(state, proposer);
    expect(action).toEqual({ type: 'passRound', player: proposer });
    state = applyOrThrow(state, action!);
    expect(state.tradeOffers).toHaveLength(1);
    expect(state.tradeOffers[0].responses[target].status).toBe('declined');
    expect(state.pending.passed[proposer]).toBe(true);
  });

  it('does not create an unanswerable offer for a player who already passed', () => {
    let state = reachRushRound(mixedRushGame(24));
    const human = 0;
    const proposer = state.turnOrder.find((id) => id !== human)!;
    state = setResources(state, proposer, { wood: 1 });
    state = applyOrThrow(state, { type: 'passRound', player: human });

    expect(reduce(state, {
      type: 'createTradeOffer',
      give: { wood: 1 },
      receive: { ore: 1 },
      anyCount: 0,
      target: human,
      player: proposer,
    })).toMatchObject({ ok: false, error: 'Trade target has already passed this round' });
  });

  it('preserves an accepted offer across rounds and allows later completion', () => {
    let state = reachRushRound(mixedRushGame(25));
    state = setResources(state, 0, { ore: 1 });
    state = setResources(state, 1, { sheep: 1 });
    state = setResources(state, 2, {});
    state = setResources(state, 3, {});
    state = applyOrThrow(state, {
      type: 'createTradeOffer',
      give: { ore: 1 },
      receive: {},
      anyCount: 1,
      player: 0,
    });
    const offerId = state.tradeOffers[0].id;
    expect(state.tradeOffers[0].responses[1].status).toBe('accepted');

    for (const player of state.players) state = applyOrThrow(state, { type: 'passRound', player: player.id });
    expect(state.tradeOffers.some((offer) => offer.id === offerId)).toBe(true);

    while (state.phase === 'discard' || state.phase === 'moveRobber') {
      state = state.phase === 'discard'
        ? autoDiscard(state, Number(Object.keys(state.pending.discards)[0]))
        : autoMoveRobber(state);
    }
    const proposerBefore = { ...state.players[0].resources };
    const partnerBefore = { ...state.players[1].resources };

    state = applyOrThrow(state, { type: 'completeTradeOffer', offerId, partner: 1, player: 0 });
    expect(state.players[0].resources.ore).toBe(proposerBefore.ore - 1);
    expect(state.players[0].resources.sheep).toBe(proposerBefore.sheep + 1);
    expect(state.players[1].resources.ore).toBe(partnerBefore.ore + 1);
    expect(state.players[1].resources.sheep).toBe(partnerBefore.sheep - 1);
    expect(state.tradeOffers.some((offer) => offer.id === offerId)).toBe(false);
  });

  it('cancels a bot offer when an accepted partner can no longer pay', () => {
    let state = reachRushRound(mixedRushGame(30));
    const proposer = 1;
    state = setResources(state, proposer, { ore: 1 });
    state = setResources(state, 0, { sheep: 1 });
    state = setResources(state, 2, { sheep: 1 });
    state = setResources(state, 3, {});
    state = applyOrThrow(state, {
      type: 'createTradeOffer',
      give: { ore: 1 },
      receive: { sheep: 1 },
      anyCount: 0,
      target: 0,
      player: proposer,
    });
    const offer = state.tradeOffers[0];
    expect(offer.responses[2].status).toBe('accepted');
    state = applyOrThrow(state, { type: 'respondTradeOffer', offerId: offer.id, responder: 0, accepted: false });
    state = setResources(state, 2, {});

    expect(nextBotAction(state, proposer)).toEqual({ type: 'cancelTradeOffer', offerId: offer.id, player: proposer });
  });

  it('schedules a bot to cancel a pending offer it can no longer afford', () => {
    let state = reachRushRound(mixedRushGame(31));
    const proposer = 1;
    state = setResources(state, proposer, { wood: 1 });
    state = applyOrThrow(state, {
      type: 'createTradeOffer',
      give: { wood: 1 },
      receive: { ore: 1 },
      anyCount: 0,
      target: 0,
      player: proposer,
    });
    const offerId = state.tradeOffers[0].id;
    state = setResources(state, proposer, {});

    expect(botHasMoveAvailable(state, proposer)).toBe(true);
    expect(nextBotAction(state, proposer)).toEqual({ type: 'cancelTradeOffer', offerId, player: proposer });
  });

  it('blocks every non-discard action until all required discards finish', () => {
    let state = reachRushRound(newRushGame(26));
    state = setResources(state, 0, { wood: 2 });
    state = {
      ...state,
      phase: 'discard',
      pending: { ...state.pending, discards: { 0: 1 } },
    };

    expect(reduce(state, { type: 'passRound', player: 1 })).toMatchObject({
      ok: false,
      error: 'Resolve all required discards first',
    });
    expect(reduce(state, { type: 'respondTradeOffer', offerId: 99, responder: 0, accepted: false })).toMatchObject({
      ok: false,
      error: 'Resolve all required discards first',
    });

    state = applyOrThrow(state, { type: 'discard', player: 0, resources: { wood: 1 } });
    expect(state.phase).toBe('moveRobber');
  });

  it('tracks development-card limits independently for each player', () => {
    let state = reachRushRound(newRushGame(27));
    state = applyOrThrow(state, { type: 'debugGrantDevCard', player: 0, card: 'monopoly' });
    state = applyOrThrow(state, { type: 'debugGrantDevCard', player: 0, card: 'yearOfPlenty' });
    state = applyOrThrow(state, { type: 'debugGrantDevCard', player: 1, card: 'monopoly' });
    state = applyOrThrow(state, { type: 'playMonopoly', resource: 'wood', player: 0 });
    state = applyOrThrow(state, { type: 'playMonopoly', resource: 'brick', player: 1 });

    expect(state.pending.playedDevThisTurn).toMatchObject({ 0: true, 1: true });
    expect(reduce(state, { type: 'playYearOfPlenty', resources: ['ore', 'wheat'], player: 0 })).toMatchObject({
      ok: false,
      error: 'Only one development card per turn',
    });
  });

  it('keeps a bot captain moving the robber even with a pending human trade response', () => {
    let state = reachRushRound(mixedRushGame(28));
    const captain = state.turnOrder.find((id) => id !== 0)!;
    state = { ...state, currentPlayer: captain, pending: { ...state.pending, roundCaptain: captain } };
    state = setResources(state, captain, { wood: 1 });
    state = applyOrThrow(state, {
      type: 'createTradeOffer',
      give: { wood: 1 },
      receive: { ore: 1 },
      anyCount: 0,
      target: 0,
      player: captain,
    });
    state = applyOrThrow(state, { type: 'debugTriggerRobber' });

    expect(automatedActor(state, 0)).toBe(captain);
    expect(nextBotAction(state, captain)).toMatchObject({ type: 'moveRobber', player: captain });
  });

  it('rejects direct player trades during a concurrent round', () => {
    let state = reachRushRound(newRushGame(29));
    state = setResources(state, 0, { wood: 1 });
    state = setResources(state, 1, { brick: 1 });
    expect(reduce(state, {
      type: 'playerTrade',
      partner: 1,
      give: { wood: 1 },
      receive: { brick: 1 },
      player: 0,
    })).toMatchObject({ ok: false, error: 'Use trade offers during concurrent rounds' });
  });

  it('gates the robber-on-7 move to the round captain', () => {
    let state = autoSetup(newRushGame(3));
    while (state.phase === 'discard' || state.phase === 'moveRobber') {
      if (state.phase === 'discard') {
        state = autoDiscard(state, Number(Object.keys(state.pending.discards)[0]));
      } else {
        state = autoMoveRobber(state);
      }
    }
    expect(state.phase).toBe('rushRound');

    state = applyOrThrow(state, { type: 'debugTriggerRobber' });
    expect(state.phase).toBe('moveRobber');
    const captain = state.pending.roundCaptain;
    const nonCaptain = state.players.find((player) => player.id !== captain)!.id;
    const target = robberTargetTiles(state)[0];
    const [stealFrom] = stealableOpponents(state, target, captain);

    expect(reduce(state, { type: 'debugAddResources', player: nonCaptain, resources: { wood: 1 } })).toMatchObject({
      ok: false,
      error: 'Wait for the round captain to move the robber',
    });
    expect(reduce(state, { type: 'moveRobber', tile: target, stealFrom: stealFrom ?? null, player: nonCaptain })).toMatchObject({
      ok: false,
      error: 'Only the round captain can move the robber',
    });

    state = applyOrThrow(state, { type: 'moveRobber', tile: target, stealFrom: stealFrom ?? null, player: captain });
    expect(state.board.robberTileId).toBe(target);
    expect(state.phase).toBe('rushRound');
    expect(state.pending.roundCaptain).toBe(captain);
  });

  it.each([7, 11, 19])('reaches a deterministic winner in an all-bot Rush game (seed %i)', (seed) => {
    const a = playOutRush(seed);
    const b = playOutRush(seed);
    expect(a.state.phase).toBe('gameOver');
    expect(a.state.winner).not.toBeNull();
    expect(victoryPoints(a.state, a.state.winner!)).toBeGreaterThanOrEqual(10);
    expect(a.actions).toBe(b.actions);
    expect(a.state.winner).toBe(b.state.winner);
  });

  it('classic mode is unaffected (defaults still produce classic turn flow)', () => {
    const state = createGame({
      players: [{ name: 'A', isBot: true }, { name: 'B', isBot: true }],
      layout: 'classic',
      seed: 5,
    });
    expect(state.rules.mode).toBe('classic');
    expect(isConcurrentPhase(state)).toBe(false);
  });

  it('rejects unknown game modes at the configuration boundary', () => {
    expect(() => createGame({
      players: [{ name: 'A', isBot: true }, { name: 'B', isBot: true }],
      rules: { mode: 'turbo' as never },
    })).toThrow('Unknown game mode: turbo');
  });
});
