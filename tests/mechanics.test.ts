import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/game';
import { applyOrThrow, reduce } from '../src/engine/reduce';
import { longestRoadLength } from '../src/engine/longestRoad';
import { bankTradeRatio, totalResources } from '../src/engine/helpers';
import type { DevCardType, GameState, Resource } from '../src/engine/types';
import { legalRoadEdges, robberTargetTiles, stealableOpponents } from '../src/engine/placement';

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
    expect(s.tradeOffers[0].responses[1].accepted).toBe(true);

    s = applyOrThrow(s, { type: 'completeTradeOffer', offerId: s.tradeOffers[0].id, partner: 1 });
    expect(s.players[0].resources).toMatchObject({ ore: 1, sheep: 1 });
    expect(s.tradeOffers).toHaveLength(0);

    s = applyOrThrow(s, {
      type: 'createTradeOffer',
      give: { ore: 1 },
      receive: { ore: 1 },
      anyCount: 0,
    });
    expect(reduce(s, { type: 'endTurn' }).ok).toBe(true);
    s = applyOrThrow(s, { type: 'endTurn' });
    expect(s.tradeOffers).toHaveLength(0);
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

  it('rejects direct player trades when that rule is disabled', () => {
    let s = autoSetup(game());
    const actor = s.currentPlayer;
    const partner = s.turnOrder.find((id) => id !== actor)!;
    s = setRes(s, actor, { wood: 1 });
    s = setRes(s, partner, { brick: 1 });
    s = { ...s, phase: 'main', rules: { ...s.rules, allowPlayerTrades: false } };
    expect(reduce(s, { type: 'playerTrade', partner, give: { wood: 1 }, receive: { brick: 1 } }).ok).toBe(false);
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
  });

  it('protects players below 3 VP with Friendly Robber', () => {
    let s = autoSetup(game(9));
    const victim = 1;
    s = setRes(s, victim, { sheep: 1 });
    const victimVertex = Number(Object.keys(s.buildings).find((v) => s.buildings[Number(v)].owner === victim));
    const tile = s.board.vertices[victimVertex].tileIds.find((t) => t !== s.board.robberTileId)!;
    s = { ...s, phase: 'moveRobber', currentPlayer: 0, rules: { ...s.rules, friendlyRobber: true } };
    expect(reduce(s, { type: 'moveRobber', tile, stealFrom: victim }).ok).toBe(false);
    expect(reduce(s, { type: 'moveRobber', tile, stealFrom: null }).ok).toBe(true);
  });
});

describe('progress cards', () => {
  it('requires Road Building roads before ending the turn', () => {
    let s = autoSetup(game(12));
    s = withDevCard(s, 0, 'roadBuilding');
    s = { ...s, currentPlayer: 0, phase: 'main', turn: s.turn + 1 };

    s = applyOrThrow(s, { type: 'playRoadBuilding' });
    expect(s.pending.freeRoads).toBe(2);
    expect(reduce(s, { type: 'endTurn' }).ok).toBe(false);

    s = applyOrThrow(s, { type: 'buildRoad', edge: legalRoadEdges(s, 0)[0] });
    s = applyOrThrow(s, { type: 'buildRoad', edge: legalRoadEdges(s, 0)[0] });
    expect(s.pending.freeRoads).toBe(0);
    expect(reduce(s, { type: 'endTurn' }).ok).toBe(true);
  });

  it('allows Road Building roads to be placed before rolling', () => {
    let s = autoSetup(game(14));
    s = withDevCard(s, 0, 'roadBuilding');
    s = { ...s, currentPlayer: 0, phase: 'roll', turn: s.turn + 1 };

    s = applyOrThrow(s, { type: 'playRoadBuilding' });
    s = applyOrThrow(s, { type: 'buildRoad', edge: legalRoadEdges(s, 0)[0] });
    expect(s.phase).toBe('roll');
    expect(s.pending.freeRoads).toBe(1);
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

describe('longest road', () => {
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
});

function withDevCard(s: GameState, player: number, type: DevCardType): GameState {
  const players = s.players.map((p) =>
    p.id === player
      ? { ...p, devCards: [...p.devCards, { type, boughtOnTurn: s.turn, played: false }] }
      : p,
  );
  return { ...s, players };
}
