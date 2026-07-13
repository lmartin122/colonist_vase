import type { PlayerColor, TileType } from '../engine/types';

/** Terrain fill colors — bright but not oversaturated, modern flat look. */
export const TILE_COLORS: Record<TileType, number> = {
  wood: 0x4e8d57, // forest
  brick: 0xce6a45, // hills
  sheep: 0xa7d06a, // pasture
  wheat: 0xeac65c, // fields
  ore: 0x8b97a6, // mountains
  desert: 0xe3d6b0, // sand
};

/** Slightly lighter tint used for the top of each tile's vertical gradient. */
export const TILE_COLORS_LIGHT: Record<TileType, number> = {
  wood: 0x62a86b,
  brick: 0xe08159,
  sheep: 0xbcdd82,
  wheat: 0xf3d675,
  ore: 0xa3aeba,
  desert: 0xefe4c4,
};

/** Darker terrain motif color drawn on each tile (tree, brick, etc.). */
export const TILE_MOTIF: Record<TileType, number> = {
  wood: 0x2f5f38,
  brick: 0x9c4326,
  sheep: 0x6fa03f,
  wheat: 0xc79a2f,
  ore: 0x5f6b7a,
  desert: 0xcbb98a,
};

/** Emoji still used for the small coastal port badges. */
export const TILE_GLYPH: Record<TileType, string> = {
  wood: '🌲',
  brick: '🧱',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛏️',
  desert: '🏜️',
};

export const PLAYER_HEX: Record<PlayerColor, number> = {
  red: 0xd6402f,
  blue: 0x2e7be4,
  orange: 0xe8862a,
  green: 0x3c9e4e,
  black: 0x242424,
};

export const PLAYER_CSS: Record<PlayerColor, string> = {
  red: '#D6402F',
  blue: '#2E7BE4',
  orange: '#E8862A',
  green: '#3C9E4E',
  black: '#242424',
};

export const OCEAN = 0x2e6e96;
export const OCEAN_DEEP = 0x1d4d6b;
export const OCEAN_WAVE = 0x579fb0;
export const TILE_STROKE = 0x1f2d24;
export const ROBBER_COLOR = 0x2b2a28;
export const TOKEN_BG = 0xfbf7ef;
export const TOKEN_INK = 0x2e2a25;
export const TOKEN_HOT = 0xc0392b; // red numbers (6 & 8)
export const HIGHLIGHT = 0xffe066;
