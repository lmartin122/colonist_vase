import { useState } from 'react';
import { MAX_PORTS, exportPortLayout, portCount } from './ports';
import { useGame } from '../state/store';

/**
 * Lets a developer reposition ports directly on the board (e.g. to match the
 * real classic Catan layout) and export the result as a paste-able array for
 * `board.ts`. Isolated alongside `DebugPanel` so it can be removed together.
 */
export function PortEditor() {
  const game = useGame((s) => s.game);
  const active = useGame((s) => s.debugPortEditMode);
  const toggle = useGame((s) => s.toggleDebugPortEditMode);
  const [exported, setExported] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!game) return null;
  const count = portCount(game.board);

  return (
    <div className="mt-4 border-t border-ink/10 pt-3 dark:border-white/10">
      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-faint">Port layout</label>
      <button
        type="button"
        onClick={toggle}
        className={`w-full rounded-xl px-3 py-2 text-xs font-extrabold transition ${active ? 'bg-violet-700 text-white' : 'bg-card-alt text-ink hover:bg-ink/10'}`}
      >
        {active ? `Editing ports — ${count}/${MAX_PORTS} placed` : 'Edit ports'}
      </button>
      {active && (
        <p className="mt-2 text-[11px] text-ink-soft">
          Click a coastal edge to add a port there, or click an existing port to remove it. Types
          are assigned automatically from the official Catan set (four 3:1 + one 2:1 per resource)
          in clockwise order, so the ratio is always valid — you're only choosing where they sit.
        </p>
      )}
      <button
        type="button"
        onClick={() => { setExported(exportPortLayout(game.board)); setCopied(false); }}
        className="mt-2 w-full rounded-xl bg-card-alt px-3 py-2 text-xs font-extrabold text-ink transition hover:bg-ink/10"
      >
        Export layout
      </button>
      {exported && (
        <div className="mt-2">
          <p className="mb-1 text-[10px] text-ink-faint">One entry per coastal edge, in `coastalEdgesByAngle()` order — paste into board.ts.</p>
          <textarea
            readOnly
            value={exported}
            rows={6}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full resize-none rounded-lg bg-card-alt p-2 font-mono text-[10px] text-ink"
          />
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(exported); setCopied(true); }}
            className="mt-1 w-full rounded-xl bg-violet-700 px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-violet-600"
          >
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
      )}
    </div>
  );
}
