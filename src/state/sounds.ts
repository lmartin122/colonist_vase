import type { Action } from '../engine/actions';
import { canAfford } from '../engine/helpers';
import { isConcurrentPhase } from '../engine/modes';
import type { GameState } from '../engine/types';

/**
 * Sound effects. Like the card-flight animations, the engine stays pure — we
 * derive "which sfx should play" purely from the action plus a diff of the
 * state before/after it. `deriveSounds` is a pure function (safe in tests/SSR);
 * `playSound` guards on `window` and no-ops when audio isn't available.
 */

const AUDIO = '/audios';

const FILES = {
  // Lobby / menu (reserved for the future multiplayer lobby).
  joinRoom: 'sfx_join_room.5961c5707bc03a482185.mp3',
  leaveRoom: 'sfx_leave_room.471d70cdfe103a4afdce.mp3',
  // In-game.
  click: 'sfx_click.9c3152cb7a312c82805e.mp3',
  yourTurn: 'sfx_your_turn.a14bdbd78995b7bec794.mp3',
  largestArmy: 'sfx_achievement_largest_army.ae919f6488a4e63c52fe.mp3',
  longestRoad: 'sfx_achievement_longest_road.f73b7c0ccdd0df577bca.mp3',
  gameStarted: 'sfx_game_started.361e1eda1fa0223d7a25.mp3',
  diceRoll1: 'sfx_dice_roll_1.72357fea36268b4d2746.mp3',
  diceRoll2: 'sfx_dice_roll_2.16053a8fd04ea7609f96.mp3',
  diceRoll3: 'sfx_dice_roll_3.61bd4619a24415ce2725.mp3',
  diceRoll4: 'sfx_dice_roll_4.ac72a311905cf5bfad2a.mp3',
  roadPlace: 'sfx_road_place.d101fe727f7ff45b8379.mp3',
  settlementPlace: 'sfx_settlement_place.c5c4ccb495e1499035b1.mp3',
  cityPlace: 'sfx_city_place.ef88a7889150162d1350.mp3',
  settlementPhaseEnded: 'sfx_settlement_phase_ended.7e282406bfa6bbac3eb7.mp3',
  robberPlace: 'sfx_robber_place.0636480d74972f958ca9.mp3',
  discardNotification: 'sfx_discard_notification.f8b0f8122a6973c3d615.mp3',
  discardBroadcast: 'sfx_discard_broadcast.6161a89619b65cc63577.mp3',
  offerAcceptable: 'sfx_offer_acceptable.a5cb7ea299386e908402.mp3',
  offerNotAcceptable: 'sfx_offer_not_acceptable.d7ca1b7b5f9dc94c6ec5.mp3',
  offerAccepted: 'sfx_offer_accepted.1db63c4d77a3569babd7.mp3',
  offerRejected: 'sfx_offer_rejected.9195821ea4c2ce7ae8a5.mp3',
} as const;

export type SoundKey = keyof typeof FILES;

/** Per-sound volume tweaks (the ubiquitous click stays subtle). */
const VOLUME: Partial<Record<SoundKey, number>> = {
  click: 0.3,
  gameStarted: 0.7,
  yourTurn: 0.7,
};
const DEFAULT_VOLUME = 0.55;

const DICE: SoundKey[] = ['diceRoll1', 'diceRoll2', 'diceRoll3', 'diceRoll4'];

const ENABLED_KEY = 'cv-sound';
let enabled = typeof window !== 'undefined' ? localStorage.getItem(ENABLED_KEY) !== 'off' : true;

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (typeof window !== 'undefined') localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off');
}

// One preloaded element per sound; we clone it per play so overlapping/rapid
// triggers (e.g. clicks) don't cut each other off.
const pool = new Map<SoundKey, HTMLAudioElement>();

function element(key: SoundKey): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  let el = pool.get(key);
  if (!el) {
    el = new Audio(`${AUDIO}/${FILES[key]}`);
    el.preload = 'auto';
    pool.set(key, el);
  }
  return el;
}

// Skip re-triggering the identical sound within this window so a burst of
// same-type bot actions (e.g. three settlements in a row in a Rush round)
// doesn't stack several full-volume copies on top of each other.
const REPEAT_COOLDOWN_MS = 150;
const lastPlayedAt = new Map<SoundKey, number>();

export function playSound(key: SoundKey): void {
  if (!enabled) return;
  const now = Date.now();
  const last = lastPlayedAt.get(key);
  if (last !== undefined && now - last < REPEAT_COOLDOWN_MS) return;
  const base = element(key);
  if (!base) return;
  lastPlayedAt.set(key, now);
  const node = base.cloneNode(true) as HTMLAudioElement;
  node.volume = VOLUME[key] ?? DEFAULT_VOLUME;
  // Autoplay can reject until the first user gesture; ignore that rejection.
  void node.play().catch(() => {});
}

export function playSounds(keys: SoundKey[]): void {
  for (const k of keys) playSound(k);
}

/** Warm the audio cache so the first real play has no fetch latency. */
export function preloadSounds(): void {
  for (const key of Object.keys(FILES) as SoundKey[]) element(key);
}

/** Derive the sfx an action produced by diffing state before/after it. */
export function deriveSounds(before: GameState, after: GameState, action: Action, humanId: number): SoundKey[] {
  const out: SoundKey[] = [];

  const startedRushRound = after.rules.mode === 'rush' && after.turn > before.turn && after.dice !== null;
  if (action.type === 'rollDice' || startedRushRound) out.push(DICE[Math.floor(Math.random() * DICE.length)]);
  if (action.type === 'buildRoad' || action.type === 'placeSetupRoad') out.push('roadPlace');
  if (action.type === 'buildSettlement' || action.type === 'placeSetupSettlement') out.push('settlementPlace');
  if (action.type === 'buildCity') out.push('cityPlace');
  if (action.type === 'moveRobber' || action.type === 'playKnight') out.push('robberPlace');

  // Everyone finished their opening settlements/roads — setup is over.
  if (before.phase === 'setup' && after.phase !== 'setup') out.push('settlementPhaseEnded');

  // Someone crossed the 7-card limit and must discard.
  if (before.phase !== 'discard' && after.phase === 'discard') {
    if ((after.pending.discards[humanId] ?? 0) > 0) out.push('discardNotification');
    else if (Object.values(after.pending.discards).some((n) => n > 0)) out.push('discardBroadcast');
  }

  // Award handoffs.
  if (after.largestArmy.player !== before.largestArmy.player && after.largestArmy.player !== null) out.push('largestArmy');
  if (after.longestRoad.player !== before.longestRoad.player && after.longestRoad.player !== null) out.push('longestRoad');

  // Player trade offers.
  if (action.type === 'createTradeOffer') {
    const offer = after.tradeOffers[after.tradeOffers.length - 1];
    if (offer) {
      if (offer.proposer === humanId) {
        // The human offered to everyone; bots respond synchronously. If nobody
        // took it, it's dead; otherwise wait for the human to confirm a partner.
        if (!Object.values(offer.responses).some((r) => r.status === 'accepted')) out.push('offerRejected');
      } else if (offer.responses[humanId]?.status === 'pending') {
        // Someone offered to the human — can they cover what's being asked for?
        out.push(canAfford(after.players[humanId].resources, offer.receive) ? 'offerAcceptable' : 'offerNotAcceptable');
      }
    }
  }
  // The proposer confirmed an accepting partner: the trade went through.
  if (action.type === 'completeTradeOffer') out.push('offerAccepted');

  // Control just handed to the human.
  if (before.currentPlayer !== humanId && after.currentPlayer === humanId && after.phase !== 'gameOver' && !isConcurrentPhase(after)) out.push('yourTurn');

  return out;
}
