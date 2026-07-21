import { describe, expect, it } from 'vitest';
import { createGame } from '@colonist/shared';
import { applyOrThrow, reduce } from '@colonist/shared';
import { longestRoadLength } from '@colonist/shared';
import { bankTradeRatio, isOfferFullyDeclined, totalResources, victoryPoints } from '@colonist/shared';
import type { DevCardType, GameState, Resource } from '@colonist/shared';
import { legalRoadEdges, robberTargetTiles, stealableOpponents } from '@colonist/shared';
import { nextBotAction } from '@colonist/shared';
import { deriveFlights } from '../src/state/flights';
import { automatedActor } from '../src/state/store';
import type { Action } from '@colonist/shared';
import { MAX_VICTORY_POINTS } from '@colonist/shared';
import { canRevealLogResources } from '../src/ui/history';

function game(seed = 1): GameState {
  return createGame({
    players: [
      { name: 'A', isBot: false },
      { name: 'B', isBot: true },
      { name: 'C', isBot: true },
    ],
    layout: 'classic',
    seed,
  });
}

function firstOpenVertex(s: GameState): number {
  return s.board.vertices.find(
    (v) => !s.buildings[v.id] && v.adjacentVertexIds.every((a) => !s.buildings[a]),
  )!.id;
}
function edgeAt(s: GameState, vertex: number): number {
  return s.board.vertices[vertex].edgeIds.find((e) => s.roads[e] === undefined)!;
}
function autoSetup(s: GameState): GameState {
  while (s.phase === 'startingRoll') s = applyOrThrow(s, { type: 'rollForStart' });
  while (s.phase === 'setup') {
    const v = firstOpenVertex(s);
    s = applyOrThrow(s, { type: 'placeSetupSettlement', vertex: v });
    s = applyOrThrow(s, { type: 'placeSetupRoad', edge: edgeAt(s, v) });
  }
  return s;
}
/** Overwrite a player's entire resource bank (clears leftover setup resources). */
function setRes(s: GameState, player: number, res: Partial<Record<Resource, number>>): GameState {
  const players = s.players.map((p) =>
    p.id === player
      ? { ...p, resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, ...res } }
      : p,
  );
  return { ...s, players };
}

describe('bank trading', () => {
  it('gives 1 resource for the player-specific ratio', () => {
    let s: GameState = { ...autoSetup(game()), phase: 'main' };
    const ratio = bankTradeRatio(s, 0, 'wood'); // 4, or less if on a port
    s = setRes(s, 0, { wood: ratio });
    const res = reduce(s, { type: 'bankTrade', give: 'wood', receive: 'ore' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.players[0].resources.wood).toBe(0);
      expect(res.state.players[0].resources.ore).toBe(1);
      expect(res.state.players[0].stats.bankTrades).toBe(1);
      expect(res.state.players[0].stats.resourcesCollected.ore).toBeGreaterThanOrEqual(1);
      expect(res.state.log.at(-1)?.details).toEqual({
        type: 'trade', kind: 'bank', partner: null,
        give: { wood: ratio }, receive: { ore: 1 }, visibility: 'public',
      });
    }
  });

  it('rejects a bank trade without enough resources', () => {
    let s: GameState = { ...autoSetup(game()), phase: 'main' };
    const ratio = bankTradeRatio(s, 0, 'wood');
    s = setRes(s, 0, { wood: ratio - 1 });
    expect(reduce(s, { type: 'bankTrade', give: 'wood', receive: 'ore' }).ok).toBe(false);
  });
});

describe('trade offers', () => {
  it('keeps human responses pending until that player answers', () => {
    let s = autoSetup(game(15));
    s = {
      ...s,
      currentPlayer: 0,
      phase: 'main',
      players: s.players.map((player) => player.id === 1 ? { ...player, isBot: false, botDifficulty: null } : player),
    };
    s = setRes(s, 0, { ore: 1 });
    s = setRes(s, 1, { sheep: 1 });
    s = applyOrThrow(s, { type: 'createTradeOffer', give: { ore: 1 }, receive: { sheep: 1 }, anyCount: 0 });
    expect(s.tradeOffers[0].responses[1].status).toBe('pending');

    s = applyOrThrow(s, { type: 'respondTradeOffer', offerId: s.tradeOffers[0].id, responder: 1, accepted: true });
    expect(s.tradeOffers[0].responses[1].status).toBe('accepted');
  });

  it('lets a human decline an untargeted trade offer', () => {
    let s = autoSetup(game(18));
    s = {
      ...s,
      currentPlayer: 0,
      phase: 'main',
      players: s.players.map((player) => player.id === 1 ? { ...player, isBot: false, botDifficulty: null } : player),
    };
    s = setRes(s, 0, { ore: 1 });
    s = setRes(s, 1, { sheep: 1 });
    s = applyOrThrow(s, { type: 'createTradeOffer', give: { ore: 1 }, receive: { sheep: 1 }, anyCount: 0 });
    s = applyOrThrow(s, { type: 'respondTradeOffer', offerId: s.tradeOffers[0].id, responder: 1, accepted: false });
    expect(s.tradeOffers[0].responses[1].status).toBe('declined');
  });

  it('survives the last decline so the proposer sees it, then expires', () => {
    let s = autoSetup(game(18));
    s = {
      ...s,
      currentPlayer: 0,
      phase: 'main',
      players: s.players.map((player) => player.id === 1 ? { ...player, isBot: false, botDifficulty: null } : player),
    };
    s = setRes(s, 0, { ore: 1 });
    s = setRes(s, 1, { sheep: 1 });
    s = applyOrThrow(s, { type: 'createTradeOffer', give: { ore: 1 }, receive: { sheep: 1 }, anyCount: 0 });
    const offerId = s.tradeOffers[0].id;

    // Cannot be expired while anyone might still take it.
    expect(reduce(s, { type: 'expireTradeOffer', offerId }).ok).toBe(false);

    s = applyOrThrow(s, { type: 'respondTradeOffer', offerId, responder: 1, accepted: false });
    // Still present right after the last decline — that is what makes it visible.
    expect(isOfferFullyDeclined(s.tradeOffers[0])).toBe(true);

    s = applyOrThrow(s, { type: 'expireTradeOffer', offerId });
    expect(s.tradeOffers).toHaveLength(0);
    expect(s.log.at(-1)?.message).toContain('Everyone declined');
  });

  it('does not expire an offer somebody accepted', () => {
    let s = autoSetup(game(15));
    s = {
      ...s,
      currentPlayer: 0,
      phase: 'main',
      players: s.players.map((player) => player.id === 1 ? { ...player, isBot: false, botDifficulty: null } : player),
    };
    s = setRes(s, 0, { ore: 1 });
    s = setRes(s, 1, { sheep: 1 });
    s = applyOrThrow(s, { type: 'createTradeOffer', give: { ore: 1 }, receive: { sheep: 1 }, anyCount: 0 });
    const offerId = s.tradeOffers[0].id;
    s = applyOrThrow(s, { type: 'respondTradeOffer', offerId, responder: 1, accepted: true });

    expect(isOfferFullyDeclined(s.tradeOffers[0])).toBe(false);
    expect(reduce(s, { type: 'expireTradeOffer', offerId }).ok).toBe(false);
  });

  it('stores responses, completes a selected acceptance, and clears offers at turn end', () => {
    let s = autoSetup(game(16));
    s = { ...s, currentPlayer: 0, phase: 'main' };
    s = setRes(s, 0, { ore: 2 });
    s = setRes(s, 1, { sheep: 2 });
    s = setRes(s, 2, { ore: 1 });

    s = applyOrThrow(s, {
      type: 'createTradeOffer',
      give: { ore: 1 },
      receive: { sheep: 1 },
      anyCount: 0,
    });
    expect(s.tradeOffers).toHaveLength(1);
    expect(s.log.at(-1)?.details).toMatchObject({
      type: 'tradeOffer', give: { ore: 1 }, receive: { sheep: 1 }, anyCount: 0,
    });
    expect(s.tradeOffers[0].responses[1].status).toBe('accepted');

    s = applyOrThrow(s, { type: 'completeTradeOffer', offerId: s.tradeOffers[0].id, partner: 1 });
    expect(s.players[0].resources).toMatchObject({ ore: 1, sheep: 1 });
    expect(s.tradeOffers).toHaveLength(0);
    expect(s.players[0].stats.tradeOffers).toBe(1);
    expect(s.log.at(-1)?.details).toMatchObject({
      type: 'trade', kind: 'player', partner: 1, give: { ore: 1 }, receive: { sheep: 1 },
    });
    expect(s.players[0].stats.playerTrades).toBe(1);
    expect(s.players[1].stats.playerTrades).toBe(1);

    s = applyOrThrow(s, {
      type: 'createTradeOffer',
      give: { ore: 1 },
      receive: { brick: 1 },
      anyCount: 0,
    });
    expect(reduce(s, { type: 'endTurn' }).ok).toBe(true);
    s = applyOrThrow(s, { type: 'endTurn' });
    expect(s.tradeOffers).toHaveLength(0);
  });

  it('pauses a targeted bot offer for the human and resolves accept or decline', () => {
    let s = autoSetup(game(17));
    s = { ...s, currentPlayer: 1, phase: 'main' };
    s = setRes(s, 1, { wood: 2 });
    s = setRes(s, 0, { ore: 2 });
    s = setRes(s, 2, {});
    s = applyOrThrow(s, { type: 'createTradeOffer', give: { wood: 1 }, receive: { ore: 1 }, anyCount: 0, target: 0 });
    const offer = s.tradeOffers[0];
    expect(offer.responses[0].status).toBe('pending');
    expect(s.pending.botTradeOfferedThisTurn[1]).toBe(true);
    s = applyOrThrow(s, { type: 'respondTradeOffer', offerId: offer.id, responder: 0, accepted: true });
    expect(s.tradeOffers[0].responses[0].status).toBe('accepted');
    s = applyOrThrow(s, nextBotAction(s, 1)!);
    expect(s.tradeOffers).toHaveLength(0);
    expect(s.players[0].resources).toMatchObject({ wood: 1, ore: 1 });
    expect(s.log.at(-1)?.message).toContain('traded 1 wood for 1 ore');

    s = setRes(s, 1, { wood: 1 });
    s = setRes(s, 0, { ore: 1 });
    s = { ...s, pending: { ...s.pending, botTradeOfferedThisTurn: {} } };
    s = applyOrThrow(s, { type: 'createTradeOffer', give: { wood: 1 }, receive: { ore: 1 }, anyCount: 0, target: 0 });
    s = applyOrThrow(s, { type: 'respondTradeOffer', offerId: s.tradeOffers[0].id, responder: 0, accepted: false });
    s = applyOrThrow(s, nextBotAction(s, 1)!);
    expect(s.tradeOffers).toHaveLength(0);
  });

  it('keeps a bot busy with other actions instead of ending its turn while its own offer is still pending', () => {
    let s = autoSetup(game(21));
    s = { ...s, currentPlayer: 1, phase: 'main' };
    s = setRes(s, 1, { wood: 1, brick: 4, wheat: 4, sheep: 4, ore: 4 });
    s = applyOrThrow(s, { type: 'createTradeOffer', give: { wood: 1 }, receive: { ore: 1 }, anyCount: 0, target: 0 });
    expect(s.tradeOffers[0].responses[0].status).toBe('pending');

    const action = nextBotAction(s, 1);
    expect(action).not.toBeNull();
    expect(action!.type).not.toBe('endTurn');
  });

  it('lets a bot proactively cancel its own offer once it can no longer afford the give side', () => {
    let s = autoSetup(game(19));
    s = { ...s, currentPlayer: 1, phase: 'main' };
    s = setRes(s, 1, { wood: 1 });
    s = setRes(s, 0, {});
    s = applyOrThrow(s, { type: 'createTradeOffer', give: { wood: 1 }, receive: { ore: 1 }, anyCount: 0, target: 0 });
    expect(s.tradeOffers[0].responses[0].status).toBe('pending');

    s = setRes(s, 1, {});
    const action = nextBotAction(s, 1);
    expect(action).toEqual({ type: 'cancelTradeOffer', offerId: s.tradeOffers[0].id });
    s = applyOrThrow(s, action!);
    expect(s.tradeOffers).toHaveLength(0);
  });

  it('does not send a speculative trade as the final action of a turn', () => {
    let s = autoSetup(game(22));
    s = { ...s, currentPlayer: 1, phase: 'main' };
    s = setRes(s, 1, { ore: 1 });

    expect(nextBotAction(s, 1)).toEqual({ type: 'endTurn' });
  });

  it('still offers a trade when one card immediately completes a purchase', () => {
    let s = autoSetup(game(23));
    s = { ...s, currentPlayer: 1, phase: 'main' };
    s = setRes(s, 1, { wood: 2 });

    const action = nextBotAction(s, 1);
    expect(action).toMatchObject({
      type: 'createTradeOffer',
      give: { wood: 1 },
      receive: { brick: 1 },
    });
    expect(action).not.toHaveProperty('target');
    s = applyOrThrow(s, action!);
    expect(automatedActor(s, 0)).toBeNull();
  });

  it('shows a bot offer to every active human player', () => {
    let s = autoSetup(createGame({
      players: [
        { name: 'Human A', isBot: false },
        { name: 'Bot', isBot: true },
        { name: 'Human B', isBot: false },
        { name: 'Bot B', isBot: true },
      ],
      layout: 'classic',
      seed: 24,
    }));
    s = { ...s, currentPlayer: 1, phase: 'main' };
    s = setRes(s, 1, { wood: 2 });
    s = setRes(s, 0, { brick: 1 });
    s = setRes(s, 2, { brick: 1 });

    const action = nextBotAction(s, 1);
    expect(action).toMatchObject({ type: 'createTradeOffer' });
    s = applyOrThrow(s, action!);

    expect(s.tradeOffers[0].target).toBeNull();
    expect(s.tradeOffers[0].responses[0].status).toBe('pending');
    expect(s.tradeOffers[0].responses[2].status).toBe('pending');
    expect(s.pending.botTradeOfferedThisTurn[1]).toBe(true);

    s = applyOrThrow(s, { type: 'respondTradeOffer', offerId: s.tradeOffers[0].id, responder: 0, accepted: true });
    expect(s.tradeOffers[0].responses[2].status).toBe('pending');
    expect(nextBotAction(s, 1)).toBeNull();

    s = applyOrThrow(s, { type: 'respondTradeOffer', offerId: s.tradeOffers[0].id, responder: 2, accepted: false });
    expect(nextBotAction(s, 1)).toMatchObject({ type: 'completeTradeOffer', partner: 0 });
  });

  it('collects bot responses while waiting, then lets the proposer trade with an accepting bot', () => {
    let s = autoSetup(game(18));
    s = { ...s, currentPlayer: 1, phase: 'main' };
    s = setRes(s, 1, { ore: 1 });
    s = setRes(s, 0, { sheep: 1 });
    s = setRes(s, 2, { sheep: 1 });
    s = applyOrThrow(s, { type: 'createTradeOffer', give: { ore: 1 }, receive: { sheep: 1 }, anyCount: 0, target: 0 });
    expect(s.tradeOffers[0].responses[0].status).toBe('pending');
    expect(s.tradeOffers[0].responses[2].status).toBe('accepted');
    s = applyOrThrow(s, { type: 'respondTradeOffer', offerId: s.tradeOffers[0].id, responder: 0, accepted: false });
    const choice = nextBotAction(s, 1);
    expect(choice).toMatchObject({ type: 'completeTradeOffer', partner: 2 });
    const beforeTrade = s;
    s = applyOrThrow(s, choice!);
    expect(deriveFlights(beforeTrade, s, choice!, 0)).toHaveLength(2);
    expect(s.players[2].resources).toMatchObject({ ore: 1, sheep: 0 });
  });
});

describe('game rules', () => {
  it('stores custom timer, victory, discard, and visibility rules in game state', () => {
    const s = createGame({
      players: [{ name: 'A', isBot: false }, { name: 'B', isBot: true }],
      seed: 4,
      rules: { turnTimer: 15, victoryPoints: 14, discardLimit: 9, hideBankCards: true, friendlyRobber: true },
    });
    expect(s.rules).toMatchObject({ turnTimer: 15, victoryPoints: 14, discardLimit: 9, hideBankCards: true, friendlyRobber: true });
  });

  it('uses explicitly configured player colors', () => {
    const s = createGame({
      players: [
        { name: 'A', isBot: false, color: 'green' },
        { name: 'B', isBot: true, color: 'orange' },
      ],
      seed: 5,
    });
    expect(s.players.map((player) => player.color)).toEqual(['green', 'orange']);
  });

  it('defaults bots to medium and preserves explicit per-bot difficulty', () => {
    const s = createGame({ players: [{ name: 'You', isBot: false }, { name: 'Easy', isBot: true, botDifficulty: 'easy' }, { name: 'Default', isBot: true }], seed: 6 });
    expect(s.players.map((player) => player.botDifficulty)).toEqual([null, 'easy', 'medium']);
  });

  it('does not change a hard bot decision when hidden opponent card types are redistributed', () => {
    let a = autoSetup(createGame({ players: [{ name: 'You', isBot: false }, { name: 'Hard', isBot: true, botDifficulty: 'hard' }], seed: 22 }));
    a = { ...a, currentPlayer: 1, phase: 'main' };
    a = setRes(a, 1, { wood: 2, brick: 2, sheep: 1, wheat: 1 });
    a = setRes(a, 0, { wood: 2, ore: 2 });
    const b = setRes(a, 0, { brick: 2, wheat: 2 });
    expect(nextBotAction(a, 1)).toEqual(nextBotAction(b, 1));
  });

  it('rejects direct player trades when that rule is disabled', () => {
    let s = autoSetup(game());
    const actor = s.currentPlayer;
    const partner = s.turnOrder.find((id) => id !== actor)!;
    s = setRes(s, actor, { wood: 1 });
    s = setRes(s, partner, { brick: 1 });
    s = { ...s, phase: 'main', rules: { ...s.rules, allowPlayerTrades: false } };
    expect(reduce(s, { type: 'playerTrade', partner, give: { wood: 1 }, receive: { brick: 1 } }).ok).toBe(false);
  });

  it('accepts the maximum achievable victory target and rejects higher targets', () => {
    expect(createGame({ players: [{ name: 'A', isBot: false }, { name: 'B', isBot: true }], rules: { victoryPoints: MAX_VICTORY_POINTS } }).rules.victoryPoints).toBe(22);
    expect(() => createGame({ players: [{ name: 'A', isBot: false }, { name: 'B', isBot: true }], rules: { victoryPoints: 23 } })).toThrow(/3 to 22/);
    expect(() => createGame({ players: [{ name: 'A', isBot: false }, { name: 'B', isBot: true }], rules: { victoryPoints: 24 } })).toThrow(/3 to 22/);
  });
});

describe('resource action validation', () => {
  it('rejects malformed discards and trades without mutating the input state', () => {
    let s = autoSetup(game(40));
    s = { ...setRes(s, 0, { wood: 8, brick: 2 }), currentPlayer: 0, phase: 'main' };
    const before = structuredClone(s);
    const invalid: Action[] = [
      { type: 'bankTrade', give: 'wood', receive: 'wood' },
      { type: 'playerTrade', partner: 1, give: {}, receive: { brick: 1 } },
      { type: 'playerTrade', partner: 1, give: { wood: 1 }, receive: { wood: 1 } },
      { type: 'playerTrade', partner: 99, give: { wood: 1 }, receive: { brick: 1 } },
      { type: 'createTradeOffer', give: { wood: -1 }, receive: { ore: 1 }, anyCount: 0 },
      { type: 'createTradeOffer', give: { wood: 0.5 }, receive: { ore: 1 }, anyCount: 0 },
      { type: 'createTradeOffer', give: { gold: 1 } as never, receive: { ore: 1 }, anyCount: 0 },
    ];
    invalid.forEach((action) => expect(reduce(s, action).ok, action.type).toBe(false));
    expect(s).toEqual(before);

    const discardState = { ...s, phase: 'discard' as const, pending: { ...s.pending, discards: { 0: 4 } } };
    expect(reduce(discardState, { type: 'discard', player: 0, resources: { wood: 5, brick: -1 } }).ok).toBe(false);
  });

  it('completes a valid wildcard offer and conserves both hands', () => {
    let s = autoSetup(game(41));
    s = { ...s, currentPlayer: 0, phase: 'main' };
    s = setRes(s, 0, { ore: 1 });
    s = setRes(s, 1, { sheep: 1 });
    s = applyOrThrow(s, { type: 'createTradeOffer', give: { ore: 1 }, receive: {}, anyCount: 1 });
    const offerId = s.tradeOffers[0].id;
    expect(s.tradeOffers[0].responses[1]).toMatchObject({ status: 'accepted', wildcardResource: 'sheep' });
    s = applyOrThrow(s, { type: 'completeTradeOffer', offerId, partner: 1 });
    expect(s.players[0].resources).toMatchObject({ ore: 0, sheep: 1 });
    expect(s.players[1].resources).toMatchObject({ ore: 1, sheep: 0 });
  });

  it('completes a valid direct trade without creating or losing cards', () => {
    let s = autoSetup(game(46));
    s = { ...s, currentPlayer: 0, phase: 'main' };
    s = setRes(s, 0, { wood: 1 });
    s = setRes(s, 1, { brick: 1 });
    const before = totalResources(s.players[0].resources) + totalResources(s.players[1].resources);
    s = applyOrThrow(s, { type: 'playerTrade', partner: 1, give: { wood: 1 }, receive: { brick: 1 } });
    expect(s.players[0].resources).toMatchObject({ wood: 0, brick: 1 });
    expect(s.players[1].resources).toMatchObject({ wood: 1, brick: 0 });
    expect(totalResources(s.players[0].resources) + totalResources(s.players[1].resources)).toBe(before);
    expect(s.log.at(-1)?.details).toMatchObject({
      type: 'trade', kind: 'player', partner: 1, give: { wood: 1 }, receive: { brick: 1 },
    });
  });
});

describe('monopoly', () => {
  it('takes the named resource from every opponent', () => {
    let s = autoSetup(game());
    s = setRes(s, 1, { wheat: 3 });
    s = setRes(s, 2, { wheat: 2 });
    s = setRes(s, 0, {});
    // Put a playable monopoly card in player 0's hand (bought last turn).
    s = withDevCard(s, 0, 'monopoly');
    s = { ...s, phase: 'main', turn: s.turn + 1 };
    const res = applyOrThrow(s, { type: 'playMonopoly', resource: 'wheat' });
    expect(res.players[0].resources.wheat).toBe(5);
    expect(res.players[1].resources.wheat).toBe(0);
    expect(res.players[2].resources.wheat).toBe(0);
    expect(res.log.at(-1)?.details).toEqual({
      type: 'monopoly', resource: 'wheat', count: 5, visibility: 'public',
    });
  });
});

describe('robber', () => {
  it('steals exactly one resource from an adjacent victim', () => {
    let s = autoSetup(game(9));
    s = setRes(s, 1, { sheep: 3 });
    // Find a tile with player 1's building; move robber there and steal.
    const victimVertex = Number(
      Object.keys(s.buildings).find((v) => s.buildings[Number(v)].owner === 1),
    );
    const tile = s.board.vertices[victimVertex].tileIds.find((t) => t !== s.board.robberTileId)!;
    s = { ...s, phase: 'moveRobber', currentPlayer: 0 };
    const before = totalResources(s.players[0].resources);
    const res = applyOrThrow(s, { type: 'moveRobber', tile, stealFrom: 1 });
    expect(totalResources(res.players[0].resources)).toBe(before + 1);
    expect(totalResources(res.players[1].resources)).toBe(2);
    expect(res.phase).toBe('main');
    expect(res.players[0].stats.robberMoves).toBe(1);
    expect(res.players[0].stats.successfulSteals).toBe(1);
    expect(res.players[0].stats.cardsStolen).toBe(1);
    const stealEntry = [...res.log].reverse().find((entry) => entry.details?.type === 'steal');
    expect(stealEntry?.details).toEqual({
      type: 'steal', victim: 1, resource: 'sheep', visibility: 'participants',
    });
    expect(canRevealLogResources(stealEntry!, 0)).toBe(true);
    expect(canRevealLogResources(stealEntry!, 1)).toBe(true);
    expect(canRevealLogResources(stealEntry!, 2)).toBe(false);
  });

  it('protects players below 3 VP with Friendly Robber', () => {
    let s = autoSetup(game(9));
    const victim = 1;
    s = setRes(s, victim, { sheep: 1 });
    const victimVertex = Number(Object.keys(s.buildings).find((v) => s.buildings[Number(v)].owner === victim));
    const tile = s.board.vertices[victimVertex].tileIds.find((t) => t !== s.board.robberTileId)!;
    s = { ...s, phase: 'moveRobber', currentPlayer: 0, rules: { ...s.rules, friendlyRobber: true } };
    expect(robberTargetTiles(s)).not.toContain(tile);
    expect(reduce(s, { type: 'moveRobber', tile, stealFrom: victim }).ok).toBe(false);
    expect(reduce(s, { type: 'moveRobber', tile, stealFrom: null }).ok).toBe(false);
    expect(reduce(s, { type: 'moveRobber', tile: robberTargetTiles(s)[0], stealFrom: null }).ok).toBe(true);
  });

  it('uses visible points and falls back to leaving the robber on the desert', () => {
    let s = autoSetup(game(42));
    const victim = 1;
    const players = s.players.map((player) => player.id === victim
      ? { ...player, devCards: [...player.devCards, { type: 'victoryPoint' as const, boughtOnTurn: 0, played: false }] }
      : player);
    const victimVertex = Number(Object.keys(s.buildings).find((vertex) => s.buildings[Number(vertex)].owner === victim));
    const desert = { ...s.board.tiles[s.board.robberTileId], id: 0, type: 'desert' as const, vertexIds: [] };
    const protectedTile = { ...s.board.tiles.find((tile) => tile.type !== 'desert')!, id: 1, vertexIds: [victimVertex] };
    const board = { ...s.board, tiles: [desert, protectedTile], robberTileId: 0 };
    s = { ...s, players, board, phase: 'moveRobber', currentPlayer: 0, rules: { ...s.rules, friendlyRobber: true } };
    expect(victoryPoints(s, victim)).toBeGreaterThanOrEqual(3);
    expect(robberTargetTiles(s)).toEqual([0]);
    expect(reduce(s, { type: 'moveRobber', tile: 0, stealFrom: null }).ok).toBe(true);
  });
});

describe('match statistics', () => {
  it('counts setup pieces but excludes opening-order dice from gameplay rolls', () => {
    let s = game(31);
    while (s.phase === 'startingRoll') s = applyOrThrow(s, { type: 'rollForStart' });
    expect(Object.values(s.diceStats).reduce((sum, count) => sum + count, 0)).toBe(0);
    s = autoSetup(s);
    expect(s.players.every((player) => player.stats.settlementsPlaced === 2 && player.stats.roadsPlaced === 2)).toBe(true);
    s = applyOrThrow(s, { type: 'rollDice' });
    expect(Object.values(s.diceStats).reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(s.players[s.currentPlayer].stats.turnsTaken).toBe(1);
  });

  it('tracks development cards by exact type and records plays separately', () => {
    let s = autoSetup(game(32));
    s = applyOrThrow(s, { type: 'debugGrantDevCard', player: 0, card: 'monopoly' });
    expect(s.players[0].stats.devCardsCollected.monopoly).toBe(1);
    s = { ...s, currentPlayer: 0, phase: 'main', turn: s.turn + 1 };
    s = applyOrThrow(s, { type: 'playMonopoly', resource: 'wood' });
    expect(s.players[0].stats.devCardsPlayed).toBe(1);
  });

  it('records discarded cards without counting rejected actions', () => {
    let s = autoSetup(game(33));
    s = setRes(s, 0, { wood: 8 });
    s = { ...s, phase: 'discard', pending: { ...s.pending, discards: { 0: 4 } } };
    expect(reduce(s, { type: 'discard', player: 0, resources: { wood: 3 } }).ok).toBe(false);
    s = applyOrThrow(s, { type: 'discard', player: 0, resources: { wood: 4 } });
    expect(s.players[0].stats.cardsDiscarded).toBe(4);
    expect(s.log.at(-1)?.details).toEqual({
      type: 'discard', resources: { wood: 4 }, count: 4, visibility: 'public',
    });
    expect(canRevealLogResources(s.log.at(-1)!, 0)).toBe(true);
    expect(canRevealLogResources(s.log.at(-1)!, 1)).toBe(true);
  });

  it('has a point-source breakdown equal to final victory points', () => {
    const s = autoSetup(game(34));
    for (const player of s.players) {
      const towns = Object.values(s.buildings).filter((piece) => piece.owner === player.id && piece.type === 'settlement').length;
      const cities = Object.values(s.buildings).filter((piece) => piece.owner === player.id && piece.type === 'city').length;
      const vpCards = player.devCards.filter((card) => card.type === 'victoryPoint').length;
      const awards = (s.longestRoad.player === player.id ? 2 : 0) + (s.largestArmy.player === player.id ? 2 : 0);
      expect(towns + cities * 2 + vpCards + awards).toBe(victoryPoints(s, player.id));
    }
  });
});

describe('progress cards', () => {
  it('requires Road Building roads before ending the turn', () => {
    let s = autoSetup(game(12));
    s = withDevCard(s, 0, 'roadBuilding');
    s = { ...s, currentPlayer: 0, phase: 'main', turn: s.turn + 1 };

    s = applyOrThrow(s, { type: 'playRoadBuilding' });
    expect(s.pending.freeRoads[0]).toBe(2);
    expect(reduce(s, { type: 'endTurn' }).ok).toBe(false);

    s = applyOrThrow(s, { type: 'buildRoad', edge: legalRoadEdges(s, 0)[0] });
    s = applyOrThrow(s, { type: 'buildRoad', edge: legalRoadEdges(s, 0)[0] });
    expect(s.pending.freeRoads[0]).toBe(0);
    expect(reduce(s, { type: 'endTurn' }).ok).toBe(true);
  });

  it('allows Road Building roads to be placed before rolling', () => {
    let s = autoSetup(game(14));
    s = withDevCard(s, 0, 'roadBuilding');
    s = { ...s, currentPlayer: 0, phase: 'roll', turn: s.turn + 1 };

    s = applyOrThrow(s, { type: 'playRoadBuilding' });
    s = applyOrThrow(s, { type: 'buildRoad', edge: legalRoadEdges(s, 0)[0] });
    expect(s.phase).toBe('roll');
    expect(s.pending.freeRoads[0]).toBe(1);
  });

  it('clears unusable free roads before rolling instead of deadlocking', () => {
    let s = autoSetup(game(43));
    s = withDevCard(s, 0, 'roadBuilding');
    s = { ...s, currentPlayer: 0, phase: 'roll', turn: s.turn + 1 };
    const initiallyLegal = legalRoadEdges(s, 0);
    const onlyEdge = initiallyLegal[0];
    const roads = { ...s.roads };
    const [a, b] = s.board.edges[onlyEdge].vertexIds;
    const blocked = new Set([...initiallyLegal, ...s.board.vertices[a].edgeIds, ...s.board.vertices[b].edgeIds]);
    for (const edge of blocked) if (roads[edge] === undefined && edge !== onlyEdge) roads[edge] = edge % 2 ? 1 : 2;
    s = { ...s, roads };
    s = applyOrThrow(s, { type: 'playRoadBuilding' });
    expect(s.pending.freeRoads[0]).toBe(2);
    s = applyOrThrow(s, { type: 'buildRoad', edge: onlyEdge });
    expect(s.pending.freeRoads[0]).toBe(0);
    expect(reduce(s, { type: 'rollDice' }).ok).toBe(true);
  });

  it('does not create a free-road obligation when no road can be placed', () => {
    let s = autoSetup(game(45));
    s = withDevCard(s, 0, 'roadBuilding');
    s = { ...s, currentPlayer: 0, phase: 'roll', turn: s.turn + 1 };
    const roads = { ...s.roads };
    for (const edge of legalRoadEdges(s, 0)) roads[edge] = edge % 2 ? 1 : 2;
    s = applyOrThrow({ ...s, roads }, { type: 'playRoadBuilding' });
    expect(s.pending.freeRoads[0]).toBe(0);
    expect(reduce(s, { type: 'rollDice' }).ok).toBe(true);
  });

  it('plays Knight by selecting a legal robber hex and victim', () => {
    let s = autoSetup(game(13));
    s = setRes(s, 1, { sheep: 1 });
    s = withDevCard(s, 0, 'knight');
    s = { ...s, currentPlayer: 0, phase: 'main', turn: s.turn + 1 };
    const tile = robberTargetTiles(s).find((candidate) => stealableOpponents(s, candidate, 0).includes(1))!;

    s = applyOrThrow(s, { type: 'playKnight', tile, stealFrom: 1 });
    expect(s.phase).toBe('main');
    expect(s.players[0].knightsPlayed).toBe(1);
    expect(s.players[0].devCards.find((card) => card.type === 'knight')?.played).toBe(true);
  });
});

describe('debug actions', () => {
  it('adds cards, grants a playable progress card, and starts robber placement through the reducer', () => {
    let s = autoSetup(game(15));
    s = { ...s, currentPlayer: 0, phase: 'main', turn: s.turn + 1 };

    const before = { ...s.players[0].resources };
    s = applyOrThrow(s, { type: 'debugAddResources', player: 0, resources: { wood: 3, ore: 1 } });
    expect(s.players[0].resources).toMatchObject({ wood: before.wood + 3, ore: before.ore + 1 });
    s = applyOrThrow(s, { type: 'debugGrantDevCard', player: 0, card: 'yearOfPlenty' });
    expect(s.players[0].devCards.at(-1)).toMatchObject({ type: 'yearOfPlenty', played: false });
    s = applyOrThrow(s, { type: 'debugTriggerRobber' });
    expect(s.phase).toBe('moveRobber');
  });
});

describe('rich history details', () => {
  it('records dice faces, setup pieces, and second-placement resource gains', () => {
    let s = game(61);
    s = applyOrThrow(s, { type: 'rollForStart' });
    expect(s.log.at(-1)?.details).toMatchObject({ type: 'dice', context: 'startingOrder' });
    expect((s.log.at(-1)?.details as { dice?: number[] }).dice).toHaveLength(2);

    s = autoSetup(s);
    expect(s.log.some((entry) => entry.details?.type === 'piece' && entry.details.piece === 'settlement')).toBe(true);
    expect(s.log.some((entry) => entry.details?.type === 'piece' && entry.details.piece === 'road')).toBe(true);
    expect(s.log.filter((entry) => entry.details?.type === 'piece' && entry.details.piece === 'settlement').every((entry) => entry.details?.type === 'piece' && entry.details.vertex !== undefined)).toBe(true);
    expect(s.log.filter((entry) => entry.details?.type === 'piece' && entry.details.piece === 'road').every((entry) => entry.details?.type === 'piece' && entry.details.edge !== undefined)).toBe(true);
    const setupGains = s.log.filter((entry) => entry.details?.type === 'resourceGain' && entry.details.source === 'setup');
    expect(setupGains).toHaveLength(s.players.length);
    expect(setupGains.every((entry) => entry.details?.visibility === 'public')).toBe(true);
  });

  it('records only resources actually distributed by a dice roll', () => {
    let selected: { before: GameState; after: GameState } | null = null;
    for (let seed = 1; seed <= 30 && !selected; seed++) {
      const before = autoSetup(game(seed));
      const after = applyOrThrow(before, { type: 'rollDice' });
      if (after.dice && after.dice[0] + after.dice[1] !== 7
        && after.log.some((entry) => entry.details?.type === 'resourceGain' && entry.details.source === 'production')) {
        selected = { before, after };
      }
    }
    expect(selected).not.toBeNull();
    const { before, after } = selected!;
    const entries = after.log.slice(before.log.length)
      .filter((entry) => entry.details?.type === 'resourceGain' && entry.details.source === 'production');
    for (const entry of entries) {
      const details = entry.details!;
      if (details.type !== 'resourceGain' || entry.player === null) continue;
      for (const resource of ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const) {
        expect(details.resources[resource] ?? 0).toBe(
          Math.max(0, after.players[entry.player].resources[resource] - before.players[entry.player].resources[resource]),
        );
      }
    }

    const emptyBank = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    const starved = applyOrThrow({ ...before, bank: emptyBank }, { type: 'rollDice' });
    if (starved.dice && starved.dice[0] + starved.dice[1] !== 7) {
      expect(starved.log.slice(before.log.length).some((entry) => entry.details?.type === 'resourceGain')).toBe(false);
    }
  });

  it('records city art metadata and Year of Plenty cards', () => {
    let s = autoSetup(game(62));
    const vertex = Number(Object.keys(s.buildings).find((id) => s.buildings[Number(id)].owner === 0));
    s = setRes({ ...s, currentPlayer: 0, phase: 'main' }, 0, { wheat: 2, ore: 3 });
    s = applyOrThrow(s, { type: 'buildCity', vertex });
    expect(s.log.at(-1)?.details).toEqual({ type: 'piece', piece: 'city', verb: 'built', vertex, visibility: 'public' });

    s = withDevCard(s, 0, 'yearOfPlenty');
    s = { ...s, phase: 'main', turn: s.turn + 1 };
    s = applyOrThrow(s, { type: 'playYearOfPlenty', resources: ['wood', 'ore'] });
    expect(s.log.at(-1)?.details).toEqual({
      type: 'resourceGain', source: 'yearOfPlenty', resources: { wood: 1, ore: 1 }, visibility: 'public',
    });
  });

  it('records a generic development-card purchase without revealing its face', () => {
    let s = autoSetup(game(63));
    s = setRes({ ...s, currentPlayer: 0, phase: 'main' }, 0, { sheep: 1, wheat: 1, ore: 1 });
    s = applyOrThrow(s, { type: 'buyDevCard' });
    expect(s.log.at(-1)?.details).toEqual({ type: 'developmentCard', visibility: 'public' });
    expect(s.log.at(-1)?.message).not.toContain(s.players[0].devCards.at(-1)!.type);
  });
});

describe('longest road', () => {
  it('does not count every branch of a T-junction as one route', () => {
    const s = game();
    const junction = s.board.vertices.find((vertex) => vertex.edgeIds.length === 3);
    expect(junction).toBeDefined();

    const roads = Object.fromEntries(junction!.edgeIds.map((edge) => [edge, 0]));
    const branched = { ...s, roads };

    expect(junction!.edgeIds).toHaveLength(3);
    expect(longestRoadLength(branched, 0)).toBe(2);
  });

  it('measures the longest continuous trail', () => {
    // Build a straight chain of roads for player 0 by hand.
    let s = autoSetup(game());
    const owned = Object.keys(s.roads)
      .filter((e) => s.roads[Number(e)] === 0)
      .map(Number);
    expect(longestRoadLength(s, 0)).toBeGreaterThanOrEqual(1);
    // Add roads extending from an existing endpoint to grow the trail.
    let s2 = s;
    let frontier = s2.board.edges[owned[0]].vertexIds[1];
    for (let i = 0; i < 4; i++) {
      const next = s2.board.vertices[frontier].edgeIds.find((e) => s2.roads[e] === undefined);
      if (next === undefined) break;
      s2 = { ...s2, roads: { ...s2.roads, [next]: 0 } };
      const [a, b] = s2.board.edges[next].vertexIds;
      frontier = a === frontier ? b : a;
    }
    expect(longestRoadLength(s2, 0)).toBeGreaterThan(longestRoadLength(s, 0));
  });

  it('ends the game for a third player who gains Longest Road from another player\'s move', () => {
    const base = game(50);
    // Build a real 5-road chain for player 2, starting from an untouched vertex.
    const touched = new Set<number>();
    let frontier = 0;
    const roads: GameState['roads'] = {};
    for (let i = 0; i < 5; i++) {
      touched.add(frontier);
      const edge = base.board.vertices[frontier].edgeIds.find((e) => roads[e] === undefined)!;
      roads[edge] = 2;
      const [a, b] = base.board.edges[edge].vertexIds;
      frontier = a === frontier ? b : a;
    }
    touched.add(frontier);

    // Player 0 (the actor) gets an unrelated settlement to legally build one more road.
    const actorVertex = base.board.vertices.find((v) => !touched.has(v.id))!.id;
    const players = base.players.map((p) => p.id === 2
      ? { ...p, devCards: Array.from({ length: 8 }, () => ({ type: 'victoryPoint' as const, boughtOnTurn: 0, played: false })) }
      : p);

    let s: GameState = {
      ...base,
      players,
      roads,
      buildings: { [actorVertex]: { type: 'settlement', owner: 0 } },
      phase: 'main',
      currentPlayer: 0,
      // Stale incumbent with no real roads left, standing in for a road just severed elsewhere.
      longestRoad: { player: 1, length: 5 },
    };
    s = setRes(s, 0, { wood: 5, brick: 5 });

    expect(victoryPoints(s, 2)).toBe(8);
    expect(longestRoadLength(s, 2)).toBeGreaterThanOrEqual(5);

    const result = applyOrThrow(s, { type: 'buildRoad', edge: legalRoadEdges(s, 0)[0] });

    expect(result.longestRoad.player).toBe(2);
    expect(result.phase).toBe('gameOver');
    expect(result.winner).toBe(2);
  });
});

function withDevCard(s: GameState, player: number, type: DevCardType): GameState {
  const players = s.players.map((p) =>
    p.id === player
      ? { ...p, devCards: [...p.devCards, { type, boughtOnTurn: s.turn, played: false }] }
      : p,
  );
  return { ...s, players };
}
