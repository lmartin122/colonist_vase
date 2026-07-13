import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/game';
import { reduce } from '../src/engine/reduce';
import { nextBotAction } from '../src/ai/bot';
import { victoryPoints } from '../src/engine/helpers';
import type { BotDifficulty, GameState } from '../src/engine/types';

/** Drive an all-bot game to completion using only legal AI actions. */
function playOut(seed: number, difficulties: BotDifficulty[] = ['medium', 'medium', 'medium', 'medium']): { state: GameState; actions: number } {
  let state = createGame({
    players: [
      { name: 'A', isBot: true, botDifficulty: difficulties[0] },
      { name: 'B', isBot: true, botDifficulty: difficulties[1] },
      { name: 'C', isBot: true, botDifficulty: difficulties[2] },
      { name: 'D', isBot: true, botDifficulty: difficulties[3] },
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

  it.each(['easy', 'medium', 'hard'] as const)('%s bots complete a legal game', (difficulty) => {
    const { state } = playOut(120 + difficulty.length, [difficulty, difficulty, difficulty, difficulty]);
    expect(state.phase).toBe('gameOver');
  });

  it('ranks Hard above Medium above Easy in a fixed rotated-seat benchmark', () => {
    const totals: Record<BotDifficulty, { score: number; seats: number }> = { easy: { score: 0, seats: 0 }, medium: { score: 0, seats: 0 }, hard: { score: 0, seats: 0 } };
    const base: BotDifficulty[] = ['easy', 'medium', 'hard', 'medium'];
    for (let gameIndex = 0; gameIndex < 48; gameIndex++) {
      const rotation = gameIndex % 4;
      const difficulties = base.map((_, index) => base[(index + rotation) % 4]);
      const { state } = playOut(500 + gameIndex, difficulties);
      state.players.forEach((player) => {
        const difficulty = player.botDifficulty!;
        totals[difficulty].score += victoryPoints(state, player.id) + (state.winner === player.id ? 3 : 0);
        totals[difficulty].seats += 1;
      });
    }
    const average = (difficulty: BotDifficulty) => totals[difficulty].score / totals[difficulty].seats;
    expect(average('hard')).toBeGreaterThan(average('medium'));
    expect(average('medium')).toBeGreaterThan(average('easy'));
  }, 30_000);
});
