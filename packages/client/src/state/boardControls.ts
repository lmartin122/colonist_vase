export type BoardControlAction = 'zoomIn' | 'zoomOut' | 'recenter';

type Listener = (action: BoardControlAction) => void;
const listeners = new Set<Listener>();

export function sendBoardControl(action: BoardControlAction): void {
  for (const listener of listeners) listener(action);
}

export function subscribeBoardControl(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
