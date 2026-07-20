import { LONGEST_ROAD_MIN } from './constants';
import type { GameState } from './types';

/**
 * Longest continuous road for a player: the longest trail (no edge reused) over
 * their road network, blocked from passing *through* a vertex occupied by an
 * opponent's settlement or city. The road graph is tiny (≤15 edges) so an
 * exhaustive DFS from every vertex is fast and exact.
 */
export function longestRoadLength(state: GameState, playerId: number): number {
  const adj = new Map<number, { edge: number; to: number }[]>();
  for (const [edgeIdStr, owner] of Object.entries(state.roads)) {
    if (owner !== playerId) continue;
    const edgeId = Number(edgeIdStr);
    const [a, b] = state.board.edges[edgeId].vertexIds;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ edge: edgeId, to: b });
    (adj.get(b) ?? adj.set(b, []).get(b)!).push({ edge: edgeId, to: a });
  }

  const blocked = (vertexId: number): boolean => {
    const b = state.buildings[vertexId];
    return b !== undefined && b.owner !== playerId;
  };

  let best = 0;
  const used = new Set<number>();

  const dfs = (vertex: number, arrivedByEdge: number | null): number => {
    // Cannot continue a trail *through* an opponent-occupied vertex.
    if (arrivedByEdge !== null && blocked(vertex)) return 0;
    let longest = 0;
    for (const { edge, to } of adj.get(vertex) ?? []) {
      if (used.has(edge)) continue;
      used.add(edge);
      longest = Math.max(longest, 1 + dfs(to, edge));
      used.delete(edge);
    }
    return longest;
  };

  for (const vertex of adj.keys()) {
    best = Math.max(best, dfs(vertex, null));
  }
  return best;
}

/**
 * Longest legal trail owned by `playerId` that contains `requiredEdge`.
 * Used by board hover previews to explain which continuous route a specific
 * road can contribute to. The same opponent-building blocking rule as the
 * Longest Road calculation applies.
 */
function findLongestRoadPath(state: GameState, playerId: number, requiredEdge?: number): number[] {
  if (requiredEdge !== undefined && state.roads[requiredEdge] !== playerId) return [];

  const adj = new Map<number, { edge: number; to: number }[]>();
  for (const [edgeIdStr, owner] of Object.entries(state.roads)) {
    if (owner !== playerId) continue;
    const edgeId = Number(edgeIdStr);
    const [a, b] = state.board.edges[edgeId].vertexIds;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ edge: edgeId, to: b });
    (adj.get(b) ?? adj.set(b, []).get(b)!).push({ edge: edgeId, to: a });
  }

  const blocked = (vertexId: number): boolean => {
    const building = state.buildings[vertexId];
    return building !== undefined && building.owner !== playerId;
  };

  let best: number[] = [];
  const used = new Set<number>();
  const path: number[] = [];

  const dfs = (vertex: number, arrivedByEdge: number | null, includesRequired: boolean): void => {
    if (includesRequired && path.length > best.length) best = [...path];
    if (arrivedByEdge !== null && blocked(vertex)) return;

    for (const { edge, to } of adj.get(vertex) ?? []) {
      if (used.has(edge)) continue;
      used.add(edge);
      path.push(edge);
      dfs(to, edge, includesRequired || edge === requiredEdge);
      path.pop();
      used.delete(edge);
    }
  };

  for (const vertex of adj.keys()) dfs(vertex, null, requiredEdge === undefined);
  return best;
}

/** The exact longest legal trail currently owned by a player. */
export function longestRoadPath(state: GameState, playerId: number): number[] {
  return findLongestRoadPath(state, playerId);
}

export function longestRoadPathThroughEdge(state: GameState, playerId: number, requiredEdge: number): number[] {
  return findLongestRoadPath(state, playerId, requiredEdge);
}

/**
 * Recompute the Longest Road holder after a road/settlement change. The award
 * needs a length of at least 5; it transfers only when another player strictly
 * exceeds the current holder, and a tie leaves the incumbent in place.
 */
export function updateLongestRoad(state: GameState): GameState {
  const lengths = state.players.map((_, i) => longestRoadLength(state, i));
  const maxLen = Math.max(0, ...lengths);
  const current = state.longestRoad.player;

  if (maxLen < LONGEST_ROAD_MIN) {
    return { ...state, longestRoad: { player: null, length: maxLen } };
  }

  const leaders = lengths.flatMap((len, i) => (len === maxLen ? [i] : []));
  let holder: number | null;
  if (current !== null && leaders.includes(current)) {
    holder = current; // incumbent keeps it on a tie or lead
  } else if (leaders.length === 1) {
    holder = leaders[0];
  } else {
    // Tie with no incumbent among leaders: award to no one.
    holder = current !== null && lengths[current] === maxLen ? current : null;
  }
  return { ...state, longestRoad: { player: holder, length: maxLen } };
}
