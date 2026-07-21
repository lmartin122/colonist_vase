import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_CHAT_LENGTH, type ChatMessage } from '@colonist/shared';
import { PLAYER_CSS } from '../render/palette';
import { useOnline } from '../state/online';
import { PackedSprite } from './PackedSprite';
import { DEV_CARD_TOKENS, RESOURCE_CARD_TOKENS, cardFrame, renderChatText, tokenPrefixAt } from './chatCards';
import { buildCardChip, readEditorValue } from './chatEditor';

interface Menu {
  open: boolean;
  /** Lowercased text typed after the `:` (empty = show every card). */
  query: string;
}

const CLOSED: Menu = { open: false, query: '' };

/** Where the `:query` being typed lives, so a pick can replace exactly it. */
interface Prefix {
  node: Node;
  start: number;
  end: number;
}

/**
 * Room chat, shared by the start-screen lobby and the in-game sidebar. Chat is
 * a feature of an online room, so it goes live only while connected to one;
 * local (vs-bots) play shows a short hint instead.
 *
 * The composer is a WYSIWYG contenteditable field: a completed `:ore:` becomes
 * an inline card "chip" you can see as you type (via the `:` autocomplete or by
 * typing it out). Because a chip is atomic, backspacing it decomposes it back to
 * the editable text `:ore` — which reopens the picker — instead of vanishing.
 */
export function ChatPanel({ hideHeader = false, muted = false }: { hideHeader?: boolean; muted?: boolean }) {
  const [open, setOpen] = useState(true);
  const [hasContent, setHasContent] = useState(false);
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState<Menu>(CLOSED);
  const [menuIndex, setMenuIndex] = useState(0);
  const messages = useOnline((s) => s.messages);
  const room = useOnline((s) => s.room);
  const mySeat = useOnline((s) => s.seat);
  const status = useOnline((s) => s.status);
  const spectating = useOnline((s) => s.spectating);
  const send = useOnline((s) => s.sendChat);

  const online = Boolean(room);
  const canSend = online && status === 'connected' && !spectating;
  const listRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const prefixRef = useRef<Prefix | null>(null);

  const allTokens = useMemo(() => [...RESOURCE_CARD_TOKENS, ...DEV_CARD_TOKENS], []);
  const suggestions = useMemo(
    () => (menu.open ? (menu.query ? allTokens.filter((c) => c.token.includes(menu.query)) : allTokens) : []),
    [allTokens, menu.open, menu.query],
  );
  const menuVisible = canSend && menu.open && suggestions.length > 0;
  const activeIndex = Math.min(menuIndex, suggestions.length - 1);

  useEffect(() => {
    const el = listRef.current;
    if (el && open) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!canSend) setMenu(CLOSED);
  }, [canSend]);

  const closeMenu = () => {
    prefixRef.current = null;
    setMenu((m) => (m.open ? CLOSED : m));
  };

  /** Recompute the value and whether the composer is empty. */
  const syncContent = () => {
    const editor = editorRef.current;
    if (!editor) return '';
    const value = readEditorValue(editor);
    if (value === '' && editor.innerHTML !== '') editor.innerHTML = ''; // drop a stray <br>
    setHasContent(value.trim().length > 0);
    return value;
  };

  /** Update the autocomplete from the `:token` (if any) at the caret. */
  const syncMenu = () => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return closeMenu();
    const range = sel.getRangeAt(0);
    if (!range.collapsed || !editor.contains(range.startContainer) || range.startContainer.nodeType !== Node.TEXT_NODE) {
      return closeMenu();
    }
    const before = (range.startContainer.textContent ?? '').slice(0, range.startOffset);
    const prefix = tokenPrefixAt(before, before.length);
    if (!prefix) return closeMenu();
    prefixRef.current = { node: range.startContainer, start: prefix.start, end: range.startOffset };
    setMenu({ open: true, query: prefix.query });
    setMenuIndex(0);
  };

  const placeCaretAfter = (node: Node) => {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  /** Turn a completed `:token:` just typed before the caret into a chip. */
  const autoChip = () => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed || range.startContainer.nodeType !== Node.TEXT_NODE) return;
    const node = range.startContainer;
    const before = (node.textContent ?? '').slice(0, range.startOffset);
    const match = /:([a-zA-Z]+):$/.exec(before);
    if (!match) return;
    const frame = cardFrame(match[1]);
    if (!frame) return;
    const replace = document.createRange();
    replace.setStart(node, range.startOffset - match[0].length);
    replace.setEnd(node, range.startOffset);
    replace.deleteContents();
    const chip = buildCardChip(match[1].toLowerCase(), frame);
    replace.insertNode(chip);
    placeCaretAfter(chip);
  };

  /** Insert the picked card, replacing any `:query` being typed. */
  const insertToken = (token: string) => {
    const editor = editorRef.current;
    const frame = cardFrame(token);
    if (!editor || !frame) return;
    editor.focus();
    const chip = buildCardChip(token, frame);
    const prefix = prefixRef.current;
    if (prefix && editor.contains(prefix.node)) {
      const range = document.createRange();
      range.setStart(prefix.node, prefix.start);
      range.setEnd(prefix.node, Math.min(prefix.end, prefix.node.textContent?.length ?? prefix.end));
      range.deleteContents();
      range.insertNode(chip);
    } else {
      const sel = window.getSelection();
      const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      if (range && editor.contains(range.startContainer)) range.insertNode(chip);
      else editor.appendChild(chip);
    }
    placeCaretAfter(chip);
    closeMenu();
    syncContent();
  };

  /** Backspace on a chip decomposes it to `:token` text instead of deleting it. */
  const decomposeChipBeforeCaret = (): boolean => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || !sel.isCollapsed || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    let chip: HTMLElement | null = null;
    if (range.startContainer === editor && range.startOffset > 0) {
      const prev = editor.childNodes[range.startOffset - 1];
      if (prev instanceof HTMLElement && prev.dataset.token) chip = prev;
    } else if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
      const prev = range.startContainer.previousSibling;
      if (prev instanceof HTMLElement && prev.dataset.token) chip = prev;
    }
    if (!chip) return false;
    const text = document.createTextNode(`:${chip.dataset.token}`);
    chip.replaceWith(text);
    const caret = document.createRange();
    caret.setStart(text, text.length);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    syncContent();
    syncMenu();
    return true;
  };

  const submit = async () => {
    const editor = editorRef.current;
    if (!editor || !canSend || sending) return;
    const text = readEditorValue(editor).trim();
    if (!text) return;
    setSending(true);
    const ok = await send(text.slice(0, MAX_CHAT_LENGTH));
    setSending(false);
    if (ok) {
      editor.innerHTML = '';
      closeMenu();
      syncContent();
    }
  };

  /** 🃏 button: toggle the picker, honoring any `:token` already at the caret. */
  const toggleMenu = () => {
    if (menu.open) {
      closeMenu();
      return;
    }
    editorRef.current?.focus();
    syncMenu();
    setMenu((m) => (m.open ? m : { open: true, query: '' }));
    setMenuIndex(0);
  };

  const placeholder = !online
    ? 'Available in online games'
    : spectating
      ? 'Spectators can’t chat'
      : status !== 'connected'
        ? 'Reconnecting…'
        : 'Message… type : for cards';

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl text-ink shadow-panel ring-1 ring-black/5 dark:ring-white/10 ${muted ? 'bg-card-alt/50' : 'bg-card'}`}
    >
      {!hideHeader && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-2 font-display font-extrabold"
        >
          <span>💬 Chat</span>
          <span className={`transition-transform ${open ? '' : 'rotate-180'}`}>⌃</span>
        </button>
      )}
      {open && (
        <div
          className={`flex min-h-0 flex-1 flex-col px-3 py-2 ${hideHeader ? '' : 'border-t border-black/5 dark:border-white/10'}`}
        >
          <div ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto text-xs text-ink-soft">
            {messages.length === 0 ? (
              <p className="italic text-ink-faint">
                {online ? 'No messages yet. Say hi! 👋' : 'Chat is available in online games.'}
              </p>
            ) : (
              messages.map((message) => (
                <ChatLine key={message.id} message={message} mine={message.seat === mySeat && mySeat !== null} />
              ))
            )}
          </div>

          <div className="relative mt-2 flex items-end gap-1.5">
            {menuVisible && (
              <CardMenu
                suggestions={suggestions}
                activeIndex={activeIndex}
                onHover={setMenuIndex}
                onPick={insertToken}
              />
            )}
            <button
              type="button"
              onClick={toggleMenu}
              disabled={!canSend}
              aria-label="Insert a card"
              aria-expanded={menu.open}
              title="Insert a card"
              className={`flex-none self-stretch rounded-lg px-2 text-sm ring-1 ring-black/5 transition disabled:cursor-not-allowed disabled:opacity-40 dark:ring-white/10 ${menu.open ? 'bg-ink text-card' : 'bg-card-alt text-ink hover:bg-ink/10'}`}
            >
              🃏
            </button>
            <div
              ref={editorRef}
              role="textbox"
              aria-label="Chat message"
              aria-multiline="false"
              contentEditable={canSend}
              suppressContentEditableWarning
              data-placeholder={placeholder}
              onInput={() => {
                autoChip();
                syncContent();
                syncMenu();
              }}
              onKeyUp={syncMenu}
              onClick={syncMenu}
              onBlur={() => window.setTimeout(closeMenu, 120)}
              onPaste={(event) => {
                event.preventDefault();
                const text = event.clipboardData.getData('text/plain');
                if (text) document.execCommand('insertText', false, text);
              }}
              onKeyDown={(event) => {
                if (menuVisible) {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setMenuIndex((i) => (i + 1) % suggestions.length);
                    return;
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setMenuIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
                    return;
                  }
                  if (event.key === 'Enter' || event.key === 'Tab') {
                    event.preventDefault();
                    insertToken(suggestions[activeIndex].token);
                    return;
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closeMenu();
                    return;
                  }
                }
                if (event.key === 'Backspace' && decomposeChipBeforeCaret()) {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submit();
                }
              }}
              className={`chat-editor min-h-[34px] max-h-24 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-card-alt px-2.5 py-1.5 text-xs leading-relaxed text-ink outline-none ring-1 ring-black/5 focus-visible:ring-p-green empty:before:pointer-events-none empty:before:text-ink-faint empty:before:content-[attr(data-placeholder)] dark:ring-white/10 ${canSend ? '' : 'cursor-not-allowed opacity-60'}`}
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSend || !hasContent || sending}
              aria-label="Send message"
              className="flex-none self-stretch rounded-lg bg-p-green px-2.5 text-xs font-extrabold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Autocomplete list of cards, floating above the composer. */
function CardMenu({
  suggestions,
  activeIndex,
  onHover,
  onPick,
}: {
  suggestions: { token: string; frame: string }[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (token: string) => void;
}) {
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1.5 max-h-44 overflow-y-auto rounded-xl bg-card p-1 shadow-pop ring-1 ring-black/10 dark:ring-white/15">
      {suggestions.map((card, index) => (
        <button
          key={card.token}
          type="button"
          // Keep the caret in the editor by not stealing focus on click.
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHover(index)}
          onClick={() => onPick(card.token)}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs font-bold transition ${index === activeIndex ? 'bg-card-alt ring-1 ring-p-green' : 'hover:bg-card-alt'}`}
        >
          <PackedSprite name={card.frame} alt={card.token} className="h-7 w-5 shrink-0 drop-shadow-sm" />
          <span className="text-ink">:{card.token}:</span>
        </button>
      ))}
    </div>
  );
}

function ChatLine({ message, mine }: { message: ChatMessage; mine: boolean }) {
  if (message.system) {
    return <p className="italic text-ink-faint">{message.text}</p>;
  }
  return (
    <p className="break-words leading-relaxed">
      <span
        className="font-extrabold"
        style={{ color: message.color ? PLAYER_CSS[message.color] : undefined }}
      >
        {mine ? 'You' : message.name}
      </span>
      <span className="text-ink-faint">: </span>
      <span className="text-ink">{renderChatText(message.text)}</span>
    </p>
  );
}
