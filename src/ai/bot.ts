import type { Action } from '../engine/actions';
import { publicVictoryPoints, resourceValue } from '../engine/helpers';
import { legalRoadEdges, legalSettlementVertices, robberTargetTiles, stealableOpponents } from '../engine/placement';
import { reduce } from '../engine/reduce';
import type { BotDifficulty, GameState, Resource } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { mainCandidates } from './candidates';
import { deterministicNoise, evaluateState, publicCardCount, vertexScore } from './evaluation';

export function nextBotAction(state: GameState, actor: number): Action | null {
  const difficulty = state.players[actor].botDifficulty ?? 'medium';
  switch (state.phase) {
    case 'startingRoll': return { type: 'rollForStart' };
    case 'setup': return setupAction(state, difficulty);
    case 'roll': return shouldPlayKnight(state, difficulty) ? knightAction(state, difficulty) : { type: 'rollDice' };
    case 'discard': return discardAction(state, actor, difficulty);
    case 'moveRobber': return robberAction(state, difficulty);
    case 'main':
      {
        const offerDecision = resolveOwnTradeOffer(state, actor, difficulty);
        if (offerDecision) return offerDecision;
      }
      if (shouldPlayKnight(state, difficulty)) return knightAction(state, difficulty);
      return chooseMainAction(state, actor, difficulty);
    default: return null;
  }
}

function resolveOwnTradeOffer(state: GameState, actor: number, difficulty: BotDifficulty): Action | null {
  const offer = state.tradeOffers.find((item) => item.proposer === actor);
  if (!offer || Object.values(offer.responses).some((response) => response.status === 'pending')) return null;
  const accepted = Object.entries(offer.responses).filter(([, response]) => response.status === 'accepted').map(([player]) => Number(player));
  if (!accepted.length) return { type: 'cancelTradeOffer', offerId: offer.id };
  const partner = difficulty === 'easy'
    ? randomPick(state, actor, accepted, (player) => ({ type: 'completeTradeOffer', offerId: offer.id, partner: player }))
    : best(accepted, (player) => difficulty === 'hard' ? -publicVictoryPoints(state, player) - state.players[player].knightsPlayed * 0.2 : -player);
  return { type: 'completeTradeOffer', offerId: offer.id, partner };
}

function setupAction(state: GameState, difficulty: BotDifficulty): Action {
  const actor = state.currentPlayer;
  if (state.setup?.lastSettlement === null) {
    const spots = legalSettlementVertices(state, actor, true);
    if (difficulty === 'easy') return { type: 'placeSetupSettlement', vertex: randomPick(state, actor, spots, (vertex) => ({ type: 'placeSetupSettlement', vertex })) };
    return { type: 'placeSetupSettlement', vertex: best(spots, (vertex) => vertexScore(state, vertex, difficulty === 'hard')) };
  }
  const from = state.setup!.lastSettlement!;
  const edges = legalRoadEdges(state, actor, { fromVertex: from });
  return { type: 'placeSetupRoad', edge: difficulty === 'easy' ? randomPick(state, actor, edges, (edge) => ({ type: 'placeSetupRoad', edge })) : best(edges, (edge) => {
    const [a, b] = state.board.edges[edge].vertexIds;
    return vertexScore(state, a === from ? b : a, difficulty === 'hard');
  }) };
}

function discardAction(state: GameState, actor: number, difficulty: BotDifficulty): Action {
  const required = state.pending.discards[actor];
  const resources = state.players[actor].resources;
  const order = [...RESOURCES].sort((a, b) => difficulty === 'easy'
    ? deterministicNoise(state, actor, { type: 'playMonopoly', resource: a }) - deterministicNoise(state, actor, { type: 'playMonopoly', resource: b })
    : resourceValue(a) - resourceValue(b));
  const drop: Partial<Record<Resource, number>> = {};
  let remaining = required;
  for (const resource of order) {
    const count = Math.min(remaining, resources[resource]);
    if (count) drop[resource] = count;
    remaining -= count;
    if (!remaining) break;
  }
  return { type: 'discard', player: actor, resources: drop };
}

function robberAction(state: GameState, difficulty: BotDifficulty): Action {
  const { tile, victim } = robberChoice(state, difficulty);
  return { type: 'moveRobber', tile, stealFrom: victim };
}

function knightAction(state: GameState, difficulty: BotDifficulty): Action {
  const { tile, victim } = robberChoice(state, difficulty);
  return { type: 'playKnight', tile, stealFrom: victim };
}

function robberChoice(state: GameState, difficulty: BotDifficulty): { tile: number; victim: number | null } {
  const actor = state.currentPlayer;
  const tiles = robberTargetTiles(state);
  const tile = difficulty === 'easy'
    ? randomPick(state, actor, tiles, (candidate) => ({ type: 'moveRobber', tile: candidate, stealFrom: null }))
    : best(tiles, (candidate) => state.board.tiles[candidate].vertexIds.reduce((score, vertex) => {
      const building = state.buildings[vertex];
      if (!building) return score;
      return score + (building.owner === actor ? -8 : (building.type === 'city' ? 5 : 2) + (difficulty === 'hard' ? state.players[building.owner].knightsPlayed : 0));
    }, 0));
  const victims = stealableOpponents(state, tile, actor);
  return { tile, victim: victims.length ? best(victims, (player) => publicCardCount(state, player)) : null };
}

function shouldPlayKnight(state: GameState, difficulty: BotDifficulty): boolean {
  if (state.pending.playedDevThisTurn) return false;
  const me = state.players[state.currentPlayer];
  const playable = me.devCards.some((card) => card.type === 'knight' && !card.played && card.boughtOnTurn < state.turn);
  if (!playable || difficulty === 'easy') return false;
  const robberHurts = state.board.tiles[state.board.robberTileId].vertexIds.some((vertex) => state.buildings[vertex]?.owner === me.id);
  return robberHurts || (me.knightsPlayed + 1 >= 3 && me.knightsPlayed + 1 > state.largestArmy.size);
}

function chooseMainAction(state: GameState, actor: number, difficulty: BotDifficulty): Action {
  const candidates = mainCandidates(state, actor);
  if (!candidates.length) return { type: 'endTurn' };
  if (difficulty === 'hard') return hardSearch(state, actor, candidates);
  const scored = candidates.map((action) => ({ value: action, score: scoreAction(state, actor, action) }));
  if (difficulty === 'easy') {
    if (((state.rng.seed + state.turn + actor) % 3) === 0) return { type: 'endTurn' };
    return randomPick(state, actor, candidates, (action) => action);
  }
  return best(scored, (candidate) => candidate.score).value;
}

function scoreAction(state: GameState, actor: number, action: Action): number {
  if (action.type === 'createTradeOffer') return 8;
  if (action.type === 'playMonopoly') return monopolyEstimate(state, actor, action.resource) * 2.5;
  if (action.type === 'playYearOfPlenty') return 8 + action.resources.reduce((sum, resource) => sum + resourceValue(resource), 0);
  const result = reduce(state, action);
  if (!result.ok) return -Infinity;
  let score = evaluateState(result.state, actor) - evaluateState(state, actor);
  if (action.type === 'endTurn') score -= 0.2;
  if (action.type === 'buyDevCard') score += 3.5;
  if (action.type === 'playRoadBuilding') score += 6;
  return score;
}

function hardSearch(state: GameState, actor: number, roots: Action[]): Action {
  type Node = { state: GameState; first: Action; score: number; depth: number };
  let nodes = 0;
  let frontier: Node[] = [];
  let winner: Node | null = null;
  for (const action of roots) {
    const score = scoreAction(state, actor, action);
    const result = stochastic(action) ? null : reduce(state, action);
    const node = { state: result?.ok ? result.state : state, first: action, score, depth: 1 };
    frontier.push(node);
    if (!winner || node.score > winner.score) winner = node;
  }
  frontier = frontier.sort((a, b) => b.score - a.score).slice(0, 8);
  while (frontier.length && nodes < 200) {
    const next: Node[] = [];
    for (const node of frontier) {
      if (node.depth >= 3 || node.state.phase !== 'main' || node.state.currentPlayer !== actor) continue;
      for (const action of mainCandidates(node.state, actor)) {
        if (++nodes > 200) break;
        const immediate = scoreAction(node.state, actor, action);
        const result = stochastic(action) ? null : reduce(node.state, action);
        const child = { state: result?.ok ? result.state : node.state, first: node.first, score: node.score + immediate * Math.pow(0.82, node.depth), depth: node.depth + 1 };
        next.push(child);
        if (!winner || child.score > winner.score) winner = child;
      }
    }
    frontier = next.sort((a, b) => b.score - a.score).slice(0, 8);
  }
  return winner?.first ?? roots[0];
}

function stochastic(action: Action): boolean {
  return ['rollDice', 'moveRobber', 'playKnight', 'buyDevCard', 'playMonopoly', 'createTradeOffer'].includes(action.type);
}

function monopolyEstimate(state: GameState, actor: number, resource: Resource): number {
  if (!state.rules.hideBankCards) return Math.max(0, 19 - state.bank[resource] - state.players[actor].resources[resource]);
  return state.board.tiles.filter((tile) => tile.type === resource).reduce((sum, tile) => sum + (tile.number ? 6 - Math.abs(7 - tile.number) : 0), 0);
}

function randomPick<T>(state: GameState, actor: number, items: T[], action: (item: T) => Action): T {
  return best(items, (item) => deterministicNoise(state, actor, action(item)));
}

function best<T>(items: T[], score: (item: T) => number): T {
  let selected = items[0];
  let selectedScore = -Infinity;
  for (const item of items) {
    const value = score(item);
    if (value > selectedScore) { selected = item; selectedScore = value; }
  }
  return selected;
}
