import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/game';
import { addAbandonedGame, addCompletedGame, emptyProfileStats, normalizeProfileStats } from '../src/state/profileStats';

function completedGame() {
  const game = createGame({
    seed: 77,
    players: [
      { name: 'You', isBot: false, color: 'red' },
      { name: 'Ada', isBot: true, color: 'blue' },
    ],
  });
  return {
    ...game,
    phase: 'gameOver' as const,
    winner: 0,
    buildings: { 0: { owner: 0, type: 'settlement' as const } },
    largestArmy: { player: 0, size: 3 },
    diceStats: { ...game.diceStats, 6: 3, 8: 2 },
    players: game.players.map((player, index) => index === 0 ? {
      ...player,
      stats: {
        ...player.stats,
        resourcesCollected: { ...player.stats.resourcesCollected, wood: 3, ore: 2 },
        roadsPlaced: 4,
        playerTrades: 2,
        robberMoves: 1,
        devCardsBought: 2,
        devCardsCollected: { ...player.stats.devCardsCollected, knight: 1 },
      },
    } : player),
  };
}

describe('overall profile statistics', () => {
  it('adds completed human match statistics across games', () => {
    const once = addCompletedGame(emptyProfileStats(), completedGame(), 0, 90_000);
    const twice = addCompletedGame(once, completedGame(), 0, 30_000);
    expect(twice).toMatchObject({
      gamesPlayed: 2,
      wins: 2,
      classicGames: 2,
      classicWins: 2,
      largestArmyAwards: 2,
      totalDurationMs: 120_000,
    });
    expect(twice.matchStats.resourcesCollected).toMatchObject({ wood: 6, ore: 4 });
    expect(twice.matchStats.roadsPlaced).toBe(8);
    expect(twice.matchStats.playerTrades).toBe(4);
    expect(twice.matchStats.devCardsCollected.knight).toBe(2);
    expect(twice.diceRolls[6]).toBe(6);
    expect(twice.diceRolls[8]).toBe(4);
  });

  it('normalizes missing and invalid persisted values safely', () => {
    const stats = normalizeProfileStats({ gamesPlayed: -2, wins: 3, matchStats: { resourcesCollected: { wood: 5 }, roadsPlaced: Number.NaN } });
    expect(stats.gamesPlayed).toBe(0);
    expect(stats.wins).toBe(3);
    expect(stats.matchStats.resourcesCollected.wood).toBe(5);
    expect(stats.matchStats.resourcesCollected.brick).toBe(0);
    expect(stats.matchStats.roadsPlaced).toBe(0);
  });

  it('counts an abandoned match as a loss and keeps its accumulated activity', () => {
    const game = completedGame();
    const active = { ...game, phase: 'main' as const, winner: null };
    const stats = addAbandonedGame(emptyProfileStats(), active, 0, 45_000);
    expect(stats.gamesPlayed).toBe(1);
    expect(stats.wins).toBe(0);
    expect(stats.totalDurationMs).toBe(45_000);
    expect(stats.matchStats.resourcesCollected.wood).toBe(3);
    expect(stats.matchStats.roadsPlaced).toBe(4);
  });
});
