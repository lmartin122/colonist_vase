import { useEffect } from 'react';
import { playSound, preloadSounds } from '../state/sounds';

/**
 * Mounted only while a game is on screen. Warms the audio cache and plays the
 * generic click sfx on any in-game pointer interaction. Action-specific sounds
 * (dice, road, robber, awards, your-turn, discard) are emitted from the store.
 */
export function SoundManager() {
  useEffect(() => {
    preloadSounds();
    const onDown = () => playSound('click');
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  return null;
}
