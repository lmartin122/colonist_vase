export type StackDirection = 'left' | 'right' | 'up' | 'down';

type StackedCardProps = {
  src: string;
  alt: string;
  count: number;
  title?: string;
  onClick?: () => void;
  direction?: StackDirection;
  cardWidth?: number;
  cardHeight?: number;
  overlap?: number;
  maxVisible?: number;
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
  alt,
  count,
  title,
  onClick,
  direction = 'right',
  cardWidth = 40,
  cardHeight = 56,
  overlap = 7,
  maxVisible = 4,
  visibleCount,
  className = '',
  handStackId,
}: StackedCardProps) {
  const shown = Math.max(0, visibleCount ?? Math.min(count, maxVisible));
  const span = Math.max(0, shown - 1) * overlap;
  const vertical = direction === 'up' || direction === 'down';
  const width = cardWidth + (vertical ? 0 : span);
  const height = cardHeight + (vertical ? span : 0);
  const frontX = direction === 'left' ? span : 0;
  const frontY = direction === 'up' ? span : 0;
  const position = (index: number) => ({
    left: direction === 'left' ? span - index * overlap : direction === 'right' ? index * overlap : 0,
    top: direction === 'up' ? span - index * overlap : direction === 'down' ? index * overlap : 0,
  });
  const content = (
    <>
      {Array.from({ length: shown }, (_, index) => {
        const { left, top } = position(index);
        return (
          <img
            key={index}
            src={src}
            alt={index === 0 ? alt : ''}
            className="absolute rounded-md object-contain shadow-sm"
            style={{ left, top, width: cardWidth, height: cardHeight, zIndex: shown - index }}
            draggable={false}
          />
        );
      })}
      {count > 0 && <span className="absolute z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-p-blue px-1 text-[10px] font-extrabold text-white ring-2 ring-card" style={{ left: frontX + cardWidth - 7, top: frontY - 5 }}>{count}</span>}
    </>
  );
  const shared = `relative shrink-0 overflow-visible rounded-md ${className}`;
  if (onClick) {
    return <button type="button" title={title ?? alt} onClick={onClick} data-hand-stack={handStackId} className={`${shared} transition hover:-translate-y-0.5 hover:ring-2 hover:ring-p-red`} style={{ width, height }}>{content}</button>;
  }
  return <div title={title ?? alt} data-hand-stack={handStackId} className={shared} style={{ width, height }}>{content}</div>;
}
