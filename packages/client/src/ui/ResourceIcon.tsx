import type { Resource } from '@colonist/shared';

/**
 * Flat vector resource icons with a single, consistent visual language: 24×24
 * viewBox, same padding, filled shapes (no strokes) so every icon reads at the
 * same weight and scale across the HUD.
 */
export function ResourceIcon({ resource, size = 22, className }: { resource: Resource; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      {ICONS[resource]}
    </svg>
  );
}

const ICONS: Record<Resource, JSX.Element> = {
  wood: (
    <>
      <rect x="10.5" y="14" width="3" height="7" rx="1" fill="#8a5a34" />
      <path d="M12 3l5 6h-3.2l3.8 5H6.4l3.8-5H7z" fill="#3f8a52" />
    </>
  ),
  brick: (
    <>
      <rect x="3" y="8" width="8" height="5" rx="1" fill="#c85f3c" />
      <rect x="13" y="8" width="8" height="5" rx="1" fill="#c85f3c" />
      <rect x="8" y="14.5" width="8" height="5" rx="1" fill="#b5502f" />
      <rect x="3" y="14.5" width="4" height="5" rx="1" fill="#b5502f" />
      <rect x="17" y="14.5" width="4" height="5" rx="1" fill="#b5502f" />
    </>
  ),
  sheep: (
    <>
      <ellipse cx="12" cy="13.5" rx="8" ry="6" fill="#f3ecdd" />
      <circle cx="17.5" cy="11" r="3.2" fill="#4a4137" />
      <rect x="7" y="18" width="2.4" height="4" rx="1" fill="#4a4137" />
      <rect x="14.6" y="18" width="2.4" height="4" rx="1" fill="#4a4137" />
      <circle cx="18.6" cy="10.4" r="0.7" fill="#f3ecdd" />
    </>
  ),
  wheat: (
    <>
      <rect x="11" y="9" width="2" height="13" rx="1" fill="#c79a2f" />
      <path d="M12 3c2 1.4 2 3.6 0 5-2-1.4-2-3.6 0-5z" fill="#e9c14e" />
      <path d="M7 7c2.3.4 3.4 2.2 3 4.6C7.7 11.2 6.6 9.4 7 7z" fill="#e9c14e" />
      <path d="M17 7c-2.3.4-3.4 2.2-3 4.6 2.3-.4 3.4-2.2 3-4.6z" fill="#e9c14e" />
    </>
  ),
  ore: (
    <>
      <path d="M2 20L9 7l4 6 2-3 7 10z" fill="#798493" />
      <path d="M13 13l2-3 7 10h-6z" fill="#5f6b7a" />
      <path d="M7.4 10.2L9 7l2.1 3.1-1.7 2.4z" fill="#eef2f6" />
    </>
  ),
};
