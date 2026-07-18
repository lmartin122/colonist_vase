import { describe, expect, it } from 'vitest';
import {
  getSpriteFrameInfo,
  loadSpriteTexture,
  SPRITE_ATLASES,
  SPRITE_NAMES,
} from '../src/render/spritesheet';
import {
  CARD_DEV_BACK_FRAME,
  DEV_CARD_FRAME,
  HEX_FRAME,
  HEX_SIDE_FRAME,
  RESOURCE_CARD_FRAME,
  RIBBON_LARGE_FRAME,
  RIBBON_LONG_FRAME,
  ROBBER_FRAME,
  TRADE_FRAME,
  cityFrame,
  playerBackgroundFrame,
  roadFrame,
  settlementFrame,
} from '../src/assets';
import { PLAYER_COLORS } from '../src/engine/constants';

describe('packed spritesheets', () => {
  it('indexes every unique frame across all five sheets', () => {
    const manifestNames = SPRITE_ATLASES.flatMap((atlas) => Object.keys(atlas.frames));

    expect(SPRITE_ATLASES).toHaveLength(5);
    expect(SPRITE_NAMES).toHaveLength(382);
    expect(new Set(manifestNames).size).toBe(manifestNames.length);
    expect([...SPRITE_NAMES].sort()).toEqual([...manifestNames].sort());
  });

  it('resolves frame metadata from sheets that were not previously exposed', () => {
    expect(getSpriteFrameInfo('card_devcardback')?.sheet).toBe(1);
    expect(getSpriteFrameInfo('city_blue')?.sheet).toBe(4);
    expect(getSpriteFrameInfo('does_not_exist')).toBeUndefined();
  });

  it('has a complete road, settlement, and city set for every selectable color', () => {
    for (const color of PLAYER_COLORS) {
      expect(getSpriteFrameInfo(roadFrame(color)), `${color} road`).toBeDefined();
      expect(getSpriteFrameInfo(settlementFrame(color)), `${color} settlement`).toBeDefined();
      expect(getSpriteFrameInfo(cityFrame(color)), `${color} city`).toBeDefined();
      expect(getSpriteFrameInfo(playerBackgroundFrame(color)), `${color} player background`).toBeDefined();
    }
    expect(getSpriteFrameInfo(RIBBON_LARGE_FRAME)).toBeDefined();
    expect(getSpriteFrameInfo(RIBBON_LONG_FRAME)).toBeDefined();
  });

  it('contains every development-card face used by the HUD', () => {
    for (const frame of Object.values(DEV_CARD_FRAME)) {
      expect(getSpriteFrameInfo(frame), frame).toBeDefined();
    }
  });

  it('contains every packed resource, terrain, card-back, and action asset', () => {
    const frames = [
      ...Object.values(RESOURCE_CARD_FRAME),
      ...Object.values(HEX_FRAME),
      ...Object.values(HEX_SIDE_FRAME),
      CARD_DEV_BACK_FRAME,
      TRADE_FRAME,
      ROBBER_FRAME,
    ];
    for (const frame of frames) expect(getSpriteFrameInfo(frame), frame).toBeDefined();
  });

  it('keeps every frame inside its declared atlas bounds', () => {
    for (const atlas of SPRITE_ATLASES) {
      const size = atlas.meta.size;
      expect(size).toBeDefined();
      if (!size) continue;

      for (const entry of Object.values(atlas.frames)) {
        expect(entry.frame.x).toBeGreaterThanOrEqual(0);
        expect(entry.frame.y).toBeGreaterThanOrEqual(0);
        expect(entry.frame.x + entry.frame.w).toBeLessThanOrEqual(size.w);
        expect(entry.frame.y + entry.frame.h).toBeLessThanOrEqual(size.h);
      }
    }
  });

  it('rejects unknown names before attempting an image load', async () => {
    await expect(loadSpriteTexture('does_not_exist')).rejects.toThrow(
      'Unknown packed sprite frame',
    );
  });
});
