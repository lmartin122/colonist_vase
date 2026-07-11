/**
 * Deterministic, serializable pseudo-random number generator (mulberry32).
 *
 * The whole engine is a pure function of (state, action). Any randomness — dice
 * rolls, board shuffling, dev-card deck order — flows through an RNG whose seed
 * lives inside GameState. Same seed + same actions => identical game, which makes
 * the engine replayable, testable, and safe to run authoritatively on a server.
 */
export interface RngState {
  seed: number;
}

/** Advance the generator, returning the next float in [0, 1) and the new state. */
export function nextFloat(rng: RngState): { value: number; rng: RngState } {
  let a = rng.seed | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rng: { seed: a } };
}

/** Integer in [min, max] inclusive. */
export function nextInt(
  rng: RngState,
  min: number,
  max: number,
): { value: number; rng: RngState } {
  const { value, rng: next } = nextFloat(rng);
  return { value: min + Math.floor(value * (max - min + 1)), rng: next };
}

/** A single six-sided die. */
export function rollDie(rng: RngState): { value: number; rng: RngState } {
  return nextInt(rng, 1, 6);
}

/** Fisher–Yates shuffle; returns a new array and the advanced RNG. */
export function shuffle<T>(items: readonly T[], rng: RngState): { items: T[]; rng: RngState } {
  const out = items.slice();
  let cursor = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const { value, rng: next } = nextInt(cursor, 0, i);
    cursor = next;
    [out[i], out[value]] = [out[value], out[i]];
  }
  return { items: out, rng: cursor };
}

/** Derive a fresh seed from a string (e.g. a room code) for reproducible games. */
export function seedFromString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
