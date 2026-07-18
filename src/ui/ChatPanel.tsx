import { useState } from 'react';
import type { GameState } from '../engine/types';
import { PlayerIdentity } from './PlayerDecorations';

export function ChatPanel({ game, hideHeader = false, muted = false }: { game?: GameState; hideHeader?: boolean; muted?: boolean }) {
  const [open, setOpen] = useState(true);
  const previewPlayers = game?.players.slice(0, 2) ?? [];
  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl text-ink shadow-panel ring-1 ring-black/5 dark:ring-white/10 ${muted ? 'bg-card-alt/50' : 'bg-card'}`}>
      {!hideHeader && <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 font-display font-extrabold"
      >
        <span>💬 Chat</span>
        <span className={`transition-transform ${open ? '' : 'rotate-180'}`}>⌃</span>
      </button>}
      {open && (
        <div className={`flex min-h-0 flex-1 flex-col px-3 py-2 ${hideHeader ? '' : 'border-t border-black/5 dark:border-white/10'}`}>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto text-xs text-ink-soft">
            {previewPlayers[0] && <p><PlayerIdentity player={previewPlayers[0]} />: gl hf! 🎲</p>}
            {previewPlayers[1] && <p><PlayerIdentity player={previewPlayers[1]} />: anyone got wheat?</p>}
            <p className="text-ink-faint italic">Chat is a preview — coming soon.</p>
          </div>
          <input
            disabled
            placeholder="Type a message…"
            className="mt-2 w-full cursor-not-allowed rounded-lg bg-card-alt px-2.5 py-1.5 text-xs text-ink-faint outline-none"
          />
        </div>
      )}
    </div>
  );
}
