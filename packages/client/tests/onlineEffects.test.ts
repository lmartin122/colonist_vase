import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, redactState, type Action, type GameState, type Resource } from '@colonist/shared';
import { deriveFlights, onFlight } from '../src/state/flights';
import { deriveSounds } from '../src/state/sounds';
import { useGame } from '../src/state/store';
import { boardLayoutKey } from '../src/ui/GameCanvas';

function stolenCardStates() {
  const base = createGame({
    players: [
      { name: 'Ada', isBot: false },
      { name: 'Bram', isBot: false },
    ],
    seed: 77,
  });
  const before: GameState = {
    ...base,
    phase: 'moveRobber',
    currentPlayer: 0,
    players: base.players.map((player) => ({
      ...player,
      resources: player.id === 1
        ? { wood: 0, brick: 0, sheep: 1, wheat: 0, ore: 0 }
        : { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
    })),
  };
  const after: GameState = {
    ...before,
    phase: 'main',
    players: before.players.map((player) => ({
      ...player,
      resources: player.id === 0
        ? { wood: 0, brick: 0, sheep: 1, wheat: 0, ore: 0 }
        : { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
    })),
  };
  return { before, after };
}

function setupGrantStates() {
  const base = createGame({
    players: [
      { name: 'Ada', isBot: false },
      { name: 'Bram', isBot: false },
    ],
    seed: 91,
  });
  const vertex = base.board.vertices.find((candidate) =>
    candidate.tileIds.some((tileId) => base.board.tiles[tileId].type !== 'desert'))!;
  const before: GameState = {
    ...base,
    phase: 'setup',
    currentPlayer: 0,
    setup: { order: [0, 1, 1, 0], step: 3, lastSettlement: vertex.id },
  };
  const resources = { ...before.players[0].resources };
  for (const tileId of vertex.tileIds) {
    const type = before.board.tiles[tileId].type;
    if (type !== 'desert') resources[type as Resource] += 1;
  }
  const after: GameState = {
    ...before,
    players: before.players.map((player) => player.id === 0 ? { ...player, resources } : player),
    setup: null,
    phase: 'roll',
  };
  return { before, after, expected: vertex.tileIds.filter((tileId) => before.board.tiles[tileId].type !== 'desert').length };
}

afterEach(() => {
  useGame.setState({ game: null, mode: 'local', humanId: 0, spectator: false, build: null, error: null });
  vi.unstubAllGlobals();
});

describe('online action effects', () => {
  it('recognizes a deserialized snapshot as the same immutable board layout', () => {
    const game = createGame({ players: [{ name: 'Ada', isBot: false }, { name: 'Bram', isBot: false }], seed: 12 });
    const clonedBoard = JSON.parse(JSON.stringify(game.board)) as GameState['board'];
    expect(clonedBoard.tiles).not.toBe(game.board.tiles);
    expect(boardLayoutKey(clonedBoard)).toBe(boardLayoutKey(game.board));
    clonedBoard.tiles[0].type = clonedBoard.tiles[0].type === 'wood' ? 'brick' : 'wood';
    expect(boardLayoutKey(clonedBoard)).not.toBe(boardLayoutKey(game.board));
  });

  it('derives robber animation and sound from personalized redacted snapshots', () => {
    const { before, after } = stolenCardStates();
    const action: Action = { type: 'moveRobber', tile: 1, stealFrom: 1, player: 0 };
    const beforeView = redactState(before, 0);
    const afterView = redactState(after, 0);

    const flights = deriveFlights(beforeView, afterView, action, 0);
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({ resource: 'sheep', from: { t: 'player', id: 1 }, to: { t: 'hand', resource: 'sheep' } });
    expect(deriveSounds(beforeView, afterView, action, 0)).toContain('robberPlace');
  });

  it('replays action-derived flights when an authoritative online state arrives', () => {
    const { before, after } = stolenCardStates();
    const action: Action = { type: 'moveRobber', tile: 1, stealFrom: 1, player: 0 };
    const beforeView = redactState(before, 0);
    const afterView = redactState(after, 0);
    const observed: string[] = [];
    const unsubscribe = onFlight((flight) => observed.push(flight.id));

    useGame.setState({ game: beforeView, mode: 'online', humanId: 0 });
    useGame.getState().applyServerState(afterView, 0, action);
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(useGame.getState().game).toBe(afterView);
    expect(useGame.getState().mode).toBe('online');
  });

  it('emits setup resource flights for both the actor and a redacted observer', () => {
    const { before, after, expected } = setupGrantStates();
    const action: Action = { type: 'placeSetupRoad', edge: 0 };

    expect(deriveFlights(redactState(before, 0), redactState(after, 0), action, 0)).toHaveLength(expected);
    expect(deriveFlights(redactState(before, 1), redactState(after, 1), action, 1)).toHaveLength(expected);

    const observed: string[] = [];
    const unsubscribe = onFlight((flight) => observed.push(flight.id));
    useGame.setState({ game: redactState(before, 1), mode: 'online', humanId: 1 });
    useGame.getState().applyServerState(redactState(after, 1), 1, action);
    unsubscribe();
    expect(observed).toHaveLength(expected);
  });

  it('applies a private spectator view and rejects game actions locally', () => {
    const game = createGame({
      players: [
        { name: 'Ada', isBot: false },
        { name: 'Bram', isBot: false },
      ],
      seed: 33,
    });
    const view = redactState(game, null);

    useGame.getState().applyServerState(view, null);

    expect(useGame.getState()).toMatchObject({ mode: 'online', humanId: -1, spectator: true });
    expect(useGame.getState().dispatch({ type: 'rollForStart' })).toBe(false);
    expect(useGame.getState().error).toBe('Spectators cannot make game actions');
  });

  it('does not record an online departure as a local loss', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem });
    const game = createGame({
      players: [
        { name: 'Ada', isBot: false },
        { name: 'Bram', isBot: true },
      ],
      seed: 44,
    });
    useGame.setState({ game, mode: 'online', humanId: 0, spectator: false });

    useGame.getState().abandonGame();

    expect(setItem).not.toHaveBeenCalled();
  });
});
