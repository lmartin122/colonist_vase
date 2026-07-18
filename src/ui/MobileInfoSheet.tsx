import { useEffect, useRef, useState } from 'react';
import { CARD_DEV_BACK_FRAME, RESOURCE_CARD_FRAME } from '../assets';
import { publicVictoryPoints, totalResources, victoryPoints } from '../engine/helpers';
import { longestRoadLength } from '../engine/longestRoad';
import type { GameState, Player } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { useGame } from '../state/store';
import { ChatPanel } from './ChatPanel';
import { PackedSprite } from './PackedSprite';
import { PlayerIcon } from './PlayerDecorations';

type Tab = 'players' | 'bank' | 'history' | 'chat';
const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'players', label: 'Players', icon: '♟' }, { id: 'bank', label: 'Bank', icon: '▣' },
  { id: 'history', label: 'History', icon: '≡' }, { id: 'chat', label: 'Chat', icon: '●' },
];

export function MobileInfoSheet({ game }: { game: GameState }) {
  const humanId = useGame((state) => state.humanId);
  const [tab, setTab] = useState<Tab | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPlayer(null); setTab(null); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, []);

  return (
    <div data-mobile-info className="pointer-events-none fixed inset-0 z-[24] md:hidden">
      {tab && <button aria-label="Close information panel" onClick={() => setTab(null)} className="pointer-events-auto absolute inset-0 bg-ink/20" />}
      {tab && (
        <section ref={sheetRef} role="dialog" aria-label={`${tab} information`} className="pointer-events-auto absolute bottom-[240px] left-2 right-2 max-h-[50vh] overflow-hidden rounded-2xl bg-card p-3 text-ink shadow-pop ring-1 ring-black/10 dark:ring-white/15">
          <header className="mb-2 flex min-h-11 items-center justify-between border-b border-ink/10 pb-2"><h2 className="font-display text-lg font-extrabold capitalize">{tab}</h2><button onClick={() => setTab(null)} aria-label="Close" className="h-11 w-11 rounded-xl bg-card-alt text-lg">×</button></header>
          <div className="max-h-[calc(55vh-4rem)] overflow-y-auto">
            {tab === 'players' && <div className="grid grid-cols-2 gap-2">{game.turnOrder.map((id) => { const item = game.players[id]; return <button key={id} onClick={() => setPlayer(item)} className="flex min-h-14 items-center gap-2 rounded-xl bg-card-alt p-2 text-left"><PlayerIcon isBot={item.isBot} className="h-8 w-8" /><span className="min-w-0"><span className="block truncate font-bold">{item.name}</span><span className="text-xs text-ink-soft">{id === humanId ? victoryPoints(game, id) : publicVictoryPoints(game, id)} VP</span></span></button>; })}</div>}
            {tab === 'bank' && <div className="grid grid-cols-3 gap-2">{RESOURCES.map((resource) => <div key={resource} className="flex min-h-16 items-center gap-2 rounded-xl bg-card-alt p-2"><PackedSprite name={RESOURCE_CARD_FRAME[resource]} className="h-12 w-9" /><span className="font-extrabold">{game.rules.hideBankCards ? '?' : game.bank[resource]}</span></div>)}<div className="flex min-h-16 items-center gap-2 rounded-xl bg-card-alt p-2"><PackedSprite name={CARD_DEV_BACK_FRAME} className="h-12 w-9" /><span className="font-extrabold">{game.rules.hideBankCards ? '?' : game.devDeck.length}</span></div></div>}
            {tab === 'history' && <div className="space-y-1 text-sm">{game.log.slice(-40).map((entry, index) => <div key={index} className="rounded-lg bg-card-alt/60 px-2 py-1.5">{entry.message}</div>)}</div>}
            {tab === 'chat' && <div className="h-64"><ChatPanel game={game} hideHeader /></div>}
          </div>
        </section>
      )}
      <nav aria-label="Game information" className="pointer-events-auto absolute bottom-[184px] left-1/2 flex -translate-x-1/2 overflow-hidden rounded-2xl bg-card shadow-panel ring-1 ring-black/10 dark:ring-white/15">
        {TABS.map((item) => <button key={item.id} onClick={() => setTab(tab === item.id ? null : item.id)} aria-pressed={tab === item.id} className={`flex min-h-11 min-w-16 flex-col items-center justify-center px-2 text-[10px] font-bold ${tab === item.id ? 'bg-ink text-card' : 'text-ink-soft'}`}><span className="text-base leading-none">{item.icon}</span>{item.label}</button>)}
      </nav>
      {player && <PlayerDetail game={game} player={player} humanId={humanId} onClose={() => setPlayer(null)} />}
    </div>
  );
}

function PlayerDetail({ game, player, humanId, onClose }: { game: GameState; player: Player; humanId: number; onClose: () => void }) {
  const points = player.id === humanId ? victoryPoints(game, player.id) : publicVictoryPoints(game, player.id);
  return <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-ink/35 p-4" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-label={`${player.name} details`} className="w-full max-w-xs rounded-2xl bg-card p-4 text-ink shadow-pop"><header className="flex items-center gap-2"><PlayerIcon isBot={player.isBot} className="h-10 w-10" /><h2 className="font-display text-xl font-extrabold">{player.name}</h2><button onClick={onClose} className="ml-auto h-11 w-11 rounded-xl bg-card-alt">×</button></header><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><Stat label="Victory points" value={points} /><Stat label="Cards" value={totalResources(player.resources)} /><Stat label="Development" value={player.devCards.filter((card) => !card.played).length} /><Stat label="Knights" value={player.knightsPlayed} /><Stat label="Road length" value={longestRoadLength(game, player.id)} /><Stat label="Status" value={game.currentPlayer === player.id ? 'Current turn' : 'Waiting'} /></dl></section></div>;
}

function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-card-alt p-2"><dt className="text-[10px] font-bold uppercase text-ink-faint">{label}</dt><dd className="font-extrabold">{value}</dd></div>; }
