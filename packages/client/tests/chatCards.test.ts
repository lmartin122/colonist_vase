import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { CardToken, containsCard, renderChatText, tokenPrefixAt } from '../src/ui/chatCards';

/** Pull the CardToken elements' props out of a renderChatText result. */
function cards(text: string): { token: string; frame: string; count?: number }[] {
  return renderChatText(text)
    .filter((node) => isValidElement(node) && node.type === CardToken)
    .map((node) => (node as { props: { token: string; frame: string; count?: number } }).props);
}

describe('renderChatText', () => {
  it('renders a plain resource token as a card with no count', () => {
    expect(cards('need :ore:')).toEqual([{ token: 'ore', frame: expect.any(String), count: undefined }]);
  });

  it('parses a leading count with or without a space', () => {
    expect(cards('dame 5 :ore: y te doy :wheat:')).toEqual([
      { token: 'ore', frame: expect.any(String), count: 5 },
      { token: 'wheat', frame: expect.any(String), count: undefined },
    ]);
    expect(cards('3:sheep:')).toEqual([{ token: 'sheep', frame: expect.any(String), count: 3 }]);
  });

  it('resolves aliases to the same card', () => {
    expect(cards(':lumber:')[0].frame).toBe(cards(':wood:')[0].frame);
  });

  it('supports development-card tokens', () => {
    expect(cards(':knight: and :vp:').map((c) => c.token)).toEqual(['knight', 'vp']);
  });

  it('leaves unknown tokens as plain text', () => {
    expect(cards('hello :banana: world')).toHaveLength(0);
  });

  it('keeps the surrounding text around a token', () => {
    // text "a ", the card, then text " b"
    expect(renderChatText('a :ore: b')).toHaveLength(3);
  });
});

describe('containsCard', () => {
  it('is true only when a complete, known token is present', () => {
    expect(containsCard('give me :ore:')).toBe(true);
    expect(containsCard('give me :ore')).toBe(false);
    expect(containsCard('give me :banana:')).toBe(false);
    expect(containsCard('3:wheat: please')).toBe(true);
  });
});

describe('tokenPrefixAt (autocomplete trigger)', () => {
  it('opens on a lone colon with an empty query', () => {
    expect(tokenPrefixAt(':', 1)).toEqual({ query: '', start: 0 });
    expect(tokenPrefixAt('gg :', 4)).toEqual({ query: '', start: 3 });
  });

  it('captures the query typed after the colon', () => {
    expect(tokenPrefixAt('dame :or', 8)).toEqual({ query: 'or', start: 5 });
    expect(tokenPrefixAt(':ORE', 4)).toEqual({ query: 'ore', start: 0 });
  });

  it('reopens after backspacing a completed token to :ore', () => {
    // ":ore:" → backspace drops the trailing colon → ":ore" reopens the picker.
    expect(tokenPrefixAt(':ore', 4)).toEqual({ query: 'ore', start: 0 });
  });

  it('is closed when the caret is not inside an open token', () => {
    expect(tokenPrefixAt('hello world', 11)).toBeNull();
    expect(tokenPrefixAt(':ore: done', 10)).toBeNull();
    expect(tokenPrefixAt('smile :)', 8)).toBeNull();
  });

  it('reads the token at the caret, not at the end of the text', () => {
    expect(tokenPrefixAt(':wo and more', 3)).toEqual({ query: 'wo', start: 0 });
  });
});
