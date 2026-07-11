import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/game';
import { applyOrThrow, reduce } from '../src/engine/reduce';
import { longestRoadLength } from '../src/engine/longestRoad';
import { bankTradeRatio, totalResources } from '../src/engine/helpers';
import type { GameState, Resource } from '../src/engine/types';

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

function withDevCard(s: GameState, player: number, type: 'monopoly'): GameState {
  const players = s.players.map((p) =>
    p.id === player
      ? { ...p, devCards: [...p.devCards, { type, boughtOnTurn: s.turn, played: false }] }
      : p,
  );
  return { ...s, players };
}
