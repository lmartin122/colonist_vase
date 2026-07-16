import { useState } from 'react';

export function ChatPanel() {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card text-ink shadow-panel ring-1 ring-black/5 dark:ring-white/10">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 font-display font-extrabold"
      >
        <span>💬 Chat</span>
        <span className={`transition-transform ${open ? '' : 'rotate-180'}`}>⌃</span>
      </button>
      {open && (
        <div className="flex min-h-0 flex-1 flex-col border-t border-black/5 px-3 py-2 dark:border-white/10">
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto text-xs text-ink-soft">
            <p><b className="text-ink">Ada:</b> gl hf! 🎲</p>
            <p><b className="text-ink">Bram:</b> anyone got wheat?</p>
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
