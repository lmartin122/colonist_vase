import type { PlayerColor, Resource, TileType } from './engine/types';

/**
 * Central registry of the SVG art (served from /public/assets). One source of
 * truth for both the PixiJS board (loaded as textures) and the HTML HUD (used as
 * <img> sources).
 *
 * Note: hexagon art is provided for wood/brick/wheat/wool/ore; desert falls back
 * to a procedurally drawn tile until its asset exists.
 */
const BASE = '/assets';

/** Terrain hexagon art, or null when we must draw the tile ourselves. */
export const HEX_ASSET: Record<TileType, string | null> = {
  wood: `${BASE}/hexagon_wood.svg`,
  brick: `${BASE}/hexagon_brick.svg`,
  sheep: `${BASE}/hexagon_wool.svg`,
  wheat: `${BASE}/hexagon_wheat.svg`,
  ore: `${BASE}/hexagon_ore.svg`,
  desert: null,
};

export function settlementAsset(color: PlayerColor): string {
  return `${BASE}/settlement_${color}.svg`;
}
export function cityAsset(color: PlayerColor): string {
  return `${BASE}/city_${color}.svg`;
}
export function roadAsset(color: PlayerColor): string {
  return `${BASE}/road_${color}.svg`;
}

/** Resource "cards" (portrait art) for the hand, bank summary, and player rows. */
export const RESOURCE_CARD: Record<Resource, string> = {
  wood: `${BASE}/card_wood.svg`,
  brick: `${BASE}/brick_card.svg`,
  sheep: `${BASE}/card_wool.svg`,
  wheat: `${BASE}/card_wheat.svg`,
  ore: `${BASE}/card_ore.svg`,
};

export const CARD_HIDDEN = `${BASE}/card_hidden_icon.svg`;
export const CARD_HIDDEN_WARNING = `${BASE}/card_hidden_warning_icon.svg`;
export const CARD_DEV_BACK = `${BASE}/card_hidden_development_icon.svg`;
export const CARD_DEV_ROBBER = `${BASE}/card_development_robber.svg`;

/** Award / stat trophies for the player panels (plain vs. held-highlight). */
export const LARGEST_ARMY = `${BASE}/largest_army_icon.svg`;
export const LARGEST_ARMY_HL = `${BASE}/largest_army_icon_highlight.svg`;
export const LARGEST_ROAD = `${BASE}/largest_road_icon.svg`;
export const LARGEST_ROAD_HL = `${BASE}/largest_road_icon_highlight.svg`;

/** Trade action icon. */
export const TRADE_ICON = `${BASE}/trade_icon.svg`;

/** Face art for a single die result. */
export function diceAsset(value: number): string {
  return `${BASE}/dice_${value}.svg`;
}

/** All texture URLs the board renderer must preload before drawing. */
export function boardTextureUrls(): string[] {
  const colors: PlayerColor[] = ['red', 'blue', 'orange', 'green'];
  const urls: string[] = [];
  for (const url of Object.values(HEX_ASSET)) if (url) urls.push(url);
  for (const c of colors) urls.push(settlementAsset(c), cityAsset(c), roadAsset(c));
  return urls;
}
