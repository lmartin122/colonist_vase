import { useEffect, useState } from 'react';
import { useUiPreferences } from './preferences';

export function resolveReducedMotion(animationMode: 'system' | 'full' | 'reduced', systemReduced: boolean): boolean {
  return animationMode === 'reduced' || (animationMode === 'system' && systemReduced);
}

export function useReducedMotionPreference(): boolean {
  const { animationMode } = useUiPreferences();
  const [systemReduced, setSystemReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return resolveReducedMotion(animationMode, systemReduced);
}
