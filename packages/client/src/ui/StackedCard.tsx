import { PackedSprite } from './PackedSprite';

export type StackDirection = 'left' | 'right' | 'up' | 'down';

type StackedCardProps = {
  src?: string;
  /** Packed atlas frame name; takes precedence over `src`. */
  sprite?: string;
  alt: string;
  count: number;
  title?: string;
  onClick?: () => void;
  direction?: StackDirection;
  cardWidth?: number;
  cardHeight?: number;
  overlap?: number;
  maxVisible?: number;
  /** Fan cards with a count badge. When false, render every card side by side. */
  stacked?: boolean;
  /** Use a representative number of visible cards while retaining the exact count badge. */
  visibleCount?: number;
  className?: string;
  handStackId?: string;
};

/**
 * A compact card pile whose repeated cards visibly fan in any direction.
 * The foremost card always owns the blue count badge, while its layer masks
 * the overlapping parts of the cards behind it.
 */
export function StackedCard({
  src,
  sprite,
  alt,
  count,
  title,
  onClick,
  direction = 'right',
  cardWidth = 40,
  cardHeight = 56,
  overlap = 7,
  maxVisible = 4,
  stacked = true,
  visibleCount,
  className = '',
  handStackId,
}: StackedCardProps) {
  const shown = Math.max(0, visibleCount ?? (stacked ? Math.min(count, maxVisible) : count));
  const step = stacked ? overlap : cardWidth + 2;
  const span = Math.max(0, shown - 1) * step;
  const vertical = stacked && (direction === 'up' || direction === 'down');
  const width = cardWidth + (vertical ? 0 : span);
  const height = cardHeight + (vertical ? span : 0);
  const frontX = direction === 'left' ? span : 0;
  const frontY = direction === 'up' ? span : 0;
  const position = (index: number) => ({
    left: !stacked ? index * step : direction === 'left' ? span - index * step : direction === 'right' ? index * step : 0,
    top: !stacked ? 0 : direction === 'up' ? span - index * step : direction === 'down' ? index * step : 0,
  });
  const content = (
    <>
      {Array.from({ length: shown }, (_, index) => {
        const { left, top } = position(index);
        const style = { left, top, width: cardWidth, height: cardHeight, zIndex: shown - index };
        return sprite ? (
          <PackedSprite
            key={index}
            name={sprite}
            alt={index === 0 ? alt : ''}
            className="absolute rounded-md object-contain shadow-sm"
            style={style}
          />
        ) : (
          <img
            key={index}
            src={src}
            alt={index === 0 ? alt : ''}
            className="absolute rounded-md object-contain shadow-sm"
            style={style}
            draggable={false}
          />
        );
      })}
      {stacked && count > 1 && <span className="absolute z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-p-blue px-1 text-[10px] font-extrabold text-white ring-2 ring-card" style={{ left: frontX + cardWidth - 7, top: frontY - 5 }}>{count}</span>}
    </>
  );
  const shared = `relative shrink-0 overflow-visible rounded-md ${className}`;
  if (onClick) {
    return <button type="button" title={title ?? alt} onClick={onClick} data-hand-stack={handStackId} className={`${shared} transition hover:-translate-y-0.5 hover:ring-2 hover:ring-p-red`} style={{ width, height }}>{content}</button>;
  }
  return <div title={title ?? alt} data-hand-stack={handStackId} className={shared} style={{ width, height }}>{content}</div>;
}
