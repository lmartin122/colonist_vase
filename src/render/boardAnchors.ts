/**
 * Bridge so non-Pixi code (the card-flight overlay) can ask where a board tile
 * currently sits on screen. GameCanvas registers a locator backed by the live
 * BoardRenderer; consumers get client (viewport) pixel coordinates or null.
 */
export type ClientPos = { x: number; y: number };
type Locator = (tileId: number) => ClientPos | null;

let locator: Locator | null = null;

export function setTileLocator(fn: Locator | null): void {
  locator = fn;
}

export function tileClientPos(tileId: number): ClientPos | null {
  return locator ? locator(tileId) : null;
}
