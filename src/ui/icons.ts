import type { Resource } from '../engine/types';

/** Emoji glyphs for resources, reused across the HUD. */
export const RESOURCE_ICON: Record<Resource, string> = {
  wood: '🌲',
  brick: '🧱',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛏️',
};

export const RESOURCE_LABEL: Record<Resource, string> = {
  wood: 'Wood',
  brick: 'Brick',
  sheep: 'Sheep',
  wheat: 'Wheat',
  ore: 'Ore',
};
