import {
  axialToPixel,
  hexCorners,
  pointKey,
  standardBoardAxials,
  type Axial,
  type Point,
} from './coords';
import { shuffle, type RngState } from './rng';
import type { Board, Edge, PortType, Tile, TileType, Vertex } from './types';

/** Tile-type multiset for the standard 19-tile board. */
const TILE_BAG: TileType[] = [
  ...Array<TileType>(4).fill('wood'),
  ...Array<TileType>(4).fill('sheep'),
  ...Array<TileType>(4).fill('wheat'),
  ...Array<TileType>(3).fill('brick'),
  ...Array<TileType>(3).fill('ore'),
  'desert',
];

/** Classic number-token sequence, laid outer-ring inward over non-desert tiles. */
const TOKEN_SEQUENCE = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

/** Fixed resource layout used when `layout: 'classic'` (spiral, outer-in). */
const CLASSIC_TYPES: TileType[] = [
  'ore', 'sheep', 'wood', 'wheat', 'brick', 'sheep', 'brick', 'wheat', 'wood',
  'wheat', 'ore', 'wood', 'ore', 'brick', 'sheep', 'wood', 'sheep', 'wheat',
  'desert',
];

/** Port types around the coast: four generic 3:1 plus one 2:1 per resource. */
const PORT_TYPES: PortType[] = ['3:1', 'wheat', 'ore', '3:1', 'sheep', '3:1', 'brick', 'wood', '3:1'];

export interface BoardOptions {
  layout: 'classic' | 'random';
}

/**
 * Build the full board graph — tiles, de-duplicated vertices/edges, tile
 * numbers, and ports — from pure geometry. Returns the advanced RNG so board
 * generation stays part of the deterministic state pipeline.
 */
export function generateBoard(
  options: BoardOptions,
  rng: RngState,
): { board: Board; rng: RngState } {
  const axials = standardBoardAxials(2);
  const spiral = spiralOrder(axials);

  // --- Tiles, vertices, edges from geometry -------------------------------
  const tiles: Tile[] = [];
  const vertices: Vertex[] = [];
  const edges: Edge[] = [];
  const vertexByKey = new Map<string, number>();
  const edgeByKey = new Map<string, number>();
  const edgeTileCount = new Map<number, number>();

  const getVertex = (p: Point): number => {
    const key = pointKey(p);
    let id = vertexByKey.get(key);
    if (id === undefined) {
      id = vertices.length;
      vertexByKey.set(key, id);
      vertices.push({
        id,
        point: p,
        tileIds: [],
        edgeIds: [],
        adjacentVertexIds: [],
        port: null,
      });
    }
    return id;
  };

  const getEdge = (a: number, b: number): number => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    let id = edgeByKey.get(key);
    if (id === undefined) {
      id = edges.length;
      edgeByKey.set(key, id);
      const va = vertices[a].point;
      const vb = vertices[b].point;
      edges.push({
        id,
        vertexIds: [a, b],
        point: { x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2 },
        coastal: false,
      });
      link(vertices[a].edgeIds, id);
      link(vertices[b].edgeIds, id);
      link(vertices[a].adjacentVertexIds, b);
      link(vertices[b].adjacentVertexIds, a);
    }
    edgeTileCount.set(id, (edgeTileCount.get(id) ?? 0) + 1);
    return id;
  };

  for (const axial of axials) {
    const corners = hexCorners(axial);
    const vertexIds = corners.map(getVertex);
    const tileId = tiles.length;
    const edgeIds: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = vertexIds[i];
      const b = vertexIds[(i + 1) % 6];
      edgeIds.push(getEdge(a, b));
    }
    for (const vid of vertexIds) link(vertices[vid].tileIds, tileId);
    tiles.push({
      id: tileId,
      axial,
      center: axialToPixel(axial),
      type: 'desert',
      number: null,
      vertexIds,
      edgeIds,
    });
  }

  for (const edge of edges) {
    edge.coastal = edgeTileCount.get(edge.id) === 1;
  }

  // --- Assign tile types & numbers ----------------------------------------
  let cursor = rng;
  let types: TileType[];
  if (options.layout === 'classic') {
    // CLASSIC_TYPES is authored in spiral order; map back to tile ids.
    types = new Array(tiles.length);
    spiral.forEach((tileId, i) => (types[tileId] = CLASSIC_TYPES[i]));
  } else {
    const shuffled = shuffle(TILE_BAG, cursor);
    cursor = shuffled.rng;
    types = new Array(tiles.length);
    spiral.forEach((tileId, i) => (types[tileId] = shuffled.items[i]));
  }
  for (const tile of tiles) tile.type = types[tile.id];

  // Numbers follow the classic token sequence over non-desert tiles, spiral order.
  let tokenIdx = 0;
  for (const tileId of spiral) {
    const tile = tiles[tileId];
    if (tile.type === 'desert') continue;
    tile.number = TOKEN_SEQUENCE[tokenIdx++];
  }

  const robberTileId = tiles.find((t) => t.type === 'desert')!.id;

  const board: Board = { tiles, vertices, edges, robberTileId };
  assignPorts(board);

  return { board, rng: cursor };
}

/** Place ports on evenly-spaced coastal edges and tag their vertices. */
function assignPorts(board: Board): void {
  const coastal = board.edges
    .filter((e) => e.coastal)
    .sort((a, b) => angle(a.point) - angle(b.point));
  if (coastal.length === 0) return;
  const spacing = coastal.length / PORT_TYPES.length;
  PORT_TYPES.forEach((type, i) => {
    const edge = coastal[Math.floor(i * spacing) % coastal.length];
    for (const vid of edge.vertexIds) board.vertices[vid].port = type;
  });
}

function angle(p: Point): number {
  return Math.atan2(p.y, p.x);
}

/** Order tiles outer-ring inward (spiral), matching classic token placement. */
function spiralOrder(axials: Axial[]): number[] {
  const idByKey = new Map<string, number>();
  axials.forEach((a, i) => idByKey.set(`${a.q},${a.r}`, i));
  const order: number[] = [];
  for (let radius = 2; radius >= 1; radius--) {
    for (const axial of ring(radius)) {
      const id = idByKey.get(`${axial.q},${axial.r}`);
      if (id !== undefined) order.push(id);
    }
  }
  order.push(idByKey.get('0,0')!); // center last
  return order;
}

/** Axial coordinates forming the ring at the given radius, clockwise. */
function ring(radius: number): Axial[] {
  if (radius === 0) return [{ q: 0, r: 0 }];
  // Canonical cube-ring direction order (redblobgames); start on the left edge.
  const dirs: Axial[] = [
    { q: 1, r: -1 },
    { q: 1, r: 0 },
    { q: 0, r: 1 },
    { q: -1, r: 1 },
    { q: -1, r: 0 },
    { q: 0, r: -1 },
  ];
  const results: Axial[] = [];
  let hex: Axial = { q: -radius, r: 0 }; // start on the left
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      results.push({ ...hex });
      hex = { q: hex.q + dirs[side].q, r: hex.r + dirs[side].r };
    }
  }
  return results;
}

function link(list: number[], value: number): void {
  if (!list.includes(value)) list.push(value);
}
