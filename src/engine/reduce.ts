import type { Action, ReduceResult } from './actions';
import {
  COSTS,
  LARGEST_ARMY_MIN,
} from './constants';
import { rollDie, nextInt } from './rng';
import { updateLongestRoad } from './longestRoad';
import {
  addResources,
  botAcceptsTrade,
  bankTradeRatio,
  canAfford,
  subtractResources,
  totalResources,
  victoryPoints,
} from './helpers';
import { connectedByRoad, legalRoadEdges, roadConnects, settlementSpotOpen } from './placement';
import type { DevCardType, GameState, Player, Resource, ResourceBank, TradeOfferResponse } from './types';
import { RESOURCES } from './types';

/**
 * The single entry point for mutating a game. Pure: returns either a brand-new
 * GameState or a rejection reason, never mutating the input. All randomness is
 * drawn from state.rng, so identical (state, action) sequences reproduce exactly.
 */
export function reduce(state: GameState, action: Action): ReduceResult {
  try {
    return { ok: true, state: apply(state, action) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Convenience for callers that trust the action (e.g. AI); throws on error. */
export function applyOrThrow(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) throw new Error(`Illegal action ${action.type}: ${result.error}`);
  return result.state;
}

function fail(message: string): never {
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function apply(state: GameState, action: Action): GameState {
  if (state.phase === 'gameOver') fail('Game is over');

  switch (action.type) {
    case 'rollForStart':
      return rollForStart(state);
    case 'placeSetupSettlement':
      return placeSetupSettlement(state, action.vertex);
    case 'placeSetupRoad':
      return placeSetupRoad(state, action.edge);
    case 'rollDice':
      return rollDice(state);
    case 'discard':
      return discard(state, action.player, action.resources);
    case 'moveRobber':
      return moveRobber(state, action.tile, action.stealFrom);
    case 'buildRoad':
      return buildRoad(state, action.edge);
    case 'buildSettlement':
      return buildSettlement(state, action.vertex);
    case 'buildCity':
      return buildCity(state, action.vertex);
    case 'buyDevCard':
      return buyDevCard(state);
    case 'playKnight':
      return playKnight(state, action.tile, action.stealFrom);
    case 'playRoadBuilding':
      return playRoadBuilding(state);
    case 'playMonopoly':
      return playMonopoly(state, action.resource);
    case 'playYearOfPlenty':
      return playYearOfPlenty(state, action.resources);
    case 'bankTrade':
      return bankTrade(state, action.give, action.receive);
    case 'playerTrade':
      return playerTrade(state, action.partner, action.give, action.receive);
    case 'createTradeOffer':
      return createTradeOffer(state, action.give, action.receive, action.anyCount);
    case 'completeTradeOffer':
      return completeTradeOffer(state, action.offerId, action.partner);
    case 'cancelTradeOffer':
      return cancelTradeOffer(state, action.offerId);
    case 'debugAddResources':
      return debugAddResources(state, action.player, action.resources);
    case 'debugGrantDevCard':
      return debugGrantDevCard(state, action.player, action.card);
    case 'debugTriggerRobber':
      return debugTriggerRobber(state);
    case 'endTurn':
      return endTurn(state);
  }
}

// ---------------------------------------------------------------------------
// Starting order roll
// ---------------------------------------------------------------------------

function rollForStart(state: GameState): GameState {
  if (state.phase !== 'startingRoll' || !state.startingRoll) fail('Not rolling for starting order');
  const actor = state.currentPlayer;
  if (!state.startingRoll.contenders.includes(actor)) fail('Player is not in the current roll-off');
  if (state.startingRoll.rolls[actor]) fail('Player already rolled in this round');

  const d1 = rollDie(state.rng);
  const d2 = rollDie(d1.rng);
  const dice: [number, number] = [d1.value, d2.value];
  const rolls = { ...state.startingRoll.rolls, [actor]: dice };
  let next = log(
    { ...state, rng: d2.rng, dice, startingRoll: { ...state.startingRoll, rolls } },
    `${playerName(state, actor)} rolled ${dice[0] + dice[1]} for starting order`,
    actor,
  );

  const waiting = state.startingRoll.contenders.filter((id) => !rolls[id]);
  if (waiting.length > 0) return { ...next, currentPlayer: waiting[0] };

  const best = Math.max(...state.startingRoll.contenders.map((id) => {
    const roll = rolls[id]!;
    return roll[0] + roll[1];
  }));
  const leaders = state.startingRoll.contenders.filter((id) => {
    const roll = rolls[id]!;
    return roll[0] + roll[1] === best;
  });

  if (leaders.length > 1) {
    next = {
      ...next,
      currentPlayer: leaders[0],
      dice: null,
      startingRoll: { contenders: leaders, rolls: {} },
    };
    return log(next, `Tie for first between ${leaders.map((id) => playerName(next, id)).join(', ')}. Roll again!`, null);
  }

  const first = leaders[0];
  const forward = Array.from({ length: state.players.length }, (_, offset) => (first + offset) % state.players.length);
  const order = [...forward, ...forward.slice().reverse()];
  next = {
    ...next,
    currentPlayer: first,
    turnOrder: forward,
    phase: 'setup',
    dice: null,
    startingRoll: null,
    setup: { order, step: 0, lastSettlement: null },
  };
  return log(next, `${playerName(next, first)} won the roll and places first!`, first);
}

// ---------------------------------------------------------------------------
// Immutable update helpers
// ---------------------------------------------------------------------------

function withPlayer(state: GameState, id: number, fn: (p: Player) => Player): GameState {
  const players = state.players.slice();
  players[id] = fn(players[id]);
  return { ...state, players };
}

function log(state: GameState, message: string, player: number | null = state.currentPlayer): GameState {
  return { ...state, log: [...state.log, { turn: state.turn, player, message }] };
}

function playerName(state: GameState, id: number): string {
  return state.players[id].name;
}

// ---------------------------------------------------------------------------
// Setup phase
// ---------------------------------------------------------------------------

function placeSetupSettlement(state: GameState, vertex: number): GameState {
  if (state.phase !== 'setup' || !state.setup) fail('Not in setup phase');
  if (state.setup.lastSettlement !== null) fail('Place your road before another settlement');
  if (!settlementSpotOpen(state, vertex)) fail('Spot is occupied or too close to another building');

  const player = state.currentPlayer;
  let next = withPlayer(state, player, (p) => ({
    ...p,
    stock: { ...p.stock, settlements: p.stock.settlements - 1 },
  }));
  next = {
    ...next,
    buildings: { ...next.buildings, [vertex]: { type: 'settlement', owner: player } },
    setup: { ...state.setup, lastSettlement: vertex },
  };
  return log(next, `${playerName(next, player)} placed a settlement`);
}

function placeSetupRoad(state: GameState, edge: number): GameState {
  if (state.phase !== 'setup' || !state.setup) fail('Not in setup phase');
  const settlement = state.setup.lastSettlement;
  if (settlement === null) fail('Place a settlement first');
  if (state.roads[edge] !== undefined) fail('Edge already has a road');
  if (!state.board.edges[edge].vertexIds.includes(settlement)) {
    fail('Setup road must touch the settlement you just placed');
  }

  const player = state.currentPlayer;
  const isSecondRound = state.setup.step >= state.players.length;

  let next = withPlayer(state, player, (p) => ({
    ...p,
    stock: { ...p.stock, roads: p.stock.roads - 1 },
  }));
  next = { ...next, roads: { ...next.roads, [edge]: player } };

  // The second settlement grants its adjacent resources.
  if (isSecondRound) {
    next = grantSetupResources(next, player, settlement);
  }

  next = { ...next, setup: { ...state.setup, lastSettlement: null, step: state.setup.step + 1 } };
  next = log(next, `${playerName(next, player)} placed a road`);
  return advanceSetup(next);
}

function grantSetupResources(state: GameState, player: number, vertex: number): GameState {
  let next = state;
  const bank = { ...next.bank };
  const gains: ResourceBank = { ...next.players[player].resources };
  for (const tileId of state.board.vertices[vertex].tileIds) {
    const tile = state.board.tiles[tileId];
    if (tile.type === 'desert') continue;
    if (bank[tile.type] > 0) {
      bank[tile.type] -= 1;
      gains[tile.type] += 1;
    }
  }
  next = withPlayer(next, player, (p) => ({ ...p, resources: gains }));
  return { ...next, bank };
}

function advanceSetup(state: GameState): GameState {
  if (!state.setup) return state;
  const { order, step } = state.setup;
  if (step >= order.length) {
    // Setup complete → first player's turn.
    return {
      ...state,
      setup: null,
      phase: 'roll',
      currentPlayer: order[0],
      turn: 1,
      pending: { ...state.pending, hasRolled: false },
      log: [...state.log, { turn: 1, player: order[0], message: 'Setup complete. Roll to begin!' }],
    };
  }
  return { ...state, currentPlayer: order[step] };
}

// ---------------------------------------------------------------------------
// Rolling & production
// ---------------------------------------------------------------------------

function rollDice(state: GameState): GameState {
  if (state.phase !== 'roll') fail('Not time to roll');
  const d1 = rollDie(state.rng);
  const d2 = rollDie(d1.rng);
  const dice: [number, number] = [d1.value, d2.value];
  const sum = d1.value + d2.value;

  let next: GameState = { ...state, rng: d2.rng, dice, pending: { ...state.pending, hasRolled: true } };
  next = log(next, `${playerName(next, state.currentPlayer)} rolled ${sum}`);

  if (sum === 7) {
    return beginRobber(next);
  }
  return { ...produceResources(next, sum), phase: 'main' };
}

function beginRobber(state: GameState): GameState {
  const discards: Record<number, number> = {};
  state.players.forEach((p) => {
    const total = totalResources(p.resources);
    if (total > state.rules.discardLimit) discards[p.id] = Math.floor(total / 2);
  });
  if (Object.keys(discards).length > 0) {
    return { ...state, phase: 'discard', pending: { ...state.pending, discards } };
  }
  return { ...state, phase: 'moveRobber' };
}

/** Distribute resources for a rolled number, honoring the robber and bank limits. */
function produceResources(state: GameState, roll: number): GameState {
  // Tally what each player is owed per resource.
  const owed: ResourceBank[] = state.players.map(() => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }));
  for (const tile of state.board.tiles) {
    if (tile.number !== roll || tile.id === state.board.robberTileId || tile.type === 'desert') continue;
    for (const vid of tile.vertexIds) {
      const building = state.buildings[vid];
      if (!building) continue;
      owed[building.owner][tile.type as Resource] += building.type === 'city' ? 2 : 1;
    }
  }

  const bank = { ...state.bank };
  const players = state.players.map((p) => ({ ...p, resources: { ...p.resources } }));
  for (const r of RESOURCES) {
    const claimants = owed.filter((o) => o[r] > 0).length;
    const demand = owed.reduce((sum, o) => sum + o[r], 0);
    if (demand === 0) continue;
    if (demand > bank[r] && claimants > 1) continue; // not enough for everyone → no one
    for (let i = 0; i < players.length; i++) {
      const give = Math.min(owed[i][r], bank[r]);
      players[i].resources[r] += give;
      bank[r] -= give;
    }
  }
  return { ...state, players, bank };
}

// ---------------------------------------------------------------------------
// Discard / robber
// ---------------------------------------------------------------------------

function discard(state: GameState, player: number, resources: Partial<Record<Resource, number>>): GameState {
  if (state.phase !== 'discard') fail('No discards required now');
  const required = state.pending.discards[player];
  if (required === undefined) fail('This player does not need to discard');
  const count = RESOURCES.reduce((sum, r) => sum + (resources[r] ?? 0), 0);
  if (count !== required) fail(`Must discard exactly ${required}`);
  if (!canAfford(state.players[player].resources, resources)) fail('Cannot discard resources you do not have');

  let next = withPlayer(state, player, (p) => ({ ...p, resources: subtractResources(p.resources, resources) }));
  next = { ...next, bank: addResources(next.bank, resources) };
  const discards = { ...next.pending.discards };
  delete discards[player];
  next = { ...next, pending: { ...next.pending, discards } };
  next = log(next, `${playerName(next, player)} discarded ${count}`, player);

  if (Object.keys(discards).length === 0) {
    return { ...next, phase: 'moveRobber' };
  }
  return next;
}

function moveRobber(state: GameState, tile: number, stealFrom: number | null): GameState {
  if (state.phase !== 'moveRobber') fail('Not time to move the robber');
  return applyRobber(state, tile, stealFrom, 'main');
}

/** Shared robber logic used by a rolled 7 and by the Knight card. */
function applyRobber(
  state: GameState,
  tile: number,
  stealFrom: number | null,
  nextPhase: GameState['phase'],
): GameState {
  if (tile === state.board.robberTileId) fail('Robber must move to a different tile');
  const actor = state.currentPlayer;

  const occupants = new Set<number>();
  for (const vid of state.board.tiles[tile].vertexIds) {
    const b = state.buildings[vid];
    if (
      b && b.owner !== actor &&
      (!state.rules.friendlyRobber || victoryPoints(state, b.owner) >= 3) &&
      totalResources(state.players[b.owner].resources) > 0
    ) {
      occupants.add(b.owner);
    }
  }

  let next: GameState = { ...state, board: { ...state.board, robberTileId: tile } };

  if (stealFrom !== null) {
    if (!occupants.has(stealFrom)) fail('Cannot steal from that player');
    next = stealRandom(next, actor, stealFrom);
  } else if (occupants.size > 0) {
    fail('Must steal from an adjacent player');
  }
  next = log(next, `${playerName(next, actor)} moved the robber`);
  return { ...next, phase: nextPhase };
}

function stealRandom(state: GameState, thief: number, victim: number): GameState {
  const pool: Resource[] = [];
  for (const r of RESOURCES) for (let i = 0; i < state.players[victim].resources[r]; i++) pool.push(r);
  if (pool.length === 0) return state;
  const pick = nextInt(state.rng, 0, pool.length - 1);
  const resource = pool[pick.value];
  let next: GameState = { ...state, rng: pick.rng };
  next = withPlayer(next, victim, (p) => ({ ...p, resources: { ...p.resources, [resource]: p.resources[resource] - 1 } }));
  next = withPlayer(next, thief, (p) => ({ ...p, resources: { ...p.resources, [resource]: p.resources[resource] + 1 } }));
  return log(next, `${playerName(next, thief)} stole from ${playerName(next, victim)}`);
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

function requireMain(state: GameState): void {
  if (state.phase !== 'main') fail('You must roll first');
}

function spend(state: GameState, player: number, cost: Partial<ResourceBank>): GameState {
  if (!canAfford(state.players[player].resources, cost)) fail('Not enough resources');
  let next = withPlayer(state, player, (p) => ({ ...p, resources: subtractResources(p.resources, cost) }));
  next = { ...next, bank: addResources(next.bank, cost) };
  return next;
}

function buildRoad(state: GameState, edge: number): GameState {
  // Road Building grants free roads; otherwise pay wood + brick.
  if (state.pending.freeRoads > 0) {
    if (state.phase !== 'roll' && state.phase !== 'main') fail('Cannot place a free road now');
    const placed = placeRoad(state, edge);
    return { ...placed, pending: { ...placed.pending, freeRoads: placed.pending.freeRoads - 1 } };
  }
  requireMain(state);
  return placeRoad(spend(state, state.currentPlayer, COSTS.road), edge);
}

/** Place a road (payment handled by caller — free during road-building card). */
function placeRoad(state: GameState, edge: number): GameState {
  const player = state.currentPlayer;
  if (state.roads[edge] !== undefined) fail('Edge already has a road');
  if (state.players[player].stock.roads <= 0) fail('No roads left');
  if (!roadConnects(state, player, edge)) fail('Road must connect to your network');

  let next = withPlayer(state, player, (p) => ({ ...p, stock: { ...p.stock, roads: p.stock.roads - 1 } }));
  next = { ...next, roads: { ...next.roads, [edge]: player } };
  next = updateLongestRoad(next);
  next = log(next, `${playerName(next, player)} built a road`);
  return checkWin(next);
}

function buildSettlement(state: GameState, vertex: number): GameState {
  requireMain(state);
  const player = state.currentPlayer;
  if (state.players[player].stock.settlements <= 0) fail('No settlements left');
  if (!settlementSpotOpen(state, vertex)) fail('Spot is occupied or too close to another building');
  if (!connectedByRoad(state, player, vertex)) fail('Settlement must connect to your road');

  let next = spend(state, player, COSTS.settlement);
  next = withPlayer(next, player, (p) => ({ ...p, stock: { ...p.stock, settlements: p.stock.settlements - 1 } }));
  next = { ...next, buildings: { ...next.buildings, [vertex]: { type: 'settlement', owner: player } } };
  // A new settlement can cut an opponent's road.
  next = updateLongestRoad(next);
  next = log(next, `${playerName(next, player)} built a settlement`);
  return checkWin(next);
}

function buildCity(state: GameState, vertex: number): GameState {
  requireMain(state);
  const player = state.currentPlayer;
  const building = state.buildings[vertex];
  if (!building || building.owner !== player || building.type !== 'settlement') {
    fail('You can only upgrade your own settlement');
  }
  if (state.players[player].stock.cities <= 0) fail('No cities left');

  let next = spend(state, player, COSTS.city);
  next = withPlayer(next, player, (p) => ({
    ...p,
    stock: { ...p.stock, cities: p.stock.cities - 1, settlements: p.stock.settlements + 1 },
  }));
  next = { ...next, buildings: { ...next.buildings, [vertex]: { type: 'city', owner: player } } };
  next = log(next, `${playerName(next, player)} built a city`);
  return checkWin(next);
}

// ---------------------------------------------------------------------------
// Development cards
// ---------------------------------------------------------------------------

function buyDevCard(state: GameState): GameState {
  requireMain(state);
  const player = state.currentPlayer;
  if (state.devDeck.length === 0) fail('Development deck is empty');
  let next = spend(state, player, COSTS.devCard);
  const [card, ...rest] = next.devDeck;
  next = { ...next, devDeck: rest };
  next = withPlayer(next, player, (p) => ({
    ...p,
    devCards: [...p.devCards, { type: card, boughtOnTurn: next.turn, played: false }],
  }));
  next = log(next, `${playerName(next, player)} bought a development card`);
  return checkWin(next);
}

/** Find a playable dev card of a type (bought on an earlier turn, unplayed). */
function takeDevCard(state: GameState, type: string): GameState {
  if (state.phase !== 'roll' && state.phase !== 'main') fail('Cannot play a card now');
  if (state.pending.playedDevThisTurn) fail('Only one development card per turn');
  const player = state.players[state.currentPlayer];
  const idx = player.devCards.findIndex(
    (c) => c.type === type && !c.played && c.boughtOnTurn < state.turn,
  );
  if (idx === -1) fail('No playable card of that type');
  return withPlayer(state, state.currentPlayer, (p) => {
    const devCards = p.devCards.slice();
    devCards[idx] = { ...devCards[idx], played: true };
    return { ...p, devCards };
  });
}

function markDevPlayed(state: GameState): GameState {
  return { ...state, pending: { ...state.pending, playedDevThisTurn: true } };
}

function playKnight(state: GameState, tile: number, stealFrom: number | null): GameState {
  let next = takeDevCard(state, 'knight');
  next = markDevPlayed(next);
  next = withPlayer(next, next.currentPlayer, (p) => ({ ...p, knightsPlayed: p.knightsPlayed + 1 }));
  next = updateLargestArmy(next);
  // Knight keeps the current phase (may be played before rolling).
  next = applyRobber(next, tile, stealFrom, next.phase);
  return checkWin(next);
}

function playRoadBuilding(state: GameState): GameState {
  let next = takeDevCard(state, 'roadBuilding');
  next = markDevPlayed(next);
  // Grant up to two free roads (capped by remaining stock); placed via buildRoad.
  const free = Math.min(2, next.players[next.currentPlayer].stock.roads);
  next = { ...next, pending: { ...next.pending, freeRoads: free } };
  return log(next, `${playerName(next, next.currentPlayer)} played Road Building`);
}

function playMonopoly(state: GameState, resource: Resource): GameState {
  let next = takeDevCard(state, 'monopoly');
  next = markDevPlayed(next);
  const player = next.currentPlayer;
  let taken = 0;
  const players = next.players.map((p) => {
    if (p.id === player) return p;
    taken += p.resources[resource];
    return { ...p, resources: { ...p.resources, [resource]: 0 } };
  });
  next = { ...next, players };
  next = withPlayer(next, player, (p) => ({ ...p, resources: { ...p.resources, [resource]: p.resources[resource] + taken } }));
  return log(next, `${playerName(next, player)} monopolised ${resource} (+${taken})`);
}

function playYearOfPlenty(state: GameState, resources: Resource[]): GameState {
  if (resources.length !== 2) fail('Year of Plenty takes exactly two resources');
  let next = takeDevCard(state, 'yearOfPlenty');
  next = markDevPlayed(next);
  const bank = { ...next.bank };
  for (const r of resources) {
    if (bank[r] <= 0) fail(`Bank has no ${r}`);
    bank[r] -= 1;
  }
  next = { ...next, bank };
  next = withPlayer(next, next.currentPlayer, (p) => {
    const res = { ...p.resources };
    for (const r of resources) res[r] += 1;
    return { ...p, resources: res };
  });
  return log(next, `${playerName(next, next.currentPlayer)} played Year of Plenty`);
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

function bankTrade(state: GameState, give: Resource, receive: Resource): GameState {
  requireMain(state);
  const player = state.currentPlayer;
  const ratio = bankTradeRatio(state, player, give);
  if (state.players[player].resources[give] < ratio) fail(`Need ${ratio} ${give} to trade`);
  if (state.bank[receive] <= 0) fail(`Bank has no ${receive}`);

  let next = withPlayer(state, player, (p) => ({
    ...p,
    resources: { ...p.resources, [give]: p.resources[give] - ratio, [receive]: p.resources[receive] + 1 },
  }));
  next = { ...next, bank: { ...next.bank, [give]: next.bank[give] + ratio, [receive]: next.bank[receive] - 1 } };
  return log(next, `${playerName(next, player)} traded ${ratio} ${give} → 1 ${receive}`);
}

function playerTrade(
  state: GameState,
  partner: number,
  give: Partial<Record<Resource, number>>,
  receive: Partial<Record<Resource, number>>,
): GameState {
  if (!state.rules.allowPlayerTrades) fail('Player trading is disabled');
  requireMain(state);
  const player = state.currentPlayer;
  if (partner === player) fail('Cannot trade with yourself');
  if (!canAfford(state.players[player].resources, give)) fail('You lack the offered resources');
  if (!canAfford(state.players[partner].resources, receive)) fail('Partner lacks the requested resources');

  let next = withPlayer(state, player, (p) => ({
    ...p,
    resources: addResources(subtractResources(p.resources, give), receive),
  }));
  next = withPlayer(next, partner, (p) => ({
    ...p,
    resources: addResources(subtractResources(p.resources, receive), give),
  }));
  return log(next, `${playerName(next, player)} traded with ${playerName(next, partner)}`);
}

function createTradeOffer(
  state: GameState,
  give: Partial<Record<Resource, number>>,
  receive: Partial<Record<Resource, number>>,
  anyCount: number,
): GameState {
  if (!state.rules.allowPlayerTrades) fail('Player trading is disabled');
  requireMain(state);
  const proposer = state.currentPlayer;
  if (!canAfford(state.players[proposer].resources, give)) fail('You lack the offered resources');
  const offered = RESOURCES.reduce((sum, resource) => sum + (give[resource] ?? 0), 0);
  const requested = RESOURCES.reduce((sum, resource) => sum + (receive[resource] ?? 0), 0);
  if (offered <= 0 || requested + anyCount <= 0 || !Number.isInteger(anyCount) || anyCount < 0) fail('Trade offer must include cards on both sides');

  const responses: Record<number, TradeOfferResponse> = {};
  for (const player of state.players) {
    if (player.id === proposer) continue;
    const wildcardResource = anyCount > 0
      ? RESOURCES.find((resource) => botAcceptsTrade(state, player.id, give, { ...receive, [resource]: (receive[resource] ?? 0) + anyCount })) ?? null
      : null;
    responses[player.id] = {
      accepted: anyCount > 0 ? wildcardResource !== null : botAcceptsTrade(state, player.id, give, receive),
      wildcardResource,
    };
  }
  const offer = { id: state.nextTradeOfferId, proposer, give, receive, anyCount, responses };
  return log({ ...state, tradeOffers: [...state.tradeOffers, offer], nextTradeOfferId: state.nextTradeOfferId + 1 }, `${playerName(state, proposer)} proposed a trade`);
}

function completeTradeOffer(state: GameState, offerId: number, partner: number): GameState {
  requireMain(state);
  const offer = state.tradeOffers.find((item) => item.id === offerId);
  if (!offer) fail('Trade offer no longer exists');
  if (offer.proposer !== state.currentPlayer) fail('Only the current proposer can choose a trade partner');
  const response = offer.responses[partner];
  if (!response?.accepted) fail('That player did not accept this offer');
  const receive = { ...offer.receive };
  if (offer.anyCount > 0 && response.wildcardResource) receive[response.wildcardResource] = (receive[response.wildcardResource] ?? 0) + offer.anyCount;
  if (!canAfford(state.players[offer.proposer].resources, offer.give)) fail('You no longer have the offered resources');
  if (!canAfford(state.players[partner].resources, receive)) fail('That player no longer has the requested resources');

  let next = withPlayer(state, offer.proposer, (p) => ({ ...p, resources: addResources(subtractResources(p.resources, offer.give), receive) }));
  next = withPlayer(next, partner, (p) => ({ ...p, resources: addResources(subtractResources(p.resources, receive), offer.give) }));
  next = { ...next, tradeOffers: next.tradeOffers.filter((item) => item.id !== offerId) };
  return log(next, `${playerName(next, offer.proposer)} traded with ${playerName(next, partner)}`);
}

function cancelTradeOffer(state: GameState, offerId: number): GameState {
  requireMain(state);
  const offer = state.tradeOffers.find((item) => item.id === offerId);
  if (!offer) fail('Trade offer no longer exists');
  if (offer.proposer !== state.currentPlayer) fail('Only the current proposer can cancel this offer');
  return log({ ...state, tradeOffers: state.tradeOffers.filter((item) => item.id !== offerId) }, `${playerName(state, offer.proposer)} cancelled a trade offer`);
}

// ---------------------------------------------------------------------------
// Turn flow, army, win
// ---------------------------------------------------------------------------

function updateLargestArmy(state: GameState): GameState {
  const player = state.currentPlayer;
  const knights = state.players[player].knightsPlayed;
  if (knights < LARGEST_ARMY_MIN) return state;
  if (knights > state.largestArmy.size) {
    return { ...state, largestArmy: { player, size: knights } };
  }
  return state;
}

function checkWin(state: GameState): GameState {
  const player = state.currentPlayer;
  if (victoryPoints(state, player) >= state.rules.victoryPoints) {
    return log({ ...state, phase: 'gameOver', winner: player }, `${playerName(state, player)} wins!`);
  }
  return state;
}

/** Developer-only helpers, intentionally routed through the pure reducer. */
function debugAddResources(state: GameState, player: number, resources: Partial<Record<Resource, number>>): GameState {
  if (!state.players[player]) fail('Unknown player');
  const added = RESOURCES.reduce((sum, resource) => sum + (resources[resource] ?? 0), 0);
  if (!Number.isInteger(added) || added <= 0 || RESOURCES.some((resource) => (resources[resource] ?? 0) < 0)) {
    fail('Debug resources must be positive whole cards');
  }
  const next = withPlayer(state, player, (p) => ({ ...p, resources: addResources(p.resources, resources) }));
  return log(next, `Debug: gave ${added} resource card${added === 1 ? '' : 's'} to ${playerName(next, player)}`, player);
}

function debugGrantDevCard(state: GameState, player: number, card: DevCardType): GameState {
  if (!state.players[player]) fail('Unknown player');
  const next = withPlayer(state, player, (p) => ({
    ...p,
    devCards: [...p.devCards, { type: card, boughtOnTurn: state.turn - 1, played: false }],
  }));
  return log(next, `Debug: gave ${playerName(next, player)} a ${card} progress card`, player);
}

function debugTriggerRobber(state: GameState): GameState {
  if (state.phase !== 'roll' && state.phase !== 'main') fail('Robber can only be triggered during a turn');
  return log({ ...state, phase: 'moveRobber', pending: { ...state.pending, discards: {} } }, 'Debug: robber placement started');
}

function endTurn(state: GameState): GameState {
  if (state.phase !== 'main') fail('Cannot end turn now');
  if (state.pending.freeRoads > 0 && legalRoadEdges(state, state.currentPlayer).length > 0) {
    fail(`Place ${state.pending.freeRoads} remaining free road${state.pending.freeRoads === 1 ? '' : 's'} before ending your turn`);
  }
  const currentIndex = state.turnOrder.indexOf(state.currentPlayer);
  const nextPlayer = state.turnOrder[(currentIndex + 1) % state.turnOrder.length];
  return {
    ...state,
    currentPlayer: nextPlayer,
    phase: 'roll',
    dice: null,
    turn: state.turn + 1,
    pending: { discards: {}, freeRoads: 0, playedDevThisTurn: false, hasRolled: false },
    tradeOffers: [],
    log: [...state.log, { turn: state.turn + 1, player: nextPlayer, message: `${playerName(state, nextPlayer)}'s turn` }],
  };
}
