import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { RESOURCES, type DevCardType } from '../engine/types';
import { useGame } from '../state/store';
import { loadProfileStats, type OverallProfileStats } from '../state/profileStats';
import { PlayerIcon } from './PlayerDecorations';

type Page = 'overview' | 'dice' | 'resources' | 'building' | 'activity' | 'progress';
const PAGES: Page[] = ['overview', 'dice', 'resources', 'building', 'activity', 'progress'];
const DEV_LABELS: Record<DevCardType, string> = {
  knight: 'Knights',
  roadBuilding: 'Road Building',
  monopoly: 'Monopoly',
  yearOfPlenty: 'Year of Plenty',
  victoryPoint: 'VP cards',
};

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [page, setPage] = useState<Page>('overview');
  const [stats, setStats] = useState<OverallProfileStats>(loadProfileStats);
  const debugEnabled = useGame((state) => state.debugEnabled);
  const enableDebug = useGame((state) => state.enableDebug);

  useEffect(() => {
    if (!open) return;
    setStats(loadProfileStats());
    setPage('overview');
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/55 p-3 font-sans sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-card text-ink shadow-pop ring-1 ring-black/10 dark:ring-white/15"
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-ink/10 p-4 dark:border-white/10">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-card-alt ring-2 ring-p-green/70"><PlayerIcon isBot={false} className="h-8 w-8" /></span>
              <div><h2 id="profile-title" className="font-display text-xl font-extrabold">Your profile</h2><p className="text-xs text-ink-soft">Overall statistics saved on this device</p></div>
              <button type="button" onClick={onClose} aria-label="Close profile" className="ml-auto flex h-11 w-11 items-center justify-center rounded-xl bg-card-alt text-xl font-bold text-ink transition hover:bg-ink/10">×</button>
            </header>

            <nav aria-label="Profile statistics" className="flex shrink-0 gap-1 overflow-x-auto bg-card-alt/70 p-2">
              {PAGES.map((item) => <button key={item} type="button" onClick={() => setPage(item)} className={`min-h-11 min-w-max flex-1 rounded-xl px-3 text-xs font-extrabold capitalize transition ${page === item ? 'bg-card text-ink shadow-soft' : 'text-ink-soft hover:bg-ink/10'}`}>{item}</button>)}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {page === 'overview' && <Overview stats={stats} />}
              {page === 'dice' && <DiceProfileStats stats={stats} />}
              {page === 'resources' && <StatGrid>{RESOURCES.map((resource) => <Stat key={resource} label={resource} value={stats.matchStats.resourcesCollected[resource]} />)}<Stat label="Total resources" value={RESOURCES.reduce((sum, resource) => sum + stats.matchStats.resourcesCollected[resource], 0)} /></StatGrid>}
              {page === 'building' && <StatGrid><Stat label="Roads placed" value={stats.matchStats.roadsPlaced} /><Stat label="Towns placed" value={stats.matchStats.settlementsPlaced} /><Stat label="Cities built" value={stats.matchStats.citiesBuilt} /><Stat label="Longest Road awards" value={stats.longestRoadAwards} /><Stat label="Best road" value={stats.bestLongestRoad} /><Stat label="Combined road length" value={stats.totalLongestRoad} /></StatGrid>}
              {page === 'activity' && <StatGrid><Stat label="Turns taken" value={stats.matchStats.turnsTaken} /><Stat label="Bank trades" value={stats.matchStats.bankTrades} /><Stat label="Player trades" value={stats.matchStats.playerTrades} /><Stat label="Trade offers" value={stats.matchStats.tradeOffers} /><Stat label="Robber moved" value={stats.matchStats.robberMoves} /><Stat label="Cards stolen" value={stats.matchStats.cardsStolen} /><Stat label="Cards discarded" value={stats.matchStats.cardsDiscarded} /><Stat label="Largest Army awards" value={stats.largestArmyAwards} /></StatGrid>}
              {page === 'progress' && <StatGrid>{(Object.keys(DEV_LABELS) as DevCardType[]).map((type) => <Stat key={type} label={DEV_LABELS[type]} value={stats.matchStats.devCardsCollected[type]} />)}<Stat label="Cards bought" value={stats.matchStats.devCardsBought} /><Stat label="Cards played" value={stats.matchStats.devCardsPlayed} /></StatGrid>}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-ink/10 p-4 dark:border-white/10">
              <div className="min-w-0 flex-1"><p className="text-sm font-extrabold">Debug tools</p><p className="text-xs text-ink-soft">Enable developer controls for this session.</p></div>
              <button type="button" disabled={debugEnabled} onClick={enableDebug} className={`min-h-11 rounded-xl px-4 text-sm font-extrabold transition ${debugEnabled ? 'cursor-default bg-p-green/15 text-p-green' : 'bg-violet-700 text-white hover:bg-violet-600'}`}>{debugEnabled ? 'Debug enabled' : 'Enable debug'}</button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Overview({ stats }: { stats: OverallProfileStats }) {
  const winRate = stats.gamesPlayed ? `${Math.round(stats.wins / stats.gamesPlayed * 100)}%` : '0%';
  const averagePoints = stats.gamesPlayed ? (stats.totalVictoryPoints / stats.gamesPlayed).toFixed(1) : '0';
  return <StatGrid><Stat label="Games" value={stats.gamesPlayed} /><Stat label="Wins" value={stats.wins} /><Stat label="Losses" value={stats.gamesPlayed - stats.wins} /><Stat label="Win rate" value={winRate} /><Stat label="Total VP" value={stats.totalVictoryPoints} /><Stat label="Average VP" value={averagePoints} /><Stat label="Best VP" value={stats.bestVictoryPoints} /><Stat label="Play time" value={formatDuration(stats.totalDurationMs)} /><Stat label="Classic" value={`${stats.classicWins} / ${stats.classicGames}`} /><Stat label="Rush" value={`${stats.rushWins} / ${stats.rushGames}`} /></StatGrid>;
}

function DiceProfileStats({ stats }: { stats: OverallProfileStats }) {
  const rolls = Array.from({ length: 11 }, (_, index) => index + 2);
  const total = rolls.reduce((sum, roll) => sum + (stats.diceRolls[roll] ?? 0), 0);
  const peak = Math.max(1, ...rolls.map((roll) => stats.diceRolls[roll] ?? 0));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[620px] grid-cols-11 gap-2 border-b border-ink/10 px-2 pt-3">
        {rolls.map((roll) => {
          const value = stats.diceRolls[roll] ?? 0;
          const percent = total ? Math.round(value / total * 100) : 0;
          const height = value > 0 ? Math.max(5, value / peak * 100) : 0;
          return (
            <div key={roll} title={`${roll}: ${value} rolls (${percent}%)`} className="flex h-64 flex-col items-center justify-end">
              <span className="mb-1 text-xs font-extrabold tabular-nums text-ink">{value}</span>
              <div className="flex h-48 w-full items-end justify-center">
                <div className="w-full max-w-12 rounded-t-lg bg-p-blue shadow-soft transition-all" style={{ height: `${height}%` }} />
              </div>
              <span className="mt-1 text-[9px] text-ink-faint">{percent}%</span>
              <span className="pb-2 font-display text-lg font-extrabold text-ink">{roll}</span>
            </div>
          );
        })}
      </div>
      <div className="pt-3 text-sm font-extrabold text-ink">Total rolls: {total}</div>
    </div>
  );
}

function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="min-h-20 rounded-xl bg-card-alt p-3 ring-1 ring-ink/5"><span className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">{label}</span><strong className="mt-1 block font-display text-2xl font-extrabold tabular-nums text-ink">{value}</strong></div>;
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
