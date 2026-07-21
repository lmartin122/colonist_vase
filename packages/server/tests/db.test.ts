import { describe, expect, it } from 'vitest';
import { createGame } from '@colonist/shared';
import { aggregateUserStats, type StatsRow } from '../src/db';

describe('server profile statistics', () => {
  it('counts a finished room once even if the same result is encountered repeatedly', () => {
    const game = createGame({
      seed: 91,
      players: [
        { name: 'Alice', isBot: false },
        { name: 'Bot', isBot: true },
      ],
    });
    const playerStats = {
      ...game.players[0].stats,
      resourcesCollected: { ...game.players[0].stats.resourcesCollected, wood: 7 },
      roadsPlaced: 4,
      playerTrades: 2,
    };
    const row: StatsRow = {
      roomCode: 'ABC234',
      winnerId: 'user-a',
      mode: 'classic',
      startedAt: new Date('2026-07-20T12:00:00Z'),
      endedAt: new Date('2026-07-20T12:30:00Z'),
      diceStats: { 6: 3, 8: 2 },
      players: [{
        userId: 'user-a',
        finalVp: 10,
        stats: playerStats,
        longestRoadLength: 6,
        longestRoadAward: true,
        largestArmyAward: false,
        abandoned: true,
      }],
    };

    const stats = aggregateUserStats([row, row], 'user-a');

    expect(stats).toMatchObject({
      gamesPlayed: 1,
      wins: 1,
      totalVictoryPoints: 10,
      totalDurationMs: 30 * 60 * 1000,
      classicGames: 1,
      classicWins: 1,
      longestRoadAwards: 1,
      abandonedGames: 1,
      totalLongestRoad: 6,
    });
    expect(stats.diceRolls).toMatchObject({ 6: 3, 8: 2 });
    expect(stats.matchStats).toMatchObject({ roadsPlaced: 4, playerTrades: 2 });
    expect(stats.matchStats.resourcesCollected.wood).toBe(7);
  });
});
