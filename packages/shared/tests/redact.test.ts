import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/game';
import { emptyBank, type GameState, type OwnedDevCard } from '../src/engine/types';
import { handSize, redactState, unplayedDevCount } from '../src/net/protocol';

/** Build a deterministic fixture with known hidden information for two seats. */
function fixture(): GameState {
  const base = createGame({
    players: [
      { name: 'Ada', isBot: false },
      { name: 'Bram', isBot: true },
    ],
    seed: 12345,
  });

  const dev = (type: OwnedDevCard['type'], played = false): OwnedDevCard => ({ type, boughtOnTurn: 1, played });

  const players = base.players.map((p) => ({ ...p, resources: { ...p.resources }, devCards: [...p.devCards] }));
  players[0].resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 1 }; // 3 cards
  players[0].devCards = [dev('knight'), dev('victoryPoint'), dev('monopoly', true)]; // 2 unplayed
  players[1].resources = { wood: 0, brick: 0, sheep: 3, wheat: 0, ore: 0 }; // 3 cards
  players[1].devCards = [dev('knight')]; // 1 unplayed

  return {
    ...base,
    players,
    devDeck: ['knight', 'monopoly', 'victoryPoint'],
    rng: { seed: 12345 },
  };
}

describe('redactState', () => {
  it('keeps the viewer’s own hand and dev cards intact', () => {
    const view = redactState(fixture(), 0);
    expect(view.players[0].resources).toEqual({ wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 1 });
    expect(view.players[0].devCards).toHaveLength(3);
    expect(view.players[0].handCount).toBe(3);
    expect(view.players[0].unplayedDevCount).toBe(2);
  });

  it('hides opponents’ resources and dev cards but keeps public counts', () => {
    const view = redactState(fixture(), 0);
    const opp = view.players[1];
    expect(opp.resources).toEqual(emptyBank());
    expect(opp.devCards).toEqual([]);
    expect(opp.handCount).toBe(3);
    expect(opp.unplayedDevCount).toBe(1);
  });

  it('hides the dev-deck order and the RNG seed (anti-cheat)', () => {
    const view = redactState(fixture(), 0);
    expect(view.devDeck).toEqual([]);
    expect(view.devDeckCount).toBe(3);
    expect(view.rng.seed).toBe(0);
  });

  it('never mutates the source state', () => {
    const state = fixture();
    redactState(state, 0);
    expect(state.players[1].resources).toEqual({ wood: 0, brick: 0, sheep: 3, wheat: 0, ore: 0 });
    expect(state.players[1].devCards).toHaveLength(1);
    expect(state.devDeck).toEqual(['knight', 'monopoly', 'victoryPoint']);
    expect(state.rng.seed).toBe(12345);
  });

  it('accessors work on both redacted and raw players', () => {
    const state = fixture();
    const view = redactState(state, 0);
    // Redacted opponent: reads the preserved counts, not the emptied bank/cards.
    expect(handSize(view.players[1])).toBe(3);
    expect(unplayedDevCount(view.players[1])).toBe(1);
    // Raw player: computes from the real hand.
    expect(handSize(state.players[1])).toBe(3);
    expect(unplayedDevCount(state.players[1])).toBe(1);
  });
});
