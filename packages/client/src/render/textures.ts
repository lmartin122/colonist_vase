import type { Texture } from 'pixi.js';
import { HEX_FRAME, HEX_SIDE_FRAME, HIGHLIGHT_CIRCLE_FRAME, PORT_PIER_FRAME, PORT_SHIP_FRAME, ROBBER_FRAME, cityFrame, probabilityFrame, roadFrame, settlementFrame } from '../assets';
import { PLAYER_COLORS } from '@colonist/shared';
import { loadSpriteTextures } from './spritesheet';

export type TextureMap = Record<string, Texture>;

/**
 * Packed board art: player pieces, trade ships, piers, and shoreline tiles.
 */
async function loadAtlasTextures(): Promise<TextureMap> {
  return loadSpriteTextures([
    ...Object.values(HEX_FRAME),
    ...Object.values(HEX_SIDE_FRAME),
    ...[2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map(probabilityFrame),
    HIGHLIGHT_CIRCLE_FRAME,
    ...PLAYER_COLORS.flatMap((color) => [roadFrame(color), settlementFrame(color), cityFrame(color)]),
    ...Object.values(PORT_SHIP_FRAME),
    PORT_PIER_FRAME,
    ROBBER_FRAME,
    'tile_shore_1',
    'tile_shore_2_sswwww',
  ]);
}

/** Preload all packed board sprites as PixiJS textures. */
export async function loadBoardTextures(): Promise<TextureMap> {
  return loadAtlasTextures();
}
