import type { PlayerColor, TileType } from '../engine/types';

/** Tile fill colors — an original, slightly desaturated modern palette. */
export const TILE_COLORS: Record<TileType, number> = {
  wood: 0x3f7d4e,
  brick: 0xc1543a,
  sheep: 0x8fca5c,
  wheat: 0xe6b84f,
  ore: 0x7f8b9c,
  desert: 0xd9c9a3,
};

/** Emoji glyph shown at each tile center. */
export const TILE_GLYPH: Record<TileType, string> = {
  wood: '🌲',
  brick: '🧱',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛏️',
  desert: '🏜️',
};

export const PLAYER_HEX: Record<PlayerColor, number> = {
  red: 0xe4572e,
  blue: 0x3a86ff,
  orange: 0xf6900d,
  white: 0xf1f5f9,
};

export const PLAYER_CSS: Record<PlayerColor, string> = {
  red: '#e4572e',
  blue: '#3a86ff',
  orange: '#f6900d',
  white: '#e2e8f0',
};

export const OCEAN = 0x1c4b6b;
export const OCEAN_DEEP = 0x123449;
export const TILE_STROKE = 0x0a1c29;
export const ROBBER_COLOR = 0x1e1b16;
export const TOKEN_BG = 0xf7f1e1;
export const TOKEN_HOT = 0xb4442f; // red numbers (6 & 8)
export const HIGHLIGHT = 0xffe066;
