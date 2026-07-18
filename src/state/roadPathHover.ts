type RoadPathHoverListener = (playerId: number | null) => void;

const listeners = new Set<RoadPathHoverListener>();

export function setRoadPathHover(playerId: number | null): void {
  for (const listener of listeners) listener(playerId);
}

export function subscribeRoadPathHover(listener: RoadPathHoverListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
