import { coastalEdgesByAngle, PORT_TYPE_SEQUENCE } from '../engine/board';
import type { Board, PortType } from '../engine/types';

/**
 * A port occupies both vertices of exactly one edge (see `drawPorts` in
 * BoardRenderer). Neighboring coastal edges share one of those vertices, so a
 * single vertex's `port` field alone doesn't tell you whether *this* edge is
 * the port — both of the edge's vertices must agree.
 */
function portAt(board: Board, edgeId: number): PortType | null {
  const [a, b] = board.edges[edgeId].vertexIds;
  const pa = board.vertices[a].port;
  return pa && pa === board.vertices[b].port ? pa : null;
}

/** How many of the canonical nine ports (four 3:1 + one per resource) are currently placed. */
export function portCount(board: Board): number {
  return coastalEdgesByAngle(board).filter((e) => portAt(board, e.id) !== null).length;
}

export const MAX_PORTS = PORT_TYPE_SEQUENCE.length;

/**
 * Add or remove a port at the given coastal edge, then re-derive every port's
 * *type* from the canonical Catan set (four 3:1 + one 2:1 per resource) by
 * clockwise position. This is the only way the editor changes ports, so the
 * board can never end up with an invalid ratio (e.g. two sheep ports, or a
 * sixth 3:1) — you're only ever choosing *where* the nine ports sit, not what
 * each one is. Adding beyond the ninth port is a no-op.
 */
export function togglePort(board: Board, edgeId: number): { edge: number; port: PortType | null }[] {
  const coastal = coastalEdgesByAngle(board);
  const active = new Set(coastal.filter((e) => portAt(board, e.id) !== null).map((e) => e.id));
  if (active.has(edgeId)) active.delete(edgeId);
  else if (active.size < MAX_PORTS) active.add(edgeId);

  const ordered = coastal.filter((e) => active.has(e.id));
  return coastal.map((e) => {
    const i = ordered.indexOf(e);
    return { edge: e.id, port: i === -1 ? null : PORT_TYPE_SEQUENCE[i] };
  });
}

/**
 * Serialize the board's current port layout as a paste-able TS array, one
 * entry per coastal edge in the same clockwise order board generation uses
 * (`coastalEdgesByAngle`). Drop the result into `board.ts` as a fixed lookup
 * to replace the generated layout for a given board layout.
 */
export function exportPortLayout(board: Board): string {
  const entries = coastalEdgesByAngle(board).map((edge) => {
    const port = portAt(board, edge.id);
    return port ? `'${port}'` : 'null';
  });
  return `[\n  ${entries.join(', ')},\n]`;
}
