import type { Action } from '../engine/actions';
import type { GameState, Resource } from '../engine/types';
import { RESOURCES } from '../engine/types';

/**
 * Card-flight animations. We keep the engine pure, so we derive "a card moved
 * from A to B" purely by diffing the state before/after an action (plus the
 * action itself for context). The UI overlay resolves each anchor to a screen
 * position and animates a resource card between them.
 */

/** Where a flying card starts or ends. Resolved to screen coords by the overlay. */
export type Anchor =
  | { t: 'tile'; tile: number }
  | { t: 'bank'; resource: Resource }
  | { t: 'hand'; resource: Resource }
  | { t: 'player'; id: number }
  | { t: 'devDeck' }
  | { t: 'devHand' }
  | { t: 'devStack'; id: number };

export interface Flight {
  id: string;
  resource: Resource | null;
  from: Anchor;
  to: Anchor;
  delay: number;
}

// --- Event bus (deliberately outside React/zustand to avoid re-render churn) --

type Listener = (flight: Flight) => void;
const listeners = new Set<Listener>();

export function onFlight(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function emitFlights(flights: Flight[]): void {
  for (const f of flights) for (const l of listeners) l(f);
}

// --- Derivation ------------------------------------------------------------

let seq = 0;
const uid = () => `fl${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** A card is shown at the player's hand (human) or their profile panel (bots). */
function held(id: number, resource: Resource, humanId: number): Anchor {
  return id === humanId ? { t: 'hand', resource } : { t: 'player', id };
}

/** Expand a count into individual staggered card flights for a fanned feel. */
function cards(resource: Resource, from: Anchor, to: Anchor, count: number, base: number): Flight[] {
  const out: Flight[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ id: uid(), resource, from, to, delay: base + i * 90 });
  }
  return out;
}

const delta = (before: GameState, after: GameState, id: number, r: Resource) =>
  after.players[id].resources[r] - before.players[id].resources[r];

/**
 * Who actually performed this action. Most actions carry an optional
 * `player` field for concurrent modes (e.g. Rush) where `currentPlayer` is
 * pinned to the round captain and doesn't track the real actor; classic-mode
 * actions (and calls that omit it) fall back to `currentPlayer` as before.
 */
function actorOf(before: GameState, action: Action): number {
  return 'player' in action && action.player !== undefined ? action.player : before.currentPlayer;
}

export function deriveFlights(
  before: GameState,
  after: GameState,
  action: Action,
  humanId: number,
): Flight[] {
  const startedRushRound = after.rules.mode === 'rush' && after.turn > before.turn && after.dice !== null;
  switch (action.type) {
    case 'placeSetupRoad':
      return [
        ...setupGrantFlights(before, after, humanId),
        ...(startedRushRound ? production(before, after, humanId, setupGrantGains(before, after)) : []),
      ];
    case 'rollDice':
      return production(before, after, humanId);
    case 'passRound':
      return startedRushRound ? production(before, after, humanId) : [];
    case 'discard':
      return discardFlights(action.player, action.resources, humanId);
    case 'moveRobber':
      return stealFlights(before, after, actorOf(before, action), humanId);
    case 'playKnight':
      return stealFlights(before, after, actorOf(before, action), humanId);
    case 'buildRoad':
    case 'buildSettlement':
    case 'buildCity':
      return playerBankDiff(before, after, actorOf(before, action), humanId);
    case 'buyDevCard':
      return buyDevCardFlights(before, after, actorOf(before, action), humanId);
    case 'bankTrade':
      return playerBankDiff(before, after, actorOf(before, action), humanId);
    case 'playerTrade':
    case 'completeTradeOffer':
      return tradeFlights(before, after, actorOf(before, action), action.partner, humanId);
    case 'playMonopoly':
      return monopolyFlights(before, after, action.resource, actorOf(before, action), humanId);
    case 'playYearOfPlenty':
      return yearOfPlentyFlights(action.resources, actorOf(before, action), humanId);
    default:
      return [];
  }
}

/**
 * The second setup settlement grants its adjacent tiles' resources. Fly one card
 * per adjacent (non-desert) tile from the hex to the placing player. First-round
 * roads grant nothing, so the delta clamp naturally yields no flights.
 */
function setupGrantFlights(before: GameState, after: GameState, humanId: number): Flight[] {
  const vertex = before.setup?.lastSettlement;
  if (vertex === null || vertex === undefined) return [];
  const player = before.currentPlayer;
  const used = new Map<Resource, number>();
  const flights: Flight[] = [];
  for (const tileId of before.board.vertices[vertex].tileIds) {
    const tile = before.board.tiles[tileId];
    if (tile.type === 'desert') continue;
    const resource = tile.type as Resource;
    const cap = delta(before, after, player, resource);
    const already = used.get(resource) ?? 0;
    if (already >= cap) continue;
    used.set(resource, already + 1);
    flights.push(...cards(resource, { t: 'tile', tile: tileId }, held(player, resource, humanId), 1, flights.length * 40));
  }
  return flights;
}

/** Resource gains attributable to the final setup placement, so an automatic
 * Rush opening roll only animates the additional production delta. */
function setupGrantGains(before: GameState, after: GameState): { player: number; gains: Partial<Record<Resource, number>> } | null {
  const vertex = before.setup?.lastSettlement;
  if (vertex === null || vertex === undefined) return null;
  const player = before.currentPlayer;
  const raw: Partial<Record<Resource, number>> = {};
  for (const tileId of before.board.vertices[vertex].tileIds) {
    const tile = before.board.tiles[tileId];
    if (tile.type === 'desert') continue;
    raw[tile.type] = (raw[tile.type] ?? 0) + 1;
  }
  const gains: Partial<Record<Resource, number>> = {};
  for (const resource of RESOURCES) {
    gains[resource] = Math.min(raw[resource] ?? 0, Math.max(0, delta(before, after, player, resource)));
  }
  return { player, gains };
}

/** Resources fly from the producing hexagons to each owner's hand/panel. */
function production(
  before: GameState,
  after: GameState,
  humanId: number,
  excluded: { player: number; gains: Partial<Record<Resource, number>> } | null = null,
): Flight[] {
  const dice = after.dice;
  if (!dice) return [];
  const roll = dice[0] + dice[1];
  if (roll === 7) return [];

  const raw: { tile: number; owner: number; resource: Resource; count: number }[] = [];
  for (const tile of before.board.tiles) {
    if (tile.number !== roll || tile.id === before.board.robberTileId || tile.type === 'desert') continue;
    const resource = tile.type as Resource;
    for (const vid of tile.vertexIds) {
      const b = before.buildings[vid];
      if (!b) continue;
      raw.push({ tile: tile.id, owner: b.owner, resource, count: b.type === 'city' ? 2 : 1 });
    }
  }

  // Clamp against what was actually gained (the bank can run dry).
  const used = new Map<string, number>();
  const flights: Flight[] = [];
  for (const g of raw) {
    const key = `${g.owner}|${g.resource}`;
    const cap = delta(before, after, g.owner, g.resource)
      - (excluded?.player === g.owner ? excluded.gains[g.resource] ?? 0 : 0);
    const already = used.get(key) ?? 0;
    const allow = Math.max(0, Math.min(g.count, cap - already));
    if (allow <= 0) continue;
    used.set(key, already + allow);
    flights.push(...cards(g.resource, { t: 'tile', tile: g.tile }, held(g.owner, g.resource, humanId), allow, flights.length * 40));
  }
  return flights;
}

/** Discarded cards fly from the player to the bank. */
function discardFlights(
  player: number,
  resources: Partial<Record<Resource, number>>,
  humanId: number,
): Flight[] {
  const flights: Flight[] = [];
  for (const r of RESOURCES) {
    const n = resources[r] ?? 0;
    if (n > 0) flights.push(...cards(r, held(player, r, humanId), { t: 'bank', resource: r }, n, flights.length * 60));
  }
  return flights;
}

/** The single stolen card flies from victim to thief (resource found by diff). */
function stealFlights(before: GameState, after: GameState, thief: number, humanId: number): Flight[] {
  for (let victim = 0; victim < before.players.length; victim++) {
    if (victim === thief) continue;
    for (const r of RESOURCES) {
      if (delta(before, after, victim, r) === -1 && delta(before, after, thief, r) === 1) {
        return cards(r, held(victim, r, humanId), held(thief, r, humanId), 1, 0);
      }
    }
  }
  return [];
}

function buyDevCardFlights(before: GameState, after: GameState, player: number, humanId: number): Flight[] {
  const payment = playerBankDiff(before, after, player, humanId);
  const to: Anchor = player === humanId ? { t: 'devHand' } : { t: 'devStack', id: player };
  return [
    ...payment,
    { id: uid(), resource: null, from: { t: 'devDeck' }, to, delay: payment.length * 55 },
  ];
}

/** Player↔bank movements (builds, dev cards, bank trades) from the diff. */
function playerBankDiff(before: GameState, after: GameState, player: number, humanId: number): Flight[] {
  const flights: Flight[] = [];
  for (const r of RESOURCES) {
    const d = delta(before, after, player, r);
    if (d < 0) flights.push(...cards(r, held(player, r, humanId), { t: 'bank', resource: r }, -d, flights.length * 55));
    else if (d > 0) flights.push(...cards(r, { t: 'bank', resource: r }, held(player, r, humanId), d, flights.length * 55));
  }
  return flights;
}

/** Player-to-player trade: each side's given cards fly to the other. */
function tradeFlights(before: GameState, after: GameState, me: number, partner: number, humanId: number): Flight[] {
  const flights: Flight[] = [];
  for (const r of RESOURCES) {
    const dMe = delta(before, after, me, r);
    if (dMe < 0) flights.push(...cards(r, held(me, r, humanId), held(partner, r, humanId), -dMe, flights.length * 55));
    else if (dMe > 0) flights.push(...cards(r, held(partner, r, humanId), held(me, r, humanId), dMe, flights.length * 55));
  }
  return flights;
}

/** Monopoly: every opponent's cards of that resource fly to the current player. */
function monopolyFlights(before: GameState, after: GameState, resource: Resource, taker: number, humanId: number): Flight[] {
  const flights: Flight[] = [];
  for (let p = 0; p < before.players.length; p++) {
    if (p === taker) continue;
    const lost = -delta(before, after, p, resource);
    if (lost > 0) flights.push(...cards(resource, held(p, resource, humanId), held(taker, resource, humanId), lost, flights.length * 40));
  }
  return flights;
}

/** Year of Plenty: two chosen cards fly from the bank to the player. */
function yearOfPlentyFlights(resources: Resource[], player: number, humanId: number): Flight[] {
  const flights: Flight[] = [];
  resources.forEach((r, i) => flights.push(...cards(r, { t: 'bank', resource: r }, held(player, r, humanId), 1, i * 120)));
  return flights;
}
