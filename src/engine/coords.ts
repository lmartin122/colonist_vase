/**
 * Hex geometry for a pointy-top layout (a vertex points straight up).
 *
 * Tiles use axial coordinates (q, r). Vertices and edges are *derived* from tile
 * corners by computing pixel positions and de-duplicating shared points, which
 * yields the canonical 19 tiles / 54 vertices / 72 edges of the standard board
 * without hand-maintaining an adjacency table.
 */

export interface Axial {
  q: number;
  r: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Layout size in "world" units; the renderer scales this to fit the screen. */
export const HEX_SIZE = 100;

/** Axial (q, r) -> pixel center for a pointy-top hex. */
export function axialToPixel(hex: Axial, size = HEX_SIZE): Point {
  const x = size * Math.sqrt(3) * (hex.q + hex.r / 2);
  const y = size * (3 / 2) * hex.r;
  return { x, y };
}

/** The six corner points of a pointy-top hex, in clockwise order from the top. */
export function hexCorners(hex: Axial, size = HEX_SIZE): Point[] {
  const center = axialToPixel(hex, size);
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    // -90° puts corner 0 at the top; step 60° clockwise.
    const angle = (Math.PI / 180) * (60 * i - 90);
    corners.push({
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle),
    });
  }
  return corners;
}

/**
 * Quantize a point to a stable string key so corners/edges shared by adjacent
 * tiles collapse to a single entity. HEX_SIZE is large enough that distinct
 * points never round together while float error never splits a shared one.
 */
export function pointKey(p: Point): string {
  return `${Math.round(p.x)},${Math.round(p.y)}`;
}

/** All 19 axial coordinates of a radius-2 hexagonal board (center + 2 rings). */
export function standardBoardAxials(radius = 2): Axial[] {
  const hexes: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      if (Math.abs(s) <= radius) hexes.push({ q, r });
    }
  }
  return hexes;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
