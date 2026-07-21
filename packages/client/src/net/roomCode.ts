/**
 * Accept a bare room code or a copied lobby/game URL. Query strings and hashes
 * are ignored so shared links can be pasted directly into the room input.
 */
export function normalizeRoomCode(value: string): string {
  const withoutQuery = value.trim().split(/[?#]/, 1)[0].replace(/\/+$/, '');
  const candidate = withoutQuery.split('/').filter(Boolean).at(-1) ?? '';
  return candidate.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
}
