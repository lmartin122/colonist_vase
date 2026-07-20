import type { Action } from '../engine/actions';
import { COSTS } from '../engine/constants';
import { bankTradeRatio, canAfford, resourceValue } from '../engine/helpers';
import { legalCityVertices, legalRoadEdges, legalSettlementVertices } from '../engine/placement';
import type { BotDifficulty, GameState, ResourceBank } from '../engine/types';
import { RESOURCES } from '../engine/types';

function playable(state: GameState, actor: number, type: string): boolean {
  return !state.pending.playedDevThisTurn[actor] && state.players[actor].devCards.some((card) => card.type === type && !card.played && card.boughtOnTurn < state.turn);
}

/** Whether `actor` is waiting for a response to an outgoing offer. */
export function hasPendingOwnOffer(state: GameState, actor: number): boolean {
  return state.tradeOffers.some((offer) => offer.proposer === actor && Object.values(offer.responses).some((r) => r.status === 'pending'));
}

export function mainCandidates(state: GameState, actor: number): Action[] {
  const me = state.players[actor];
  if ((state.pending.freeRoads[actor] ?? 0) > 0) return legalRoadEdges(state, actor).map((edge) => ({ type: 'buildRoad', edge }));
  const actions: Action[] = [];
  if (me.stock.cities > 0 && canAfford(me.resources, COSTS.city)) for (const vertex of legalCityVertices(state, actor)) actions.push({ type: 'buildCity', vertex });
  if (me.stock.settlements > 0 && canAfford(me.resources, COSTS.settlement)) for (const vertex of legalSettlementVertices(state, actor, false)) actions.push({ type: 'buildSettlement', vertex });
  if (me.stock.roads > 0 && canAfford(me.resources, COSTS.road)) for (const edge of legalRoadEdges(state, actor)) actions.push({ type: 'buildRoad', edge });
  if (state.devDeck.length > 0 && canAfford(me.resources, COSTS.devCard)) actions.push({ type: 'buyDevCard' });
  if (playable(state, actor, 'roadBuilding') && legalRoadEdges(state, actor).length > 0) actions.push({ type: 'playRoadBuilding' });
  if (playable(state, actor, 'monopoly')) for (const resource of RESOURCES) actions.push({ type: 'playMonopoly', resource });
  if (playable(state, actor, 'yearOfPlenty')) {
    for (const first of RESOURCES) for (const second of RESOURCES) {
      const needed = first === second ? 2 : 1;
      if (state.bank[first] >= needed && state.bank[second] >= 1) actions.push({ type: 'playYearOfPlenty', resources: [first, second] });
    }
  }
  for (const give of RESOURCES) {
    const ratio = bankTradeRatio(state, actor, give);
    if (me.resources[give] < ratio) continue;
    for (const receive of RESOURCES) if (receive !== give && state.bank[receive] > 0) actions.push({ type: 'bankTrade', give, receive });
  }
  const trade = botTradeCandidate(state, actor, me.botDifficulty ?? 'medium');
  if (trade) actions.push(trade);
  if (!hasPendingOwnOffer(state, actor)) actions.push({ type: 'endTurn' });
  return actions;
}

function botTradeCandidate(state: GameState, actor: number, difficulty: BotDifficulty): Action | null {
  const me = state.players[actor];
  if (!me.isBot || !state.rules.allowPlayerTrades || state.pending.botTradeOfferedThisTurn[actor]) return null;
  const human = state.players.find((player) => !player.isBot);
  if (!human) return null;
  if (state.pending.passed[human.id]) return null;
  if (difficulty === 'easy' && ((state.rng.seed + state.turn + actor) & 3) !== 0) return null;
  const targets: { cost: Partial<ResourceBank>; available: boolean }[] = [
    { cost: COSTS.city, available: me.stock.cities > 0 && legalCityVertices(state, actor).length > 0 },
    { cost: COSTS.settlement, available: me.stock.settlements > 0 && legalSettlementVertices(state, actor, false).length > 0 },
    { cost: COSTS.devCard, available: state.devDeck.length > 0 },
    { cost: COSTS.road, available: me.stock.roads > 0 && legalRoadEdges(state, actor).length > 0 },
  ];
  for (const { cost, available } of targets) {
    if (!available) continue;
    const missingCards = RESOURCES.reduce(
      (total, resource) => total + Math.max(0, (cost[resource] ?? 0) - me.resources[resource]),
      0,
    );
    if (missingCards !== 1) continue;
    const need = RESOURCES.find((resource) => me.resources[resource] < (cost[resource] ?? 0));
    if (!need) continue;
    const give = [...RESOURCES]
      .filter((resource) => resource !== need && me.resources[resource] > (cost[resource] ?? 0))
      .sort((a, b) => resourceValue(a) - resourceValue(b))[0];
    if (give) return { type: 'createTradeOffer', give: { [give]: 1 }, receive: { [need]: 1 }, anyCount: 0, target: human.id };
  }
  return null;
}
