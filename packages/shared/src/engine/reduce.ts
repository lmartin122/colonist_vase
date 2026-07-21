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
  isResource,
  resourceBundlesOverlap,
  resourceBundleTotal,
  subtractResources,
  totalResources,
  validateResourceBundle,
  victoryPoints,
} from './helpers';
import { hasConcurrentTurns, isConcurrentPhase } from './modes';
import { connectedByRoad, legalRoadEdges, robberTargetTiles, roadConnects, settlementSpotOpen, stealableOpponents } from './placement';
import type { DevCardType, GameState, LogEntryDetails, Player, Resource, ResourceBank, ResourceBundle, TradeOfferResponse } from './types';
import { RESOURCES } from './types';

/**
 * The single entry point for mutating a game. Pure: returns either a brand-new
 * GameState or a rejection reason, never mutating the input. All randomness is
 * drawn from state.rng, so identical (state, action) sequences reproduce exactly.
 */
export function reduce(state: GameState, action: Action): ReduceResult {
  try {
    return { ok: true, state: trackMatchStats(state, apply(state, action), action) };
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

function requirePlayer(state: GameState, player: number): void {
  if (!Number.isInteger(player) || player < 0 || state.players[player]?.id !== player) fail('Unknown player');
}

/**
 * Resolves who is acting. In classic (single-actor) phases this is always
 * `state.currentPlayer`, regardless of what the action requested — preserving
 * today's behavior exactly. In a concurrent phase (e.g. Rush's rushRound),
 * every acting player must be named explicitly and must not have passed yet.
 */
function actingPlayer(state: GameState, requested: number | undefined): number {
  if (!isConcurrentPhase(state)) return state.currentPlayer;
  if (requested === undefined) fail('This action must specify the acting player');
  requirePlayer(state, requested);
  if (state.pending.passed[requested]) fail('You have already passed this round');
  return requested;
}

function requireResource(resource: unknown): asserts resource is Resource {
  if (!isResource(resource)) fail('Unknown resource');
}

function validateTradeBundles(
  give: Partial<Record<Resource, number>>,
  receive: Partial<Record<Resource, number>>,
  allowEmptyReceive = false,
): void {
  validateResourceBundle(give, 'Offered resources');
  validateResourceBundle(receive, 'Requested resources');
  if (resourceBundleTotal(give) <= 0 || (!allowEmptyReceive && resourceBundleTotal(receive) <= 0)) {
    fail('Trade must include cards on both sides');
  }
  if (resourceBundlesOverlap(give, receive)) fail('Cannot trade a resource for the same resource');
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function apply(state: GameState, action: Action): GameState {
  if (state.phase === 'gameOver') fail('Game is over');
  if (state.phase === 'discard' && action.type !== 'discard') {
    fail('Resolve all required discards first');
  }
  if (hasConcurrentTurns(state) && state.phase === 'moveRobber' && action.type !== 'moveRobber') {
    fail('Wait for the round captain to move the robber');
  }

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
      return moveRobber(state, action.tile, action.stealFrom, action.player);
    case 'buildRoad':
      return buildRoad(state, action.edge, action.player);
    case 'buildSettlement':
      return buildSettlement(state, action.vertex, action.player);
    case 'buildCity':
      return buildCity(state, action.vertex, action.player);
    case 'buyDevCard':
      return buyDevCard(state, action.player);
    case 'playKnight':
      return playKnight(state, action.tile, action.stealFrom, action.player);
    case 'playRoadBuilding':
      return playRoadBuilding(state, action.player);
    case 'playMonopoly':
      return playMonopoly(state, action.resource, action.player);
    case 'playYearOfPlenty':
      return playYearOfPlenty(state, action.resources, action.player);
    case 'bankTrade':
      return bankTrade(state, action.give, action.receive, action.player);
    case 'playerTrade':
      return playerTrade(state, action.partner, action.give, action.receive, action.player);
    case 'createTradeOffer':
      return createTradeOffer(state, action.give, action.receive, action.anyCount, action.target ?? null, action.player);
    case 'respondTradeOffer':
      return respondTradeOffer(state, action.offerId, action.responder, action.accepted, action.wildcardResource ?? null);
    case 'completeTradeOffer':
      return completeTradeOffer(state, action.offerId, action.partner, action.player);
    case 'cancelTradeOffer':
      return cancelTradeOffer(state, action.offerId, action.player);
    case 'debugAddResources':
      return debugAddResources(state, action.player, action.resources);
    case 'debugGrantDevCard':
      return debugGrantDevCard(state, action.player, action.card);
    case 'debugTriggerRobber':
      return debugTriggerRobber(state);
    case 'endTurn':
      return endTurn(state);
    case 'passRound':
      return passRound(state, action.player);
    case 'cancelPass':
      return cancelPass(state, action.player);
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
    { type: 'dice', dice, context: 'startingOrder', visibility: 'public' },
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

function log(
  state: GameState,
  message: string,
  player: number | null = state.currentPlayer,
  details?: LogEntryDetails,
): GameState {
  return { ...state, log: [...state.log, { turn: state.turn, player, message, ...(details ? { details } : {}) }] };
}

function playerName(state: GameState, id: number): string {
  return state.players[id].name;
}

function compactResources(resources: Partial<Record<Resource, number>>): ResourceBundle {
  return Object.fromEntries(
    RESOURCES.filter((resource) => (resources[resource] ?? 0) > 0)
      .map((resource) => [resource, resources[resource]!]),
  ) as ResourceBundle;
}

function gainedResources(before: GameState, after: GameState, player: number): ResourceBundle {
  return compactResources(Object.fromEntries(
    RESOURCES.map((resource) => [resource, after.players[player].resources[resource] - before.players[player].resources[resource]]),
  ));
}

function logResourceGain(
  state: GameState,
  player: number,
  resources: ResourceBundle,
  source: Extract<LogEntryDetails, { type: 'resourceGain' }>['source'],
): GameState {
  const count = resourceBundleTotal(resources);
  if (count <= 0) return state;
  return log(
    state,
    `${playerName(state, player)} got ${count} resource card${count === 1 ? '' : 's'}`,
    player,
    { type: 'resourceGain', source, resources: compactResources(resources), visibility: 'public' },
  );
}

function logProductionGains(before: GameState, after: GameState): GameState {
  let next = after;
  for (const player of after.players) {
    next = logResourceGain(next, player.id, gainedResources(before, after, player.id), 'production');
  }
  return next;
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
  return log(
    next,
    `${playerName(next, player)} placed a settlement`,
    player,
    { type: 'piece', piece: 'settlement', verb: 'placed', vertex, visibility: 'public' },
  );
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
  let setupGains: ResourceBundle = {};

  let next = withPlayer(state, player, (p) => ({
    ...p,
    stock: { ...p.stock, roads: p.stock.roads - 1 },
  }));
  next = { ...next, roads: { ...next.roads, [edge]: player } };

  // The second settlement grants its adjacent resources.
  if (isSecondRound) {
    const beforeGrant = next;
    next = grantSetupResources(next, player, settlement);
    setupGains = gainedResources(beforeGrant, next, player);
  }

  next = { ...next, setup: { ...state.setup, lastSettlement: null, step: state.setup.step + 1 } };
  next = log(
    next,
    `${playerName(next, player)} placed a road`,
    player,
    { type: 'piece', piece: 'road', verb: 'placed', edge, visibility: 'public' },
  );
  next = logResourceGain(next, player, setupGains, 'setup');
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
    const withSetupCleared: GameState = { ...state, setup: null, turn: 1 };
    if (hasConcurrentTurns(state)) {
      return beginRushRound(withSetupCleared, order[0]);
    }
    return {
      ...withSetupCleared,
      phase: 'roll',
      currentPlayer: order[0],
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
  next = log(
    next,
    `${playerName(next, state.currentPlayer)} rolled ${sum}`,
    state.currentPlayer,
    { type: 'dice', dice, context: 'turn', visibility: 'public' },
  );

  if (sum === 7) {
    return beginRobber(next);
  }
  const produced = produceResources(next, sum);
  return { ...logProductionGains(next, produced), phase: 'main' };
}

/**
 * Rush mode: begins a new round — rolls the dice once for everyone, resets
 * per-round obligations, rotates the round captain (who resolves the robber
 * on a 7), and distributes resources (or opens discard/robber resolution).
 */
function beginRushRound(state: GameState, captain: number): GameState {
  const d1 = rollDie(state.rng);
  const d2 = rollDie(d1.rng);
  const dice: [number, number] = [d1.value, d2.value];
  const sum = d1.value + d2.value;

  let next: GameState = {
    ...state,
    rng: d2.rng,
    dice,
    currentPlayer: captain,
    pending: {
      discards: {},
      freeRoads: {},
      playedDevThisTurn: {},
      hasRolled: true,
      botTradeOfferedThisTurn: {},
      passed: {},
      roundCaptain: captain,
    },
  };
  next = log(
    next,
    `Round ${next.turn} begins — rolled ${sum}`,
    null,
    { type: 'dice', dice, context: 'rushRound', visibility: 'public' },
  );

  if (sum === 7) return beginRobber(next);
  const produced = produceResources(next, sum);
  return { ...logProductionGains(next, produced), phase: 'rushRound' };
}

/**
 * Rush mode: a player signals they have nothing more to do this round. Once
 * every player has passed, the round closes and a new one begins with the
 * round captaincy rotated to the next player in turn order.
 */
function passRound(state: GameState, player: number): GameState {
  if (!isConcurrentPhase(state)) fail('Not in a concurrent round');
  requirePlayer(state, player);
  if (state.pending.passed[player]) return state;
  if ((state.pending.freeRoads[player] ?? 0) > 0 && legalRoadEdges(state, player).length > 0) {
    fail(`Place ${state.pending.freeRoads[player]} remaining free road${state.pending.freeRoads[player] === 1 ? '' : 's'} before passing`);
  }
  // Passing declines this player's unanswered incoming offers. Outgoing offers
  // stay visible with their response statuses across round transitions.
  let next = declinePendingResponses(state, player);
  next = { ...next, pending: { ...next.pending, passed: { ...next.pending.passed, [player]: true } } };
  next = log(next, `${playerName(next, player)} passed`, player);

  const everyonePassed = state.players.every((p) => next.pending.passed[p.id]);
  if (!everyonePassed) return next;

  const currentIndex = next.turnOrder.indexOf(next.pending.roundCaptain);
  const nextCaptain = next.turnOrder[(currentIndex + 1) % next.turnOrder.length];
  return checkWin(beginRushRound({ ...next, turn: next.turn + 1 }, nextCaptain));
}

function cancelPass(state: GameState, player: number): GameState {
  if (!isConcurrentPhase(state)) fail('Not in a concurrent round');
  requirePlayer(state, player);
  if (!state.pending.passed[player]) return state;
  const next = { ...state, pending: { ...state.pending, passed: { ...state.pending.passed, [player]: false } } };
  return log(next, `${playerName(next, player)} is deciding again`, player);
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
  requirePlayer(state, player);
  validateResourceBundle(resources, 'Discarded resources');
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
  next = log(
    next,
    `${playerName(next, player)} had to discard ${count} card${count === 1 ? '' : 's'}`,
    player,
    { type: 'discard', resources: compactResources(resources), count, visibility: 'public' },
  );

  if (Object.keys(discards).length === 0) {
    return { ...next, phase: 'moveRobber' };
  }
  return next;
}

function moveRobber(state: GameState, tile: number, stealFrom: number | null, requestedPlayer?: number): GameState {
  if (state.phase !== 'moveRobber') fail('Not time to move the robber');
  const actor = hasConcurrentTurns(state) ? state.pending.roundCaptain : state.currentPlayer;
  if (hasConcurrentTurns(state)) {
    if (requestedPlayer === undefined) fail('Robber placement must identify the round captain');
    requirePlayer(state, requestedPlayer);
    if (requestedPlayer !== actor) fail('Only the round captain can move the robber');
  }
  const nextPhase = hasConcurrentTurns(state) ? 'rushRound' : 'main';
  return applyRobber(state, tile, stealFrom, nextPhase, actor);
}

/** Shared robber logic used by a rolled 7 and by the Knight card. */
function applyRobber(
  state: GameState,
  tile: number,
  stealFrom: number | null,
  nextPhase: GameState['phase'],
  actor: number,
): GameState {
  if (!Number.isInteger(tile) || !state.board.tiles[tile]) fail('Unknown robber tile');
  if (!robberTargetTiles(state, actor).includes(tile)) fail('Robber cannot move to that tile');
  const occupants = new Set(stealableOpponents(state, tile, actor));

  let next: GameState = { ...state, board: { ...state.board, robberTileId: tile } };

  if (stealFrom !== null) {
    if (!occupants.has(stealFrom)) fail('Cannot steal from that player');
    next = stealRandom(next, actor, stealFrom);
  } else if (occupants.size > 0) {
    fail('Must steal from an adjacent player');
  }
  next = log(next, `${playerName(next, actor)} moved the robber`, actor, { type: 'robber', tile, visibility: 'public' });
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
  return log(
    next,
    `${playerName(next, thief)} stole from ${playerName(next, victim)}`,
    thief,
    { type: 'steal', victim, resource, visibility: 'participants' },
  );
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

function requireMain(state: GameState): void {
  if (state.phase !== 'main' && !isConcurrentPhase(state)) fail('You must roll first');
}

function spend(state: GameState, player: number, cost: Partial<ResourceBank>): GameState {
  if (!canAfford(state.players[player].resources, cost)) fail('Not enough resources');
  let next = withPlayer(state, player, (p) => ({ ...p, resources: subtractResources(p.resources, cost) }));
  next = { ...next, bank: addResources(next.bank, cost) };
  return next;
}

function buildRoad(state: GameState, edge: number, requestedPlayer?: number): GameState {
  const player = actingPlayer(state, requestedPlayer);
  // Road Building grants free roads; otherwise pay wood + brick.
  if ((state.pending.freeRoads[player] ?? 0) > 0) {
    if (state.phase !== 'roll' && state.phase !== 'main' && !isConcurrentPhase(state)) fail('Cannot place a free road now');
    const placed = placeRoad(state, edge, player);
    return normalizeFreeRoads(placed, player, placed.pending.freeRoads[player] - 1);
  }
  requireMain(state);
  return placeRoad(spend(state, player, COSTS.road), edge, player);
}

function normalizeFreeRoads(state: GameState, player: number, requested: number): GameState {
  const value = requested > 0 && legalRoadEdges(state, player).length > 0 ? requested : 0;
  return { ...state, pending: { ...state.pending, freeRoads: { ...state.pending.freeRoads, [player]: value } } };
}

/** Count every card entering a hand without coupling individual actions to statistics. */
function trackMatchStats(before: GameState, after: GameState, action: Action): GameState {
  let changed = false;
  let players = after.players.map((player, index) => {
    const previous = before.players[index];
    if (!previous) return player;
    const gains = RESOURCES.map((resource) => Math.max(0, player.resources[resource] - previous.resources[resource]));
    if (!gains.some(Boolean)) return player;
    changed = true;
    const resourcesCollected = { ...player.stats.resourcesCollected };
    RESOURCES.forEach((resource, resourceIndex) => { resourcesCollected[resource] += gains[resourceIndex]; });
    return { ...player, stats: { ...player.stats, resourcesCollected } };
  });
  const increment = (playerId: number, field: keyof Omit<Player['stats'], 'resourcesCollected' | 'devCardsCollected'>, amount = 1) => {
    const player = players[playerId];
    players = players.map((item, index) => index === playerId ? { ...player, stats: { ...player.stats, [field]: player.stats[field] + amount } } : item);
    changed = true;
  };
  const actor = 'player' in action && action.player !== undefined ? action.player : before.currentPlayer;
  let diceStats = after.diceStats;

  // Classic rolls are explicit actions. Rush rolls happen as a side effect of
  // entering each new numbered round (including round 1 after setup), so they
  // must be detected from the turn transition instead.
  const startedRushRound = hasConcurrentTurns(after) && after.turn > before.turn && after.dice !== null;
  if (startedRushRound) {
    const total = after.dice![0] + after.dice![1];
    diceStats = { ...after.diceStats, [total]: (after.diceStats[total] ?? 0) + 1 };
    after.players.forEach((player) => increment(player.id, 'turnsTaken'));
  }

  switch (action.type) {
    case 'rollDice': {
      const total = after.dice ? after.dice[0] + after.dice[1] : 0;
      diceStats = { ...after.diceStats, [total]: (after.diceStats[total] ?? 0) + 1 };
      increment(actor, 'turnsTaken');
      break;
    }
    case 'placeSetupRoad': case 'buildRoad': increment(actor, 'roadsPlaced'); break;
    case 'placeSetupSettlement': case 'buildSettlement': increment(actor, 'settlementsPlaced'); break;
    case 'buildCity': increment(actor, 'citiesBuilt'); break;
    case 'bankTrade': increment(actor, 'bankTrades'); break;
    case 'createTradeOffer': increment(actor, 'tradeOffers'); break;
    case 'playerTrade': case 'completeTradeOffer':
      increment(actor, 'playerTrades');
      increment(action.partner, 'playerTrades');
      break;
    case 'discard':
      increment(action.player, 'cardsDiscarded', RESOURCES.reduce((sum, resource) => sum + (action.resources[resource] ?? 0), 0));
      break;
    case 'moveRobber': case 'playKnight': {
      increment(actor, 'robberMoves');
      if (action.stealFrom !== null && totalResources(after.players[action.stealFrom].resources) < totalResources(before.players[action.stealFrom].resources)) {
        increment(actor, 'successfulSteals');
        increment(actor, 'cardsStolen');
      }
      if (action.type === 'playKnight') increment(actor, 'devCardsPlayed');
      break;
    }
    case 'buyDevCard': case 'debugGrantDevCard': {
      const playerId = action.type === 'buyDevCard' ? actor : action.player;
      const type = action.type === 'debugGrantDevCard' ? action.card : after.players[playerId].devCards.at(-1)!.type;
      const player = players[playerId];
      players = players.map((item, index) => index === playerId ? { ...player, stats: { ...player.stats, devCardsCollected: { ...player.stats.devCardsCollected, [type]: player.stats.devCardsCollected[type] + 1 } } } : item);
      changed = true;
      if (action.type === 'buyDevCard') increment(playerId, 'devCardsBought');
      break;
    }
    case 'playRoadBuilding': case 'playMonopoly': case 'playYearOfPlenty': increment(actor, 'devCardsPlayed'); break;
  }
  return changed || diceStats !== after.diceStats ? { ...after, players, diceStats } : after;
}

/** Place a road (payment handled by caller — free during road-building card). */
function placeRoad(state: GameState, edge: number, player: number): GameState {
  if (state.roads[edge] !== undefined) fail('Edge already has a road');
  if (state.players[player].stock.roads <= 0) fail('No roads left');
  if (!roadConnects(state, player, edge)) fail('Road must connect to your network');

  let next = withPlayer(state, player, (p) => ({ ...p, stock: { ...p.stock, roads: p.stock.roads - 1 } }));
  next = { ...next, roads: { ...next.roads, [edge]: player } };
  next = updateLongestRoad(next);
  next = log(next, `${playerName(next, player)} built a road`, player, {
    type: 'piece', piece: 'road', verb: 'built', edge, visibility: 'public',
  });
  return checkWin(next);
}

function buildSettlement(state: GameState, vertex: number, requestedPlayer?: number): GameState {
  requireMain(state);
  const player = actingPlayer(state, requestedPlayer);
  if (state.players[player].stock.settlements <= 0) fail('No settlements left');
  if (!settlementSpotOpen(state, vertex)) fail('Spot is occupied or too close to another building');
  if (!connectedByRoad(state, player, vertex)) fail('Settlement must connect to your road');

  let next = spend(state, player, COSTS.settlement);
  next = withPlayer(next, player, (p) => ({ ...p, stock: { ...p.stock, settlements: p.stock.settlements - 1 } }));
  next = { ...next, buildings: { ...next.buildings, [vertex]: { type: 'settlement', owner: player } } };
  // A new settlement can cut an opponent's road.
  next = updateLongestRoad(next);
  next = log(next, `${playerName(next, player)} built a settlement`, player, {
    type: 'piece', piece: 'settlement', verb: 'built', vertex, visibility: 'public',
  });
  return checkWin(next);
}

function buildCity(state: GameState, vertex: number, requestedPlayer?: number): GameState {
  requireMain(state);
  const player = actingPlayer(state, requestedPlayer);
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
  next = log(next, `${playerName(next, player)} built a city`, player, {
    type: 'piece', piece: 'city', verb: 'built', vertex, visibility: 'public',
  });
  return checkWin(next);
}

// ---------------------------------------------------------------------------
// Development cards
// ---------------------------------------------------------------------------

function buyDevCard(state: GameState, requestedPlayer?: number): GameState {
  requireMain(state);
  const player = actingPlayer(state, requestedPlayer);
  if (state.devDeck.length === 0) fail('Development deck is empty');
  let next = spend(state, player, COSTS.devCard);
  const [card, ...rest] = next.devDeck;
  next = { ...next, devDeck: rest };
  next = withPlayer(next, player, (p) => ({
    ...p,
    devCards: [...p.devCards, { type: card, boughtOnTurn: next.turn, played: false }],
  }));
  next = log(
    next,
    `${playerName(next, player)} bought a development card`,
    player,
    { type: 'developmentCard', visibility: 'public' },
  );
  return checkWin(next);
}

/** Find a playable dev card of a type (bought on an earlier turn, unplayed). */
function takeDevCard(state: GameState, type: string, player: number): GameState {
  if (state.phase !== 'roll' && state.phase !== 'main' && !isConcurrentPhase(state)) fail('Cannot play a card now');
  if (state.pending.playedDevThisTurn[player]) fail('Only one development card per turn');
  const owner = state.players[player];
  const idx = owner.devCards.findIndex(
    (c) => c.type === type && !c.played && c.boughtOnTurn < state.turn,
  );
  if (idx === -1) fail('No playable card of that type');
  return withPlayer(state, player, (p) => {
    const devCards = p.devCards.slice();
    devCards[idx] = { ...devCards[idx], played: true };
    return { ...p, devCards };
  });
}

function markDevPlayed(state: GameState, player: number): GameState {
  return { ...state, pending: { ...state.pending, playedDevThisTurn: { ...state.pending.playedDevThisTurn, [player]: true } } };
}

function playKnight(state: GameState, tile: number, stealFrom: number | null, requestedPlayer?: number): GameState {
  const player = actingPlayer(state, requestedPlayer);
  let next = takeDevCard(state, 'knight', player);
  next = markDevPlayed(next, player);
  next = withPlayer(next, player, (p) => ({ ...p, knightsPlayed: p.knightsPlayed + 1 }));
  next = updateLargestArmy(next, player);
  // Knight keeps the current phase (may be played before rolling).
  next = applyRobber(next, tile, stealFrom, next.phase, player);
  return checkWin(next);
}

function playRoadBuilding(state: GameState, requestedPlayer?: number): GameState {
  const player = actingPlayer(state, requestedPlayer);
  let next = takeDevCard(state, 'roadBuilding', player);
  next = markDevPlayed(next, player);
  // Grant up to two free roads (capped by remaining stock); placed via buildRoad.
  const free = Math.min(2, next.players[player].stock.roads);
  next = normalizeFreeRoads(next, player, free);
  return log(next, `${playerName(next, player)} played Road Building`, player);
}

function playMonopoly(state: GameState, resource: Resource, requestedPlayer?: number): GameState {
  requireResource(resource);
  const player = actingPlayer(state, requestedPlayer);
  let next = takeDevCard(state, 'monopoly', player);
  next = markDevPlayed(next, player);
  let taken = 0;
  const players = next.players.map((p) => {
    if (p.id === player) return p;
    taken += p.resources[resource];
    return { ...p, resources: { ...p.resources, [resource]: 0 } };
  });
  next = { ...next, players };
  next = withPlayer(next, player, (p) => ({ ...p, resources: { ...p.resources, [resource]: p.resources[resource] + taken } }));
  return log(
    next,
    `${playerName(next, player)} monopolised ${resource} (+${taken})`,
    player,
    { type: 'monopoly', resource, count: taken, visibility: 'public' },
  );
}

function playYearOfPlenty(state: GameState, resources: Resource[], requestedPlayer?: number): GameState {
  if (resources.length !== 2) fail('Year of Plenty takes exactly two resources');
  resources.forEach(requireResource);
  const player = actingPlayer(state, requestedPlayer);
  let next = takeDevCard(state, 'yearOfPlenty', player);
  next = markDevPlayed(next, player);
  const bank = { ...next.bank };
  for (const r of resources) {
    if (bank[r] <= 0) fail(`Bank has no ${r}`);
    bank[r] -= 1;
  }
  next = { ...next, bank };
  next = withPlayer(next, player, (p) => {
    const res = { ...p.resources };
    for (const r of resources) res[r] += 1;
    return { ...p, resources: res };
  });
  const gains: ResourceBundle = {};
  for (const resource of resources) gains[resource] = (gains[resource] ?? 0) + 1;
  return log(
    next,
    `${playerName(next, player)} played Year of Plenty`,
    player,
    { type: 'resourceGain', source: 'yearOfPlenty', resources: gains, visibility: 'public' },
  );
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

function bankTrade(state: GameState, give: Resource, receive: Resource, requestedPlayer?: number): GameState {
  requireMain(state);
  requireResource(give);
  requireResource(receive);
  if (give === receive) fail('Cannot trade a resource for the same resource');
  const player = actingPlayer(state, requestedPlayer);
  const ratio = bankTradeRatio(state, player, give);
  if (state.players[player].resources[give] < ratio) fail(`Need ${ratio} ${give} to trade`);
  if (state.bank[receive] <= 0) fail(`Bank has no ${receive}`);

  let next = withPlayer(state, player, (p) => ({
    ...p,
    resources: { ...p.resources, [give]: p.resources[give] - ratio, [receive]: p.resources[receive] + 1 },
  }));
  next = { ...next, bank: { ...next.bank, [give]: next.bank[give] + ratio, [receive]: next.bank[receive] - 1 } };
  return log(
    next,
    `${playerName(next, player)} traded ${ratio} ${give} for 1 ${receive} with the bank`,
    player,
    {
      type: 'trade', kind: 'bank', partner: null,
      give: { [give]: ratio }, receive: { [receive]: 1 }, visibility: 'public',
    },
  );
}

function playerTrade(
  state: GameState,
  partner: number,
  give: Partial<Record<Resource, number>>,
  receive: Partial<Record<Resource, number>>,
  requestedPlayer?: number,
): GameState {
  if (!state.rules.allowPlayerTrades) fail('Player trading is disabled');
  requireMain(state);
  if (isConcurrentPhase(state)) fail('Use trade offers during concurrent rounds');
  const player = actingPlayer(state, requestedPlayer);
  requirePlayer(state, partner);
  if (partner === player) fail('Cannot trade with yourself');
  validateTradeBundles(give, receive);
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
  return log(
    next,
    `${playerName(next, player)} traded ${formatResources(give)} for ${formatResources(receive)} with ${playerName(next, partner)}`,
    player,
    {
      type: 'trade', kind: 'player', partner,
      give: compactResources(give), receive: compactResources(receive), visibility: 'public',
    },
  );
}

function createTradeOffer(
  state: GameState,
  give: Partial<Record<Resource, number>>,
  receive: Partial<Record<Resource, number>>,
  anyCount: number,
  target: number | null,
  requestedPlayer?: number,
): GameState {
  if (!state.rules.allowPlayerTrades) fail('Player trading is disabled');
  requireMain(state);
  const proposer = actingPlayer(state, requestedPlayer);
  validateTradeBundles(give, receive, true);
  if (!Number.isInteger(anyCount) || anyCount < 0) fail('Wildcard count must be a non-negative whole number');
  if (resourceBundleTotal(receive) + anyCount <= 0) fail('Trade must include cards on both sides');
  if (!canAfford(state.players[proposer].resources, give)) fail('You lack the offered resources');

  const proposerIsBot = state.players[proposer].isBot;
  if (proposerIsBot) {
    if (state.pending.botTradeOfferedThisTurn[proposer]) fail('Bot already offered a trade this turn');
    if (anyCount > 0) fail('Bot offers cannot request wildcard resources');
  }

  const responses: Record<number, TradeOfferResponse> = {};
  if (target !== null) {
    requirePlayer(state, target);
    if (!proposerIsBot || state.players[target]?.isBot !== false || target === proposer) fail('Bot offers must target a human opponent');
    if (isConcurrentPhase(state) && state.pending.passed[target]) fail('Trade target has already passed this round');
    for (const player of state.players) {
      if (player.id === proposer) continue;
      if (player.id === target) responses[player.id] = { status: 'pending', wildcardResource: null };
      else responses[player.id] = {
        status: isConcurrentPhase(state) && state.pending.passed[player.id]
          ? 'declined'
          : botAcceptsTrade(state, player.id, give, receive, proposer) ? 'accepted' : 'declined',
        wildcardResource: null,
      };
    }
  } else {
    for (const player of state.players) {
      if (player.id === proposer) continue;
      if (isConcurrentPhase(state) && state.pending.passed[player.id]) {
        responses[player.id] = { status: 'declined', wildcardResource: null };
        continue;
      }
      const wildcardResource = anyCount > 0
        ? player.isBot
          ? RESOURCES.find((resource) => (give[resource] ?? 0) === 0 && botAcceptsTrade(state, player.id, give, { ...receive, [resource]: (receive[resource] ?? 0) + anyCount }, proposer)) ?? null
          : null
        : null;
      responses[player.id] = {
        status: player.isBot
          ? ((anyCount > 0 ? wildcardResource !== null : botAcceptsTrade(state, player.id, give, receive, proposer)) ? 'accepted' : 'declined')
          : 'pending',
        wildcardResource,
      };
    }
  }
  const offer = { id: state.nextTradeOfferId, createdTurn: state.turn, proposer, give, receive, anyCount, target, responses };
  const pending = proposerIsBot
    ? { ...state.pending, botTradeOfferedThisTurn: { ...state.pending.botTradeOfferedThisTurn, [proposer]: true } }
    : state.pending;
  return log(
    { ...state, pending, tradeOffers: [...state.tradeOffers, offer], nextTradeOfferId: state.nextTradeOfferId + 1 },
    `${playerName(state, proposer)} proposed a trade`,
    proposer,
    {
      type: 'tradeOffer',
      give: compactResources(give),
      receive: compactResources(receive),
      anyCount,
      target,
      visibility: 'public',
    },
  );
}

function respondTradeOffer(state: GameState, offerId: number, responder: number, accepted: boolean, wildcardResource: Resource | null): GameState {
  if (state.phase !== 'main' && !isConcurrentPhase(state)) fail('Trade responses are only allowed during an action phase');
  if (!Number.isInteger(offerId)) fail('Unknown trade offer');
  requirePlayer(state, responder);
  if (isConcurrentPhase(state) && state.pending.passed[responder]) fail('You have already passed this round');
  if (typeof accepted !== 'boolean') fail('Trade response must accept or decline');
  const offer = state.tradeOffers.find((item) => item.id === offerId);
  const addressedToResponder = offer?.target === null || offer?.target === responder;
  if (!offer || !addressedToResponder || offer.responses[responder]?.status !== 'pending') fail('Trade response is no longer pending');
  if (state.players[responder].isBot) fail('Only the targeted human can respond');
  validateTradeBundles(offer.give, offer.receive, true);
  if (accepted) {
    const requested = { ...offer.receive };
    if (offer.anyCount > 0) {
      requireResource(wildcardResource);
      if ((offer.give[wildcardResource] ?? 0) > 0) fail('Cannot trade a resource for the same resource');
      requested[wildcardResource] = (requested[wildcardResource] ?? 0) + offer.anyCount;
    } else if (wildcardResource !== null) {
      fail('This offer does not request a wildcard resource');
    }
    if (!canAfford(state.players[responder].resources, requested)) fail('You lack the requested resources');
  } else if (wildcardResource !== null) {
    fail('A declined offer cannot select a wildcard resource');
  }
  const status = accepted ? 'accepted' as const : 'declined' as const;
  const responses = { ...offer.responses, [responder]: { status, wildcardResource: accepted ? wildcardResource : null } };
  const next = { ...state, tradeOffers: state.tradeOffers.map((item) => item.id === offerId ? { ...item, responses } : item) };
  return log(next, `${playerName(state, responder)} ${accepted ? 'accepted' : 'declined'} the trade offer`, responder);
}

function completeTradeOffer(state: GameState, offerId: number, partner: number, requestedPlayer?: number): GameState {
  requireMain(state);
  if (!Number.isInteger(offerId)) fail('Unknown trade offer');
  requirePlayer(state, partner);
  const proposer = actingPlayer(state, requestedPlayer);
  const offer = state.tradeOffers.find((item) => item.id === offerId);
  if (!offer) fail('Trade offer no longer exists');
  if (offer.proposer !== proposer) fail('Only the current proposer can choose a trade partner');
  const response = offer.responses[partner];
  if (response?.status !== 'accepted') fail('That player did not accept this offer');
  validateTradeBundles(offer.give, offer.receive, true);
  const receive = { ...offer.receive };
  if (offer.anyCount > 0) {
    requireResource(response.wildcardResource);
    if ((offer.give[response.wildcardResource] ?? 0) > 0) fail('Cannot trade a resource for the same resource');
    receive[response.wildcardResource] = (receive[response.wildcardResource] ?? 0) + offer.anyCount;
  }
  validateTradeBundles(offer.give, receive);
  if (!canAfford(state.players[offer.proposer].resources, offer.give)) fail('You no longer have the offered resources');
  if (!canAfford(state.players[partner].resources, receive)) fail('That player no longer has the requested resources');

  let next = withPlayer(state, offer.proposer, (p) => ({ ...p, resources: addResources(subtractResources(p.resources, offer.give), receive) }));
  next = withPlayer(next, partner, (p) => ({ ...p, resources: addResources(subtractResources(p.resources, receive), offer.give) }));
  next = { ...next, tradeOffers: next.tradeOffers.filter((item) => item.id !== offerId) };
  return log(
    next,
    `${playerName(next, offer.proposer)} traded ${formatResources(offer.give)} for ${formatResources(receive)} with ${playerName(next, partner)}`,
    proposer,
    {
      type: 'trade', kind: 'player', partner,
      give: compactResources(offer.give), receive: compactResources(receive), visibility: 'public',
    },
  );
}

function formatResources(resources: Partial<Record<Resource, number>>): string {
  return RESOURCES.filter((resource) => (resources[resource] ?? 0) > 0).map((resource) => `${resources[resource]} ${resource}`).join(', ');
}

function cancelTradeOffer(state: GameState, offerId: number, requestedPlayer?: number): GameState {
  requireMain(state);
  if (!Number.isInteger(offerId)) fail('Unknown trade offer');
  const proposer = actingPlayer(state, requestedPlayer);
  const offer = state.tradeOffers.find((item) => item.id === offerId);
  if (!offer) fail('Trade offer no longer exists');
  if (offer.proposer !== proposer) fail('Only the current proposer can cancel this offer');
  return log({ ...state, tradeOffers: state.tradeOffers.filter((item) => item.id !== offerId) }, `${playerName(state, offer.proposer)} cancelled a trade offer`, proposer);
}

/** Auto-decline `player`'s still-pending response on anyone else's offer —
 *  used when they pass, so a proposer waiting on them isn't stuck forever. */
function declinePendingResponses(state: GameState, player: number): GameState {
  let next = state;
  for (const offer of state.tradeOffers) {
    if (offer.responses[player]?.status !== 'pending') continue;
    const responses = { ...offer.responses, [player]: { status: 'declined' as const, wildcardResource: null } };
    next = { ...next, tradeOffers: next.tradeOffers.map((o) => o.id === offer.id ? { ...o, responses } : o) };
  }
  return next;
}

// ---------------------------------------------------------------------------
// Turn flow, army, win
// ---------------------------------------------------------------------------

function updateLargestArmy(state: GameState, player: number): GameState {
  const knights = state.players[player].knightsPlayed;
  if (knights < LARGEST_ARMY_MIN) return state;
  if (knights > state.largestArmy.size) {
    return { ...state, largestArmy: { player, size: knights } };
  }
  return state;
}

/**
 * Checks every player, not just the one who acted: Longest Road can flip to a
 * third party when someone else's settlement severs their road, and that
 * transfer alone can push the new holder over the threshold. The real game
 * ends the instant any player reaches the target, regardless of whose turn
 * caused it, so scan everyone rather than trust the actor to be the only
 * candidate. Scanning `state.players` in a fixed index order keeps this
 * deterministic for the seeded-RNG replay guarantee.
 */
function checkWin(state: GameState): GameState {
  const winner = state.players.find((p) => victoryPoints(state, p.id) >= state.rules.victoryPoints);
  if (!winner) return state;
  return log({ ...state, phase: 'gameOver', winner: winner.id }, `${playerName(state, winner.id)} wins!`, winner.id);
}

/** Developer-only helpers, intentionally routed through the pure reducer. */
function debugAddResources(state: GameState, player: number, resources: Partial<Record<Resource, number>>): GameState {
  requirePlayer(state, player);
  validateResourceBundle(resources, 'Debug resources');
  const added = resourceBundleTotal(resources);
  if (added <= 0) fail('Debug resources must be positive whole cards');
  const next = withPlayer(state, player, (p) => ({ ...p, resources: addResources(p.resources, resources) }));
  return log(next, `Debug: gave ${added} resource card${added === 1 ? '' : 's'} to ${playerName(next, player)}`, player);
}

function debugGrantDevCard(state: GameState, player: number, card: DevCardType): GameState {
  requirePlayer(state, player);
  const next = withPlayer(state, player, (p) => ({
    ...p,
    devCards: [...p.devCards, { type: card, boughtOnTurn: state.turn - 1, played: false }],
  }));
  return log(next, `Debug: gave ${playerName(next, player)} a ${card} progress card`, player);
}

function debugTriggerRobber(state: GameState): GameState {
  if (state.phase !== 'roll' && state.phase !== 'main' && !isConcurrentPhase(state)) fail('Robber can only be triggered during a turn');
  return log({ ...state, phase: 'moveRobber', pending: { ...state.pending, discards: {} } }, 'Debug: robber placement started');
}

function endTurn(state: GameState): GameState {
  if (isConcurrentPhase(state)) fail('Use passRound in this mode');
  if (state.phase !== 'main') fail('Cannot end turn now');
  if ((state.pending.freeRoads[state.currentPlayer] ?? 0) > 0 && legalRoadEdges(state, state.currentPlayer).length > 0) {
    fail(`Place ${state.pending.freeRoads[state.currentPlayer]} remaining free road${state.pending.freeRoads[state.currentPlayer] === 1 ? '' : 's'} before ending your turn`);
  }
  const currentIndex = state.turnOrder.indexOf(state.currentPlayer);
  const nextPlayer = state.turnOrder[(currentIndex + 1) % state.turnOrder.length];
  const next: GameState = {
    ...state,
    currentPlayer: nextPlayer,
    phase: 'roll',
    dice: null,
    turn: state.turn + 1,
    pending: { discards: {}, freeRoads: {}, playedDevThisTurn: {}, hasRolled: false, botTradeOfferedThisTurn: {}, passed: {}, roundCaptain: state.pending.roundCaptain },
    tradeOffers: [],
    log: [...state.log, { turn: state.turn + 1, player: nextPlayer, message: `${playerName(state, nextPlayer)}'s turn` }],
  };
  return checkWin(next);
}
