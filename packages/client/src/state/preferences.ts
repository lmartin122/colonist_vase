import { useSyncExternalStore } from 'react';
import type { BotDifficulty, GameRules, PlayerColor } from '@colonist/shared';
import { setSoundEnabled, soundEnabled } from './sounds';

export type AnimationMode = 'system' | 'full' | 'reduced';

export interface UiPreferences {
  sound: boolean;
  animationMode: AnimationMode;
}

export interface SavedGameSetup {
  version: 1;
  botSlots: boolean[];
  botDifficulties: BotDifficulty[];
  playerColors: PlayerColor[];
  layout: 'random' | 'classic';
  rules: GameRules;
}

const UI_KEY = 'cv-ui-preferences-v1';
const SETUP_KEY = 'cv-game-setup-v1';

export function normalizeUiPreferences(value: unknown, fallback: UiPreferences = { sound: true, animationMode: 'full' }): UiPreferences {
  const candidate = value && typeof value === 'object' ? value as Partial<UiPreferences> : {};
  return {
    sound: typeof candidate.sound === 'boolean' ? candidate.sound : fallback.sound,
    animationMode: candidate.animationMode === 'reduced' ? 'reduced' : 'full',
  };
}

function readUiPreferences(): UiPreferences {
  const fallback: UiPreferences = { sound: soundEnabled(), animationMode: 'full' };
  if (typeof window === 'undefined') return fallback;
  try {
    return normalizeUiPreferences(JSON.parse(localStorage.getItem(UI_KEY) ?? ''), fallback);
  } catch {
    return fallback;
  }
}

let uiPreferences = readUiPreferences();
setSoundEnabled(uiPreferences.sound);
if (typeof document !== 'undefined') document.documentElement.dataset.motion = uiPreferences.animationMode;
const listeners = new Set<() => void>();

export function setUiPreferences(patch: Partial<UiPreferences>): void {
  uiPreferences = { ...uiPreferences, ...patch };
  if (patch.sound !== undefined) setSoundEnabled(patch.sound);
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = uiPreferences.animationMode;
  if (typeof window !== 'undefined') localStorage.setItem(UI_KEY, JSON.stringify(uiPreferences));
  for (const listener of listeners) listener();
}

export function useUiPreferences(): UiPreferences {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => uiPreferences,
    () => uiPreferences,
  );
}

export function loadGameSetup(): SavedGameSetup | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(localStorage.getItem(SETUP_KEY) ?? '') as SavedGameSetup;
    return value.version === 1 ? value : null;
  } catch {
    return null;
  }
}

export function saveGameSetup(value: Omit<SavedGameSetup, 'version'>): void {
  if (typeof window !== 'undefined') localStorage.setItem(SETUP_KEY, JSON.stringify({ version: 1, ...value }));
}
