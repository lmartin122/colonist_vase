import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/game';
import { applyOrThrow, reduce } from '../src/engine/reduce';
import { totalResources, victoryPoints } from '../src/engine/helpers';
import type { GameState } from '../src/engine/types';

function newGame(seed = 1) {
  return createGame({
    players: [
      { name: 'Alice', isBot: false },
      { name: 'Bob', isBot: true },
    ],
    layout: 'classic',
    seed,
  });
}

/** Pick the first vertex where a settlement is legal (open + distance rule). */
function firstOpenVertex(state: GameState): number {
  return state.board.vertices.find((v) => {
    if (state.buildings[v.id]) return false;
    return v.adjacentVertexIds.every((a) => !state.buildings[a]);
  })!.id;
}

/** A free edge touching the given vertex. */
function edgeAt(state: GameState, vertex: number): number {
  return state.board.vertices[vertex].edgeIds.find((e) => state.roads[e] === undefined)!;
}

/** Run the whole snake-draft setup with legal (greedy) placements. */
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

describe('setup phase', () => {
  it('rolls for first, follows the resulting snake order, and returns to the winner', () => {
    let s = newGame();
    expect(s.phase).toBe('startingRoll');
    expect(s.currentPlayer).toBe(0);
    while (s.phase === 'startingRoll') s = applyOrThrow(s, { type: 'rollForStart' });
    expect(s.phase).toBe('setup');
    const first = s.currentPlayer;
    expect(s.setup?.order[0]).toBe(first);
    expect(s.turnOrder[0]).toBe(first);
    s = autoSetup(s);
    expect(s.phase).toBe('roll');
    expect(s.currentPlayer).toBe(first);
    expect(s.turn).toBe(1);
    const nextTurn = applyOrThrow({ ...s, phase: 'main' }, { type: 'endTurn' });
    expect(nextTurn.currentPlayer).toBe(s.turnOrder[1]);
    // Each player placed 2 settlements + 2 roads.
    expect(Object.keys(s.buildings)).toHaveLength(4);
    expect(Object.keys(s.roads)).toHaveLength(4);
  });

  it('reproduces the same starting player and setup order for the same seed', () => {
    const resolve = () => {
      let s = newGame(77);
      while (s.phase === 'startingRoll') s = applyOrThrow(s, { type: 'rollForStart' });
      return { player: s.currentPlayer, order: s.setup?.order };
    };
    expect(resolve()).toEqual(resolve());
  });

  it('rejects a settlement too close to another', () => {
    let s = newGame();
    while (s.phase === 'startingRoll') s = applyOrThrow(s, { type: 'rollForStart' });
    const v = firstOpenVertex(s);
    s = applyOrThrow(s, { type: 'placeSetupSettlement', vertex: v });
    s = applyOrThrow(s, { type: 'placeSetupRoad', edge: edgeAt(s, v) });
    const adjacent = s.board.vertices[v].adjacentVertexIds[0];
    const res = reduce(s, { type: 'placeSetupSettlement', vertex: adjacent });
    expect(res.ok).toBe(false);
  });

  it('grants resources for the second settlement only', () => {
    let s = newGame();
    while (s.phase === 'startingRoll') s = applyOrThrow(s, { type: 'rollForStart' });
    // First placement: no resources yet.
    const v0 = firstOpenVertex(s);
    s = applyOrThrow(s, { type: 'placeSetupSettlement', vertex: v0 });
    s = applyOrThrow(s, { type: 'placeSetupRoad', edge: edgeAt(s, v0) });
    expect(totalResources(s.players[0].resources)).toBe(0);
    s = autoSetup(s);
    // After full setup everyone should hold their second-settlement resources.
    const held = s.players.reduce((sum, p) => sum + totalResources(p.resources), 0);
    expect(held).toBeGreaterThan(0);
  });
});

describe('rolling and production', () => {
  it('rolls two dice and either produces or triggers the robber', () => {
    let s = autoSetup(newGame(5));
    s = applyOrThrow(s, { type: 'rollDice' });
    expect(s.dice).not.toBeNull();
    const sum = s.dice![0] + s.dice![1];
    if (sum === 7) {
      expect(['discard', 'moveRobber']).toContain(s.phase);
    } else {
      expect(s.phase).toBe('main');
    }
  });

  it('cannot build before rolling', () => {
    const s = autoSetup(newGame());
    const res = reduce(s, { type: 'buildRoad', edge: 0 });
    expect(res.ok).toBe(false);
  });
});

describe('building', () => {
  it('lets a player build a connected road after rolling', () => {
    let s = autoSetup(newGame(3));
    // Force a non-7 main phase by giving resources and rolling until main.
    while (s.phase !== 'main') {
      if (s.phase === 'roll') s = applyOrThrow(s, { type: 'rollDice' });
      else if (s.phase === 'moveRobber') {
        const tile = s.board.tiles.find((t) => t.id !== s.board.robberTileId)!.id;
        s = applyOrThrow(s, { type: 'moveRobber', tile, stealFrom: null });
      } else if (s.phase === 'discard') {
        // discard for whoever owes
        const [pid, n] = Object.entries(s.pending.discards)[0];
        s = applyOrThrow(s, { type: 'discard', player: Number(pid), resources: pickDiscard(s, Number(pid), n) });
      }
    }
    const player = s.currentPlayer;
    // Grant resources directly to the rolled starting player for a deterministic build.
    s = giveResources(s, player, { wood: 1, brick: 1 });
    const myRoadEdge = Number(Object.keys(s.roads).find((e) => s.roads[Number(e)] === player));
    const settlementVertex = s.board.edges[myRoadEdge].vertexIds[0];
    const newEdge = s.board.vertices[settlementVertex].edgeIds.find((e) => s.roads[e] === undefined)!;
    const before = s.players[player].stock.roads;
    s = applyOrThrow(s, { type: 'buildRoad', edge: newEdge });
    expect(s.players[player].stock.roads).toBe(before - 1);
    expect(s.roads[newEdge]).toBe(player);
  });
});

describe('victory', () => {
  it('scores 1 VP per settlement and 2 per city', () => {
    const s = autoSetup(newGame());
    // Two settlements each after setup.
    expect(victoryPoints(s, 0)).toBe(2);
    expect(victoryPoints(s, 1)).toBe(2);
  });

  it('awards victory as soon as a player begins a turn at the target score', () => {
    let s = autoSetup(newGame(44));
    const nextPlayer = s.turnOrder[(s.turnOrder.indexOf(s.currentPlayer) + 1) % s.turnOrder.length];
    const players = s.players.map((player) => player.id === nextPlayer
      ? { ...player, devCards: [...player.devCards, { type: 'victoryPoint' as const, boughtOnTurn: 0, played: false }] }
      : player);
    s = { ...s, players, phase: 'main', rules: { ...s.rules, victoryPoints: 3 } };
    const ended = applyOrThrow(s, { type: 'endTurn' });
    expect(ended.phase).toBe('gameOver');
    expect(ended.winner).toBe(nextPlayer);
  });
});

// --- test-only mutation helpers (bypass the reducer to set up scenarios) ----

function giveResources(state: GameState, player: number, res: Record<string, number>): GameState {
  const players = state.players.map((p) => (p.id === player ? { ...p, resources: { ...p.resources, ...addTo(p.resources, res) } } : p));
  return { ...state, players };
}
function addTo(base: Record<string, number>, add: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const k of Object.keys(add)) out[k] = (base[k] ?? 0) + add[k];
  return out;
}
function pickDiscard(state: GameState, player: number, n: number) {
  const res = state.players[player].resources;
  const out: Record<string, number> = {};
  let need = n;
  for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const) {
    const take = Math.min(need, res[r]);
    if (take > 0) out[r] = take;
    need -= take;
    if (need === 0) break;
  }
  return out;
}
