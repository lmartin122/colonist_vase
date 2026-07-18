import type { LogEntry } from '../engine/types';

/** Whether this viewer may see the exact resource identity in a rich log row. */
export function canRevealLogResources(entry: LogEntry, viewer: number): boolean {
  const details = entry.details;
  if (!details) return false;
  if (details.visibility === 'public') return true;
  return entry.player === viewer || (details.type === 'steal' && details.victim === viewer);
}
