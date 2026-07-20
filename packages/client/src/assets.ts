import type { DevCardType, PlayerColor, PortType, Resource, TileType } from '@colonist/shared';

/**
 * Central registry of art identifiers. Packed-atlas frame names are used by
 * Pixi and the HTML `PackedSprite` component; remaining standalone SVGs are
 * reserved for art that has no atlas equivalent.
 *
 * Terrain is assembled from an `*_empty` hex base plus its `*_side` motif.
 */
const BASE = '/assets';

/** Packed terrain hex bases. */
export const HEX_FRAME: Record<TileType, string> = {
  wood: 'tile_lumber_empty',
  brick: 'tile_brick_empty',
  sheep: 'tile_wool_empty',
  wheat: 'tile_grain_empty',
  ore: 'tile_ore_empty',
  desert: 'tile_desert_empty',
};

/** Packed resource/desert illustrations layered over the empty hex bases. */
export const HEX_SIDE_FRAME: Record<TileType, string> = {
  wood: 'tile_lumber_side',
  brick: 'tile_brick_side',
  sheep: 'tile_wool_side',
  wheat: 'tile_grain_side',
  ore: 'tile_ore_side',
  desert: 'tile_desert_side',
};

export function settlementFrame(color: PlayerColor): string {
  return `settlement_${color}`;
}
export function cityFrame(color: PlayerColor): string {
  return `city_${color}`;
}
export function roadFrame(color: PlayerColor): string {
  return `road_${color}`;
}
export function playerBackgroundFrame(color: PlayerColor): string {
  return `player_bg_${color}`;
}

export const RIBBON_LARGE_FRAME = 'ribbon_large';
export const RIBBON_LONG_FRAME = 'ribbon_long';
export const HIGHLIGHT_CIRCLE_FRAME = 'icon_highlight_circle';

/** Dice-sum probability token art packed in game_spritesheet_3. */
export function probabilityFrame(value: number): string {
  return `prob_${value}`;
}

/** Resource "cards" (portrait art) for the hand, bank summary, and player rows. */
export const RESOURCE_CARD_FRAME: Record<Resource, string> = {
  wood: 'card_lumber',
  brick: 'card_brick',
  sheep: 'card_wool',
  wheat: 'card_grain',
  ore: 'card_ore',
};

export const CARD_HIDDEN = `${BASE}/card_hidden_icon.svg`;
export const CARD_HIDDEN_WARNING = `${BASE}/card_hidden_warning_icon.svg`;
export const CARD_DEV_BACK_FRAME = 'card_devcardback';
export const DEV_CARD_FRAME: Record<DevCardType, string> = {
  knight: 'card_knight',
  monopoly: 'card_monopoly',
  roadBuilding: 'card_roadbuilding',
  yearOfPlenty: 'card_yearofplenty',
  victoryPoint: 'card_vp',
};

/** Award / stat trophies for the player panels (plain vs. held-highlight). */
export const LARGEST_ARMY = `${BASE}/largest_army_icon.svg`;
export const LARGEST_ARMY_HL = `${BASE}/largest_army_icon_highlight.svg`;
export const LARGEST_ROAD = `${BASE}/largest_road_icon.svg`;
export const LARGEST_ROAD_HL = `${BASE}/largest_road_icon_highlight.svg`;

/** Packed trade action icon. */
export const TRADE_FRAME = 'icon_trade';
/** Packed robber used on the board. */
export const ROBBER_FRAME = 'icon_robber';

/**
 * Port art, carved from the packed atlases (see render/spritesheet.ts). The ship
 * sail already shows the ratio + resource, so the renderer just places these:
 * one trade ship per port, plus a wooden pier from the ship to each of its two
 * buildable vertices. Keys double as their TextureMap keys.
 */
export const PORT_SHIP_FRAME: Record<PortType, string> = {
  '3:1': 'port',
  wood: 'port_lumber',
  brick: 'port_brick',
  sheep: 'port_wool',
  wheat: 'port_grain',
  ore: 'port_ore',
};
export const PORT_PIER_FRAME = 'port_pier';

/**
 * Shoreline composites. Each is placed on a sea position just outside the island
 * with beach on the sides that face land (sand outward, foam toward the ocean),
 * matched by rotation. `sides` lists the beach sides at rotation 0, where side i
 * has outward normal (-60 + 60·i)° — clockwise from the upper-right. The standard
 * board only ever needs a single side or two adjacent sides.
 */
export interface ShoreTile {
  frame: string;
  sides: number[];
}
export const SHORE_TILES: ShoreTile[] = [
  { frame: 'tile_shore_1', sides: [0] },
  { frame: 'tile_shore_2_sswwww', sides: [0, 1] },
];

/** Face art for a single die result. */
export function diceAsset(value: number): string {
  return `${BASE}/dice_${value}.svg`;
}
