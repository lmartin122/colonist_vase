import type { Action } from '../engine/actions';
import { canAfford, publicVictoryPoints, resourceValue } from '../engine/helpers';
import { isConcurrentPhase } from '../engine/modes';
import { legalRoadEdges, legalSettlementVertices, robberTargetTiles, stealableOpponents } from '../engine/placement';
import { reduce } from '../engine/reduce';
import type { BotDifficulty, GameState, Resource } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { hasPendingOwnOffer, mainCandidates } from './candidates';
import { deterministicNoise, evaluateState, publicCardCount, vertexScore } from './evaluation';

export function nextBotAction(state: GameState, actor: number): Action | null {
  const difficulty = state.players[actor].botDifficulty ?? 'medium';
  switch (state.phase) {
    case 'startingRoll': return { type: 'rollForStart' };
    case 'setup': return setupAction(state, actor, difficulty);
    case 'roll': return shouldPlayKnight(state, actor, difficulty) ? knightAction(state, actor, difficulty) : { type: 'rollDice' };
    case 'discard': return discardAction(state, actor, difficulty);
    case 'moveRobber': return robberAction(state, actor, difficulty);
    case 'main':
    case 'rushRound':
      {
        const offerDecision = resolveOwnTradeOffer(state, actor, difficulty);
        if (offerDecision) return withActor(state, actor, offerDecision);
      }
      if (shouldPlayKnight(state, actor, difficulty)) return withActor(state, actor, knightAction(state, actor, difficulty));
      {
        const decision = chooseMainAction(state, actor, difficulty);
        return decision ? withActor(state, actor, decision) : null;
      }
    default: return null;
  }
}

/** Add the actor required by concurrent phases and translate turn completion. */
function withActor(state: GameState, actor: number, action: Action): Action {
  if (!isConcurrentPhase(state)) return action;
  if (action.type === 'endTurn') return { type: 'passRound', player: actor };
  return { ...action, player: actor } as Action;
}

function resolveOwnTradeOffer(state: GameState, actor: number, difficulty: BotDifficulty): Action | null {
  const offer = state.tradeOffers.find((item) => item.proposer === actor);
  if (!offer) return null;
  if (!canAfford(state.players[actor].resources, offer.give)) return { type: 'cancelTradeOffer', offerId: offer.id };
  if (Object.values(offer.responses).some((response) => response.status === 'pending')) return null;
  const accepted = Object.entries(offer.responses).filter(([, response]) => response.status === 'accepted').map(([player]) => Number(player));
  if (!accepted.length) {
    // Preserve the rejected result through its Rush round, then remove it.
    if (isConcurrentPhase(state) && offer.createdTurn === state.turn) return null;
    return { type: 'cancelTradeOffer', offerId: offer.id };
  }
  // Accepted resources are not reserved and may have been spent meanwhile.
  const viable = accepted.filter((partner) => reduce(state, withActor(state, actor, {
    type: 'completeTradeOffer',
    offerId: offer.id,
    partner,
  })).ok);
  if (!viable.length) return { type: 'cancelTradeOffer', offerId: offer.id };
  const partner = difficulty === 'easy'
    ? randomPick(state, actor, viable, (player) => ({ type: 'completeTradeOffer', offerId: offer.id, partner: player }))
    : best(viable, (player) => -publicVictoryPoints(state, player) - (difficulty === 'hard' ? state.players[player].knightsPlayed * 0.2 : 0));
  return { type: 'completeTradeOffer', offerId: offer.id, partner };
}

function setupAction(state: GameState, actor: number, difficulty: BotDifficulty): Action {
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

function robberAction(state: GameState, actor: number, difficulty: BotDifficulty): Action {
  const { tile, victim } = robberChoice(state, actor, difficulty);
  return { type: 'moveRobber', tile, stealFrom: victim, player: actor };
}

function knightAction(state: GameState, actor: number, difficulty: BotDifficulty): Action {
  const { tile, victim } = robberChoice(state, actor, difficulty);
  return { type: 'playKnight', tile, stealFrom: victim };
}

function robberChoice(state: GameState, actor: number, difficulty: BotDifficulty): { tile: number; victim: number | null } {
  const tiles = robberTargetTiles(state, actor);
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

/** Whether a bot can act instead of waiting for its trade response. */
export function botHasMoveAvailable(state: GameState, actor: number): boolean {
  if (!hasPendingOwnOffer(state, actor)) return true;
  const pendingOffer = state.tradeOffers.find((offer) => offer.proposer === actor
    && Object.values(offer.responses).some((response) => response.status === 'pending'));
  if (pendingOffer && !canAfford(state.players[actor].resources, pendingOffer.give)) return true;
  const difficulty = state.players[actor].botDifficulty ?? 'medium';
  return shouldPlayKnight(state, actor, difficulty) || mainCandidates(state, actor).length > 0;
}

function shouldPlayKnight(state: GameState, actor: number, difficulty: BotDifficulty): boolean {
  if (state.pending.playedDevThisTurn[actor]) return false;
  const me = state.players[actor];
  const playable = me.devCards.some((card) => card.type === 'knight' && !card.played && card.boughtOnTurn < state.turn);
  if (!playable || difficulty === 'easy') return false;
  const robberHurts = state.board.tiles[state.board.robberTileId].vertexIds.some((vertex) => state.buildings[vertex]?.owner === me.id);
  return robberHurts || (me.knightsPlayed + 1 >= 3 && me.knightsPlayed + 1 > state.largestArmy.size);
}

function chooseMainAction(state: GameState, actor: number, difficulty: BotDifficulty): Action | null {
  const candidates = mainCandidates(state, actor);
  if (!candidates.length) return null;
  if (difficulty === 'hard') return hardSearch(state, actor, candidates);
  const scored = candidates.map((action) => ({ value: action, score: scoreAction(state, actor, action) }));
  if (difficulty === 'easy') {
    if (!hasPendingOwnOffer(state, actor) && ((state.rng.seed + state.turn + actor) % 3) === 0) return { type: 'endTurn' };
    return randomPick(state, actor, candidates, (action) => action);
  }
  return best(scored, (candidate) => candidate.score).value;
}

function scoreAction(state: GameState, actor: number, action: Action): number {
  if (action.type === 'createTradeOffer') return 8;
  if (action.type === 'playMonopoly') return monopolyEstimate(state, actor, action.resource) * 2.5;
  if (action.type === 'playYearOfPlenty') return 8 + action.resources.reduce((sum, resource) => sum + resourceValue(resource), 0);
  const result = reduce(state, withActor(state, actor, action));
  if (!result.ok) return -Infinity;
  let score = evaluateState(result.state, actor) - evaluateState(state, actor);
  if (action.type === 'endTurn') score -= 0.2;
  // A single road often creates no immediately legal settlement, so the
  // one-step policy needs a small expansion credit to avoid permanent stalls.
  if (action.type === 'buildRoad') score += 2.25;
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
    const result = stochastic(action) ? null : reduce(state, withActor(state, actor, action));
    const node = { state: result?.ok ? result.state : state, first: action, score, depth: 1 };
    frontier.push(node);
    if (!winner || node.score > winner.score) winner = node;
  }
  frontier = frontier.sort((a, b) => b.score - a.score).slice(0, 8);
  while (frontier.length && nodes < 200) {
    const next: Node[] = [];
    for (const node of frontier) {
      const stillActing = isConcurrentPhase(node.state)
        ? !node.state.pending.passed[actor]
        : node.state.phase === 'main' && node.state.currentPlayer === actor;
      if (node.depth >= 3 || !stillActing) continue;
      for (const action of mainCandidates(node.state, actor)) {
        if (++nodes > 200) break;
        const immediate = scoreAction(node.state, actor, action);
        const result = stochastic(action) ? null : reduce(node.state, withActor(node.state, actor, action));
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
