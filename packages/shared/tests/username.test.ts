import { describe, expect, it } from 'vitest';
import { normalizeUsername, usernameKey, validateUsername } from '../src/net/username';

describe('normalizeUsername', () => {
  it('trims and collapses internal whitespace', () => {
    expect(normalizeUsername('  ada   lovelace  ')).toBe('ada lovelace');
  });
});

describe('usernameKey', () => {
  it('folds case so two spellings collide', () => {
    expect(usernameKey('Ada')).toBe(usernameKey('  aDA '));
  });
});

describe('validateUsername', () => {
  it('accepts reasonable names', () => {
    for (const name of ['ada', 'Ada Lovelace', 'bram_99', 'cleo-2', 'Ñandú']) {
      expect(validateUsername(name)).toBeNull();
    }
  });

  it('rejects names that are too short or too long', () => {
    expect(validateUsername('ab')).toContain('At least');
    expect(validateUsername('a'.repeat(21))).toContain('At most');
  });

  it('measures length after normalizing', () => {
    expect(validateUsername('  ab  ')).toContain('At least');
    expect(validateUsername(` ${'a'.repeat(20)} `)).toBeNull();
  });

  it('rejects disallowed characters and stray edges', () => {
    expect(validateUsername('ada!')).not.toBeNull();
    expect(validateUsername('_ada')).not.toBeNull();
    expect(validateUsername('ada-')).not.toBeNull();
    expect(validateUsername('a@b.com')).not.toBeNull();
  });
});
