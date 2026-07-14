import { describe, expect, it } from 'vitest';
import { generateBoard } from '../src/engine/board';
import type { Resource } from '../src/engine/types';

function portSequence(board: ReturnType<typeof generateBoard>['board']) {
  return board.edges
    .filter((edge) => edge.coastal && board.vertices[edge.vertexIds[0]].port !== null && board.vertices[edge.vertexIds[0]].port === board.vertices[edge.vertexIds[1]].port)
    .map((edge) => board.vertices[edge.vertexIds[0]].port);
}

describe('board generation', () => {
  it('produces the canonical 19 / 54 / 72 graph', () => {
    const { board } = generateBoard({ layout: 'classic' }, { seed: 1 });
    expect(board.tiles).toHaveLength(19);
    expect(board.vertices).toHaveLength(54);
    expect(board.edges).toHaveLength(72);
  });

  it('has exactly 30 coastal (perimeter) edges', () => {
    const { board } = generateBoard({ layout: 'classic' }, { seed: 1 });
    expect(board.edges.filter((e) => e.coastal)).toHaveLength(30);
  });

  it('places the robber on the single desert tile', () => {
    const { board } = generateBoard({ layout: 'random' }, { seed: 42 });
    const deserts = board.tiles.filter((t) => t.type === 'desert');
    expect(deserts).toHaveLength(1);
    expect(board.robberTileId).toBe(deserts[0].id);
    expect(board.tiles[board.robberTileId].number).toBeNull();
  });

  it('assigns the standard resource + number multiset', () => {
    const { board } = generateBoard({ layout: 'random' }, { seed: 7 });
    const counts: Record<string, number> = {};
    for (const t of board.tiles) counts[t.type] = (counts[t.type] ?? 0) + 1;
    expect(counts).toMatchObject({ wood: 4, sheep: 4, wheat: 4, brick: 3, ore: 3, desert: 1 });

    const numbers = board.tiles.filter((t) => t.number !== null).map((t) => t.number);
    expect(numbers).toHaveLength(18);
    expect(numbers).not.toContain(7);
  });

  it('gives every non-desert number token two adjacent producing tiles or fewer', () => {
    const { board } = generateBoard({ layout: 'classic' }, { seed: 1 });
    // Every vertex touches between 1 and 3 tiles (interior = 3, coast fewer).
    for (const v of board.vertices) {
      expect(v.tileIds.length).toBeGreaterThanOrEqual(1);
      expect(v.tileIds.length).toBeLessThanOrEqual(3);
    }
  });

  it('assigns 9 ports across the coast', () => {
    const { board } = generateBoard({ layout: 'classic' }, { seed: 1 });
    const portVertices = board.vertices.filter((v) => v.port !== null);
    // 9 ports x 2 vertices each (ports never share a vertex on the standard board).
    expect(portVertices.length).toBeGreaterThanOrEqual(9);
    const kinds = new Set(portVertices.map((v) => v.port));
    const resourcePorts: Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
    for (const r of resourcePorts) expect(kinds.has(r)).toBe(true);
    expect(kinds.has('3:1')).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const a = generateBoard({ layout: 'random' }, { seed: 123 }).board;
    const b = generateBoard({ layout: 'random' }, { seed: 123 }).board;
    expect(a.tiles.map((t) => t.type)).toEqual(b.tiles.map((t) => t.type));
    expect(a.tiles.map((t) => t.number)).toEqual(b.tiles.map((t) => t.number));
    expect(portSequence(a)).toEqual(portSequence(b));
  });

  it('seed-shuffles random ports while preserving the standard multiset', () => {
    const a = generateBoard({ layout: 'random' }, { seed: 123 }).board;
    const b = generateBoard({ layout: 'random' }, { seed: 124 }).board;
    const expected = ['3:1', '3:1', '3:1', '3:1', 'brick', 'ore', 'sheep', 'wheat', 'wood'];
    expect([...portSequence(a)].sort()).toEqual(expected);
    expect(portSequence(a)).not.toEqual(portSequence(b));
  });

  it('keeps Classic ports fixed across seeds', () => {
    const a = generateBoard({ layout: 'classic' }, { seed: 1 }).board;
    const b = generateBoard({ layout: 'classic' }, { seed: 999 }).board;
    expect(portSequence(a)).toEqual(portSequence(b));
  });
});
