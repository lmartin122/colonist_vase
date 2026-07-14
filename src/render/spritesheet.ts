import { Assets, Rectangle, Texture } from 'pixi.js';

/**
 * Minimal reader for the packed sprite atlases in `spritesheets/` (spright /
 * TexturePacker "JSON hash" format). Each atlas bundles many icons into one WebP;
 * we load that image once and carve out named sub-textures on demand so the board
 * renderer can use individual frames (ports today, more art later) without a
 * separate file per icon.
 */
interface Rect { x: number; y: number; w: number; h: number }
export interface AtlasFrame {
  frame: Rect;
  /** Where the trimmed content sits within the original (untrimmed) sprite. */
  spriteSourceSize: Rect;
  /** The original, untrimmed sprite size. */
  sourceSize: { w: number; h: number };
}
export interface Atlas {
  meta: { image: string };
  frames: Record<string, AtlasFrame>;
}

/** The packed WebP images live alongside the other art under /public/assets. */
const IMAGE_BASE = '/assets';

/**
 * Load the given frames from an atlas as standalone textures, keyed by frame
 * name. Trim/orig are honoured so `anchor(0.5)` refers to the original sprite's
 * centre (not the trimmed rect) — important for positioning and rotation.
 */
export async function loadAtlasFrames(atlas: Atlas, names: readonly string[]): Promise<Record<string, Texture>> {
  const sheet = await Assets.load<Texture>(`${IMAGE_BASE}/${atlas.meta.image}`);
  const out: Record<string, Texture> = {};
  for (const name of names) {
    const entry = atlas.frames[name];
    if (!entry) continue; // frame missing from this atlas — skip rather than throw
    const { frame: f, spriteSourceSize: s, sourceSize: o } = entry;
    out[name] = new Texture({
      source: sheet.source,
      frame: new Rectangle(f.x, f.y, f.w, f.h),
      orig: new Rectangle(0, 0, o.w, o.h),
      trim: new Rectangle(s.x, s.y, f.w, f.h),
    });
  }
  return out;
}
