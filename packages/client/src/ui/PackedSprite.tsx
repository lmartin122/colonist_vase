import { getSpriteFrameInfo } from '../render/spritesheet';
import type { CSSProperties, MouseEventHandler } from 'react';

interface PackedSpriteProps {
  name: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<SVGSVGElement>;
}

/**
 * Displays one packed atlas frame in regular HTML UI. The nested SVG viewport
 * clips neighboring atlas content and restores the frame's original trim space.
 */
export function PackedSprite({ name, alt = '', className, style, onClick }: PackedSpriteProps) {
  const info = getSpriteFrameInfo(name);
  if (!info) return null;

  const { frame, sourceSize, spriteSourceSize } = info.data;
  const accessibility = alt
    ? { role: 'img', 'aria-label': alt }
    : { 'aria-hidden': true as const };

  return (
    <svg
      viewBox={`0 0 ${sourceSize.w} ${sourceSize.h}`}
      overflow="hidden"
      className={className}
      style={style}
      onClick={onClick}
      {...accessibility}
    >
      <svg
        x={spriteSourceSize.x}
        y={spriteSourceSize.y}
        width={spriteSourceSize.w}
        height={spriteSourceSize.h}
        viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
        preserveAspectRatio="none"
        overflow="hidden"
      >
        <image
          href={`/assets/${info.image}`}
          width={info.atlasSize.w}
          height={info.atlasSize.h}
        />
      </svg>
    </svg>
  );
}
