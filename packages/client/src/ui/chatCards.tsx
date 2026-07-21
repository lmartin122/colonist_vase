import type { ReactNode } from 'react';
import { DEV_CARD_FRAME, RESOURCE_CARD_FRAME } from '../assets';
import { PackedSprite } from './PackedSprite';

/**
 * Inline card shortcodes for chat. Typing `:ore:` (or an alias like `:rock:`)
 * renders the matching card art instead of the literal text, so a message like
 * "dame 5 :ore: y te doy :wheat:" shows the cards inline.
 */

/** token (lowercase, without the surrounding colons) → packed atlas frame. */
const TOKEN_FRAME: Record<string, string> = {
  // Resources — engine names.
  wood: RESOURCE_CARD_FRAME.wood,
  brick: RESOURCE_CARD_FRAME.brick,
  sheep: RESOURCE_CARD_FRAME.sheep,
  wheat: RESOURCE_CARD_FRAME.wheat,
  ore: RESOURCE_CARD_FRAME.ore,
  // Resources — common aliases (card art / Catan names).
  lumber: RESOURCE_CARD_FRAME.wood,
  clay: RESOURCE_CARD_FRAME.brick,
  wool: RESOURCE_CARD_FRAME.sheep,
  grain: RESOURCE_CARD_FRAME.wheat,
  rock: RESOURCE_CARD_FRAME.ore,
  // Development cards.
  knight: DEV_CARD_FRAME.knight,
  monopoly: DEV_CARD_FRAME.monopoly,
  roadbuilding: DEV_CARD_FRAME.roadBuilding,
  yearofplenty: DEV_CARD_FRAME.yearOfPlenty,
  victorypoint: DEV_CARD_FRAME.victoryPoint,
  // Development-card aliases.
  road: DEV_CARD_FRAME.roadBuilding,
  yop: DEV_CARD_FRAME.yearOfPlenty,
  vp: DEV_CARD_FRAME.victoryPoint,
};

/** Cards offered by the in-chat picker, in display order. */
export const RESOURCE_CARD_TOKENS: { token: string; frame: string }[] = [
  { token: 'wood', frame: RESOURCE_CARD_FRAME.wood },
  { token: 'brick', frame: RESOURCE_CARD_FRAME.brick },
  { token: 'sheep', frame: RESOURCE_CARD_FRAME.sheep },
  { token: 'wheat', frame: RESOURCE_CARD_FRAME.wheat },
  { token: 'ore', frame: RESOURCE_CARD_FRAME.ore },
];

export const DEV_CARD_TOKENS: { token: string; frame: string }[] = [
  { token: 'knight', frame: DEV_CARD_FRAME.knight },
  { token: 'monopoly', frame: DEV_CARD_FRAME.monopoly },
  { token: 'roadbuilding', frame: DEV_CARD_FRAME.roadBuilding },
  { token: 'yearofplenty', frame: DEV_CARD_FRAME.yearOfPlenty },
  { token: 'victorypoint', frame: DEV_CARD_FRAME.victoryPoint },
];

/** Resolve a token (including aliases) to its card frame, or undefined. */
export function cardFrame(token: string): string | undefined {
  return TOKEN_FRAME[token.toLowerCase()];
}

/**
 * One card rendered inline within a run of chat text. An optional `count`
 * (from a `5:ore:` / `5 :ore:` prefix) shows as a corner badge, matching the
 * count badges used on the board sidebar.
 */
export function CardToken({ token, frame, count }: { token: string; frame: string; count?: number }) {
  const label = count && count > 1 ? `${count} ${token}` : token;
  return (
    <span className="relative inline-block align-middle" role="img" aria-label={label}>
      <PackedSprite name={frame} className="inline-block h-[1.5em] w-[1.05em] drop-shadow-sm" />
      {count !== undefined && count > 1 && (
        <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-ink px-0.5 text-[9px] font-extrabold leading-none text-card ring-1 ring-white/40">
          {count}
        </span>
      )}
    </span>
  );
}

// Optional leading count (1–3 digits + one optional space), then `:token:`.
const TOKEN_RE = /(?:(\d{1,3})\s?)?:([a-zA-Z]+):/g;

/**
 * Detect a `:token` being typed just before `caret`, for the chat autocomplete.
 * Returns the lowercased query (text after the `:`) and the index of that `:`,
 * or null when the caret isn't inside an open token. An empty query (a lone
 * `:`) is valid and means "show every card".
 */
export function tokenPrefixAt(value: string, caret: number): { query: string; start: number } | null {
  const match = /:([a-zA-Z]*)$/.exec(value.slice(0, caret));
  return match ? { query: match[1].toLowerCase(), start: match.index } : null;
}

/** True if `text` contains at least one complete, known card token. */
export function containsCard(text: string): boolean {
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (TOKEN_FRAME[match[2].toLowerCase()]) return true;
  }
  return false;
}

/**
 * Split `text` into React nodes, replacing every known `:token:` with its card
 * image (carrying an optional leading count). Unknown tokens are left as plain
 * text so nothing is silently dropped.
 */
export function renderChatText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    const token = match[2].toLowerCase();
    const frame = TOKEN_FRAME[token];
    // A bare number with no known card after it stays as plain text.
    if (!frame) continue;
    const count = match[1] ? Number(match[1]) : undefined;
    if (match.index > lastIndex) nodes.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    nodes.push(<CardToken key={key++} token={token} frame={frame} count={count} />);
    lastIndex = TOKEN_RE.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return nodes;
}
