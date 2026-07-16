import { Assets, type Texture } from 'pixi.js';
import { PORT_PIER_FRAME, PORT_SHIP_FRAME, boardTextureUrls } from '../assets';
import sheet0 from './spritesheets/game_spritesheet_0.json';
import sheet2 from './spritesheets/game_spritesheet_2.json';
import sheet3 from './spritesheets/game_spritesheet_3.json';
import { loadAtlasFrames, type Atlas } from './spritesheet';

export type TextureMap = Record<string, Texture>;

/**
 * Packed board art: trade ships + the 1-side beach live in atlas 3, the wooden
 * pier in atlas 0, and the 2-side corner beach in atlas 2.
 */
async function loadAtlasTextures(): Promise<TextureMap> {
  const [ships, piers, shore2] = await Promise.all([
    loadAtlasFrames(sheet3 as Atlas, [...Object.values(PORT_SHIP_FRAME), 'tile_shore_1']),
    loadAtlasFrames(sheet0 as Atlas, [PORT_PIER_FRAME]),
    loadAtlasFrames(sheet2 as Atlas, ['tile_shore_2_sswwww']),
  ]);
  return { ...ships, ...piers, ...shore2 };
}

/** Preload all board art (SVG pieces + packed atlas sprites) as PixiJS textures. */
export async function loadBoardTextures(): Promise<TextureMap> {
  const [svg, atlas] = await Promise.all([
    Assets.load(boardTextureUrls()) as Promise<TextureMap>,
    loadAtlasTextures(),
  ]);
  return { ...svg, ...atlas };
}
