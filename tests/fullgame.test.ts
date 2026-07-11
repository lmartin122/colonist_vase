import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/game';
import { reduce } from '../src/engine/reduce';
import { nextBotAction } from '../src/ai/bot';
import { victoryPoints } from '../src/engine/helpers';
import type { GameState } from '../src/engine/types';

/** Drive an all-bot game to completion using only legal AI actions. */
function playOut(seed: number): { state: GameState; actions: number } {
  let state = createGame({
    players: [
      { name: 'A', isBot: true },
      { name: 'B', isBot: true },
      { name: 'C', isBot: true },
      { name: 'D', isBot: true },
    ],
    layout: 'random',
    seed,
  });

  let actions = 0;
  const MAX = 20000;
  while (state.phase !== 'gameOver' && actions < MAX) {
    // Determine who owes a move (bot discards can belong to any player).
    let actor = state.currentPlayer;
    if (state.phase === 'discard') actor = Number(Object.keys(state.pending.discards)[0]);
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

describe('full bot game', () => {
  it.each([1, 2, 3, 7, 42])('reaches a winner with only legal moves (seed %i)', (seed) => {
    const { state, actions } = playOut(seed);
    expect(state.phase).toBe('gameOver');
    expect(state.winner).not.toBeNull();
    expect(victoryPoints(state, state.winner!)).toBeGreaterThanOrEqual(10);
    expect(actions).toBeLessThan(20000);
  });

  it('is fully deterministic for a seed', () => {
    const a = playOut(99);
    const b = playOut(99);
    expect(a.actions).toBe(b.actions);
    expect(a.state.winner).toBe(b.state.winner);
  });
});
