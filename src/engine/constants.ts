import type { DevCardType, Resource, ResourceBank } from './types';

/** Build costs. */
export const COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { sheep: 1, wheat: 1, ore: 1 },
} as const satisfies Record<string, Partial<ResourceBank>>;

/** Per-player piece stock at game start. */
export const STARTING_STOCK = { settlements: 5, cities: 4, roads: 15 };

/** Bank starts with 19 of each resource. */
export const BANK_PER_RESOURCE = 19;

/** Victory points to win. */
export const WIN_POINTS = 10;
/**
 * Highest score achievable with the standard piece and development-card
 * supply: 4 cities + 5 settlements (buildCity returns the settlement piece to
 * stock, so both can be maxed at once) = 13, + longest road (2) + largest
 * army (2) = 17, + all 5 victoryPoint dev cards = 22.
 */
export const MAX_VICTORY_POINTS = 22;

/** Hand size above which a 7 forces a discard of half (rounded down). */
export const DISCARD_LIMIT = 7;

/** Minimum road length / army size to claim the bonus awards. */
export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;

export const VP_LONGEST_ROAD = 2;
export const VP_LARGEST_ARMY = 2;

/** Development card deck composition (25 cards total). */
export const DEV_DECK: DevCardType[] = [
  ...Array<DevCardType>(14).fill('knight'),
  ...Array<DevCardType>(5).fill('victoryPoint'),
  ...Array<DevCardType>(2).fill('roadBuilding'),
  ...Array<DevCardType>(2).fill('monopoly'),
  ...Array<DevCardType>(2).fill('yearOfPlenty'),
];

export const PLAYER_COLORS = ['red', 'blue', 'orange', 'green', 'black'] as const;

/** Number of "pips" (probability dots) printed on each dice number token. */
export const NUMBER_PIPS: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
};

export const ALL_RESOURCES: Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
