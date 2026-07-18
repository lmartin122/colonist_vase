import { Assets, Rectangle, Texture } from 'pixi.js';
import sheet0 from './spritesheets/game_spritesheet_0.json';
import sheet1 from './spritesheets/game_spritesheet_1.json';
import sheet2 from './spritesheets/game_spritesheet_2.json';
import sheet3 from './spritesheets/game_spritesheet_3.json';
import sheet4 from './spritesheets/game_spritesheet_4.json';

/** Rectangle values used by the spright / TexturePacker JSON-hash format. */
interface Rect { x: number; y: number; w: number; h: number }

export interface AtlasFrame {
  frame: Rect;
  /** Where the trimmed content sits within the original (untrimmed) sprite. */
  spriteSourceSize: Rect;
  /** The original, untrimmed sprite size. */
  sourceSize: { w: number; h: number };
  rotated?: boolean;
  trimmed?: boolean;
  anchor?: { x: number; y: number };
}

export interface Atlas {
  meta: {
    image: string;
    size?: { w: number; h: number };
  };
  frames: Record<string, AtlasFrame>;
}

export interface SpriteFrameInfo {
  /** Zero-based `game_spritesheet_N` index. */
  sheet: number;
  /** Image filename under `/public/assets`. */
  image: string;
  /** Full packed image dimensions. */
  atlasSize: { w: number; h: number };
  data: AtlasFrame;
}

/**
 * Every packed game atlas. Add a new JSON import here when another sheet is
 * added; frame discovery and loading will then work without any other mapping.
 */
export const SPRITE_ATLASES: readonly Atlas[] = [sheet0, sheet1, sheet2, sheet3, sheet4] as Atlas[];

/** The packed WebP images live alongside the other art under /public/assets. */
const IMAGE_BASE = '/assets';
const frameIndex = new Map<string, { atlas: Atlas; info: SpriteFrameInfo }>();

for (const [sheet, atlas] of SPRITE_ATLASES.entries()) {
  for (const [name, data] of Object.entries(atlas.frames)) {
    if (frameIndex.has(name)) {
      throw new Error(`Duplicate packed sprite frame: "${name}"`);
    }
    const atlasSize = atlas.meta.size;
    if (!atlasSize) throw new Error(`Packed sprite atlas has no declared size: "${atlas.meta.image}"`);
    frameIndex.set(name, { atlas, info: { sheet, image: atlas.meta.image, atlasSize, data } });
  }
}

/** All available frame names, sorted for search/debug UIs. */
export const SPRITE_NAMES: readonly string[] = Object.freeze([...frameIndex.keys()].sort());

/** Look up a frame without loading its WebP image. */
export function getSpriteFrameInfo(name: string): SpriteFrameInfo | undefined {
  return frameIndex.get(name)?.info;
}

const sourcePromises = new Map<Atlas, Promise<Texture>>();
const texturePromises = new Map<string, Promise<Texture>>();

function loadAtlasSource(atlas: Atlas): Promise<Texture> {
  let pending = sourcePromises.get(atlas);
  if (!pending) {
    pending = Assets.load<Texture>(`${IMAGE_BASE}/${atlas.meta.image}`);
    sourcePromises.set(atlas, pending);
  }
  return pending;
}

function carveTexture(source: Texture, entry: AtlasFrame, label: string): Texture {
  const { frame, spriteSourceSize, sourceSize } = entry;
  return new Texture({
    source: source.source,
    label,
    frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
    orig: new Rectangle(0, 0, sourceSize.w, sourceSize.h),
    trim: new Rectangle(
      spriteSourceSize.x,
      spriteSourceSize.y,
      spriteSourceSize.w,
      spriteSourceSize.h,
    ),
    defaultAnchor: entry.anchor,
    // TexturePacker's clockwise boolean rotation is Pixi's GroupD8 value 2.
    rotate: entry.rotated ? 2 : 0,
  });
}

/**
 * Load any named frame from any of the five game atlases.
 *
 * The base WebP and carved texture are cached, so repeated calls are cheap and
 * return the same Texture instance. Unknown names reject with a useful error.
 *
 * @example
 * const texture = await loadSpriteTexture('city_blue');
 * const sprite = new Sprite(texture);
 */
export function loadSpriteTexture(name: string): Promise<Texture> {
  const indexed = frameIndex.get(name);
  if (!indexed) {
    return Promise.reject(new Error(`Unknown packed sprite frame: "${name}"`));
  }

  let pending = texturePromises.get(name);
  if (!pending) {
    pending = loadAtlasSource(indexed.atlas).then((source) =>
      carveTexture(source, indexed.info.data, name),
    );
    texturePromises.set(name, pending);
  }
  return pending;
}

/** Load a selected set of frames, returned as a map keyed by frame name. */
export async function loadSpriteTextures(names: readonly string[]): Promise<Record<string, Texture>> {
  const uniqueNames = [...new Set(names)];
  const textures = await Promise.all(uniqueNames.map(loadSpriteTexture));
  return Object.fromEntries(uniqueNames.map((name, index) => [name, textures[index]]));
}

/** Load all packed frames. Prefer `loadSpriteTextures` when only a subset is needed. */
export function loadAllSpriteTextures(): Promise<Record<string, Texture>> {
  return loadSpriteTextures(SPRITE_NAMES);
}

/**
 * Low-level loader retained for callers that supply a standalone compatible
 * atlas. Most game code should use `loadSpriteTexture(s)` above.
 */
export async function loadAtlasFrames(atlas: Atlas, names: readonly string[]): Promise<Record<string, Texture>> {
  const source = await loadAtlasSource(atlas);
  const out: Record<string, Texture> = {};
  for (const name of names) {
    const entry = atlas.frames[name];
    if (entry) out[name] = carveTexture(source, entry, name);
  }
  return out;
}
