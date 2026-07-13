import { useState } from 'react';
import type { DevCardType } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { RESOURCE_CARD } from '../assets';
import { useGame } from '../state/store';

const DEV_CARDS: { value: DevCardType; label: string }[] = [
  { value: 'knight', label: 'Knight' },
  { value: 'roadBuilding', label: 'Road Building' },
  { value: 'monopoly', label: 'Monopoly' },
  { value: 'yearOfPlenty', label: 'Year of Plenty' },
  { value: 'victoryPoint', label: 'Victory Point' },
];

/**
 * Session-unlocked developer controls. This module is intentionally isolated so
 * it can be removed with its single Hud import once debugging is no longer needed.
 */
export function DebugPanel() {
  const enabled = useGame((s) => s.debugEnabled);
  const game = useGame((s) => s.game);
  const humanId = useGame((s) => s.humanId);
  const dispatch = useGame((s) => s.dispatch);
  const infiniteTimer = useGame((s) => s.debugInfiniteTimer);
  const toggleInfiniteTimer = useGame((s) => s.toggleDebugInfiniteTimer);
  const fastForwardTurn = useGame((s) => s.fastForwardTurn);
  const simulatePhase = useGame((s) => s.simulatePhase);
  const [open, setOpen] = useState(false);
  const [devCard, setDevCard] = useState<DevCardType>('knight');

  if (!enabled || !game) return null;
  const canTriggerRobber = game.currentPlayer === humanId && (game.phase === 'roll' || game.phase === 'main');
  const infiniteForCurrentTurn = infiniteTimer?.player === game.currentPlayer && infiniteTimer.turn === game.turn;

  return (
    <div className="pointer-events-auto fixed bottom-32 left-3 z-[60] font-sans sm:bottom-36">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-extrabold text-white shadow-panel transition hover:bg-violet-600"
      >
        {open ? 'Close debug' : 'Debug'}
      </button>
      {open && (
        <section className="mt-2 w-72 rounded-2xl bg-card p-4 text-ink shadow-pop ring-2 ring-violet-500/70 dark:ring-violet-400/70">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-base">🛠️</span>
            <h2 className="font-display text-lg font-extrabold">Debug tools</h2>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">Session</span>
          </div>

          <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-faint">Add cards</label>
          <p className="mb-2 text-[11px] text-ink-soft">Click: +1 · Shift-click: +5</p>
          <div className="flex justify-between gap-1.5">
            {RESOURCES.map((item) => (
              <button
                key={item}
                type="button"
                title={`Add ${item}`}
                onClick={(event) => dispatch({ type: 'debugAddResources', player: humanId, resources: { [item]: event.shiftKey ? 5 : 1 } })}
                className="rounded-xl bg-card-alt p-1.5 transition hover:-translate-y-0.5 hover:bg-ink/10 hover:shadow-soft"
              >
                <img src={RESOURCE_CARD[item]} alt={`Add ${item}`} className="h-12 w-9 rounded-md object-contain" draggable={false} />
              </button>
            ))}
          </div>

          <label className="mb-2 mt-4 block text-xs font-bold uppercase tracking-wide text-ink-faint">Grant progress card</label>
          <div className="flex gap-2">
            <select value={devCard} onChange={(event) => setDevCard(event.target.value as DevCardType)} className="min-w-0 flex-1 rounded-xl bg-card-alt px-2 py-2 text-sm font-bold text-ink ring-1 ring-black/5 dark:ring-white/10">
              {DEV_CARDS.map((card) => <option key={card.value} value={card.value}>{card.label}</option>)}
            </select>
            <button type="button" onClick={() => dispatch({ type: 'debugGrantDevCard', player: humanId, card: devCard })} className="rounded-xl bg-violet-700 px-3 text-sm font-extrabold text-white hover:bg-violet-600">Grant</button>
          </div>

          <button type="button" disabled={!canTriggerRobber} onClick={() => dispatch({ type: 'debugTriggerRobber' })} className={`mt-4 w-full rounded-xl px-3 py-2.5 text-sm font-extrabold transition ${canTriggerRobber ? 'bg-p-red text-white hover:brightness-110' : 'cursor-not-allowed bg-card-alt text-ink-faint'}`}>
            Place the Robber
          </button>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={toggleInfiniteTimer} className={`rounded-xl px-2 py-2 text-xs font-extrabold transition ${infiniteForCurrentTurn ? 'bg-violet-700 text-white' : 'bg-card-alt text-ink hover:bg-ink/10'}`}>
              {infiniteForCurrentTurn ? '∞ Time on' : '∞ Current time'}
            </button>
            <button type="button" onClick={fastForwardTurn} className="rounded-xl bg-card-alt px-2 py-2 text-xs font-extrabold text-ink transition hover:bg-ink hover:text-card">Fast-forward turn</button>
          </div>
          <button type="button" onClick={simulatePhase} className="mt-2 w-full rounded-xl bg-violet-700 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-violet-600">Simulate {game.phase}</button>
        </section>
      )}
    </div>
  );
}
