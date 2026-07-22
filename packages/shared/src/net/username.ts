/**
 * Username rules, shared so the client can validate as you type and the server
 * can enforce the same thing on the wire. Pure: no DOM, no node.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/** Letters, digits, spaces, `_` and `-`; must start and end with alphanumeric. */
const USERNAME_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N} _-]*[\p{L}\p{N}])?$/u;

/** Collapse internal whitespace and trim, so " ada  lovelace " → "ada lovelace". */
export function normalizeUsername(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** The form uniqueness is checked against. */
export function usernameKey(value: string): string {
  return normalizeUsername(value).toLowerCase();
}

/** Null when valid, otherwise a human-readable reason. */
export function validateUsername(value: string): string | null {
  const name = normalizeUsername(value);
  if (name.length < USERNAME_MIN_LENGTH) return `At least ${USERNAME_MIN_LENGTH} characters`;
  if (name.length > USERNAME_MAX_LENGTH) return `At most ${USERNAME_MAX_LENGTH} characters`;
  if (!USERNAME_PATTERN.test(name)) return 'Use letters, digits, spaces, - or _';
  return null;
}
