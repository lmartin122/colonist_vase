import { Assets, type Texture } from 'pixi.js';
import { boardTextureUrls } from '../assets';

export type TextureMap = Record<string, Texture>;

/** Preload all board SVG art as PixiJS textures before the first render. */
export async function loadBoardTextures(): Promise<TextureMap> {
  return Assets.load(boardTextureUrls());
}
