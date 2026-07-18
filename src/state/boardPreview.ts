import type { GameState, LogEntry } from '../engine/types';

export interface BoardPreview {
  tiles?: number[];
  vertices?: number[];
  edges?: number[];
  players?: number[];
}

export function boardPreviewForLogEntry(entry: LogEntry, game: GameState): BoardPreview | null {
  const details = entry.details;
  if (!details) return null;
  if (details.type === 'dice') {
    const sum = details.dice[0] + details.dice[1];
    return { tiles: game.board.tiles.filter((tile) => tile.number === sum).map((tile) => tile.id) };
  }
  if (details.type === 'piece') return details.edge !== undefined ? { edges: [details.edge] } : details.vertex !== undefined ? { vertices: [details.vertex] } : null;
  if (details.type === 'robber') return { tiles: [details.tile] };
  return null;
}

type Listener = (preview: BoardPreview | null) => void;
const listeners = new Set<Listener>();

export function setBoardPreview(preview: BoardPreview | null): void {
  for (const listener of listeners) listener(preview);
}

export function subscribeBoardPreview(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
