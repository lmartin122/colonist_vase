import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { RESOURCES, type DevCardType } from '@colonist/shared';
import { useGame } from '../state/store';
import { emptyProfileStats, loadProfileStats, normalizeProfileStats, type OverallProfileStats } from '../state/profileStats';
import { PlayerIcon } from './PlayerDecorations';
import { UsernameDialog } from './UsernameDialog';
import { SERVER_URL } from '../auth/config';

type Page = 'overview' | 'dice' | 'resources' | 'building' | 'activity' | 'progress' | 'online';
const PAGES: Page[] = ['overview', 'dice', 'resources', 'building', 'activity', 'progress', 'online'];
interface OnlineGameRow {
  id: string;
  endedAt: string;
  won: boolean;
  abandoned: boolean;
  finalVp: number;
  players: { name: string }[];
}
const DEV_LABELS: Record<DevCardType, string> = {
  knight: 'Knights',
  roadBuilding: 'Road Building',
  monopoly: 'Monopoly',
  yearOfPlenty: 'Year of Plenty',
  victoryPoint: 'VP cards',
};

export function ProfileModal({ open, onClose, accountName = 'Your profile', onLogout, getOnlineToken, username, onSaveUsername }: { open: boolean; onClose: () => void; accountName?: string; onLogout?: () => void; getOnlineToken?: () => Promise<string>; username?: string | null; onSaveUsername?: (username: string) => Promise<string | null> }) {
  const [page, setPage] = useState<Page>('overview');
  const [renaming, setRenaming] = useState(false);
  const [statsScope, setStatsScope] = useState<'offline' | 'online'>(getOnlineToken ? 'online' : 'offline');
  const [offlineStats, setOfflineStats] = useState<OverallProfileStats>(loadProfileStats);
  const [onlineStats, setOnlineStats] = useState<OverallProfileStats | null>(null);
  const debugEnabled = useGame((state) => state.debugEnabled);
  const enableDebug = useGame((state) => state.enableDebug);
  const [onlineGames, setOnlineGames] = useState<OnlineGameRow[] | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const onlineLoading = statsScope === 'online' && onlineStats === null && !onlineError;
  const stats = statsScope === 'online' ? (onlineStats ?? emptyProfileStats()) : offlineStats;

  useEffect(() => {
    if (!open) return;
    setOfflineStats(loadProfileStats());
    setStatsScope(getOnlineToken ? 'online' : 'offline');
    setPage('overview');
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [getOnlineToken, open, onClose]);

  useEffect(() => {
    if (!open || !getOnlineToken) return;
    let cancelled = false;
    setOnlineGames(null);
    setOnlineError(null);
    setOnlineStats(null);
    getOnlineToken()
      .then(async (token) => {
        const headers = { Authorization: `Bearer ${token}` };
        const [gamesResponse, statsResponse] = await Promise.all([
          fetch(`${SERVER_URL}/me/games`, { headers }),
          fetch(`${SERVER_URL}/me/stats`, { headers }),
        ]);
        if (!gamesResponse.ok || !statsResponse.ok) throw new Error(`HTTP ${gamesResponse.ok ? statsResponse.status : gamesResponse.status}`);
        return {
          games: await gamesResponse.json() as OnlineGameRow[],
          stats: normalizeProfileStats(await statsResponse.json()),
        };
      })
      .then((result) => {
        if (cancelled) return;
        setOnlineGames(result.games);
        setOnlineStats(result.stats);
      })
      .catch((error: unknown) => { if (!cancelled) setOnlineError(error instanceof Error ? error.message : 'Could not load online history'); });
    return () => { cancelled = true; };
  }, [getOnlineToken, open, reloadKey]);

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
              <div className="min-w-0">
                <h2 id="profile-title" className="flex items-center gap-2 font-display text-xl font-extrabold">
                  <span className="truncate">{accountName}</span>
                  {onSaveUsername && (
                    <button
                      type="button"
                      onClick={() => setRenaming(true)}
                      title="Change your username"
                      aria-label="Change your username"
                      className="shrink-0 rounded-lg bg-card-alt px-2 py-1 text-xs font-bold text-ink-soft transition hover:bg-ink/10 hover:text-ink"
                    >
                      ✏️
                    </button>
                  )}
                </h2>
                <p className={`text-xs ${statsScope === 'online' && onlineError ? 'font-bold text-p-red' : 'text-ink-soft'}`}>
                  {statsScope === 'online'
                    ? onlineError
                      ? `Could not load server statistics (${onlineError})`
                      : onlineStats
                        ? 'Online statistics saved on the server'
                        : 'Loading server statistics…'
                    : 'Offline games against bots saved on this device'}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close profile" className="ml-auto flex h-11 w-11 items-center justify-center rounded-xl bg-card-alt text-xl font-bold text-ink transition hover:bg-ink/10">×</button>
            </header>

            {getOnlineToken && <div className="flex justify-center border-b border-ink/10 bg-card-alt/40 p-2 dark:border-white/10"><div role="group" aria-label="Statistics source" className="flex rounded-xl bg-card-alt p-1"><button type="button" onClick={() => setStatsScope('offline')} aria-pressed={statsScope === 'offline'} className={`min-h-9 rounded-lg px-4 text-xs font-extrabold transition ${statsScope === 'offline' ? 'bg-card text-ink shadow-soft' : 'text-ink-soft hover:bg-ink/10'}`}>Offline · Bots only</button><button type="button" onClick={() => setStatsScope('online')} aria-pressed={statsScope === 'online'} className={`min-h-9 rounded-lg px-4 text-xs font-extrabold transition ${statsScope === 'online' ? 'bg-card text-ink shadow-soft' : 'text-ink-soft hover:bg-ink/10'}`}>Online</button></div></div>}

            <nav aria-label="Profile statistics" className="flex shrink-0 gap-1 overflow-x-auto bg-card-alt/70 p-2">
              {PAGES.map((item) => <button key={item} type="button" onClick={() => setPage(item)} className={`min-h-11 min-w-max flex-1 rounded-xl px-3 text-xs font-extrabold capitalize transition ${page === item ? 'bg-card text-ink shadow-soft' : 'text-ink-soft hover:bg-ink/10'}`}>{item}</button>)}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {page === 'online' ? (
                <OnlineHistory games={onlineGames} error={onlineError} enabled={Boolean(getOnlineToken)} />
              ) : statsScope === 'online' && onlineError ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <p className="text-sm font-bold text-p-red">Could not load your online statistics.</p>
                  <p className="max-w-sm text-xs text-ink-soft">{onlineError}</p>
                  <button
                    type="button"
                    onClick={() => setReloadKey((key) => key + 1)}
                    className="rounded-xl bg-p-blue px-4 py-2 text-sm font-extrabold text-white transition hover:brightness-105"
                  >
                    Try again
                  </button>
                </div>
              ) : statsScope === 'online' && onlineLoading ? (
                <p className="py-10 text-center text-sm text-ink-soft">Loading your online statistics…</p>
              ) : (
                <>
                  {page === 'overview' && <Overview stats={stats} showAbandoned={statsScope === 'online'} />}
                  {page === 'dice' && <DiceProfileStats stats={stats} />}
                  {page === 'resources' && <StatGrid>{RESOURCES.map((resource) => <Stat key={resource} label={resource} value={stats.matchStats.resourcesCollected[resource]} />)}<Stat label="Total resources" value={RESOURCES.reduce((sum, resource) => sum + stats.matchStats.resourcesCollected[resource], 0)} /></StatGrid>}
                  {page === 'building' && <StatGrid><Stat label="Roads placed" value={stats.matchStats.roadsPlaced} /><Stat label="Towns placed" value={stats.matchStats.settlementsPlaced} /><Stat label="Cities built" value={stats.matchStats.citiesBuilt} /><Stat label="Longest Road awards" value={stats.longestRoadAwards} /><Stat label="Best road" value={stats.bestLongestRoad} /><Stat label="Combined road length" value={stats.totalLongestRoad} /></StatGrid>}
                  {page === 'activity' && <StatGrid><Stat label="Turns taken" value={stats.matchStats.turnsTaken} /><Stat label="Bank trades" value={stats.matchStats.bankTrades} /><Stat label="Player trades" value={stats.matchStats.playerTrades} /><Stat label="Trade offers" value={stats.matchStats.tradeOffers} /><Stat label="Robber moved" value={stats.matchStats.robberMoves} /><Stat label="Cards stolen" value={stats.matchStats.cardsStolen} /><Stat label="Cards discarded" value={stats.matchStats.cardsDiscarded} /><Stat label="Largest Army awards" value={stats.largestArmyAwards} /></StatGrid>}
                  {page === 'progress' && <StatGrid>{(Object.keys(DEV_LABELS) as DevCardType[]).map((type) => <Stat key={type} label={DEV_LABELS[type]} value={stats.matchStats.devCardsCollected[type]} />)}<Stat label="Cards bought" value={stats.matchStats.devCardsBought} /><Stat label="Cards played" value={stats.matchStats.devCardsPlayed} /></StatGrid>}
                </>
              )}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-ink/10 p-4 dark:border-white/10">
              <div className="min-w-0 flex-1"><p className="text-sm font-extrabold">Debug tools</p><p className="text-xs text-ink-soft">Enable developer controls for this session.</p></div>
              <button type="button" disabled={debugEnabled} onClick={enableDebug} className={`min-h-11 rounded-xl px-4 text-sm font-extrabold transition ${debugEnabled ? 'cursor-default bg-p-green/15 text-p-green' : 'bg-violet-700 text-white hover:bg-violet-600'}`}>{debugEnabled ? 'Debug enabled' : 'Enable debug'}</button>
              {onLogout && <button type="button" onClick={onLogout} className="min-h-11 rounded-xl bg-p-red/15 px-4 text-sm font-extrabold text-p-red transition hover:bg-p-red hover:text-white">Log out</button>}
            </footer>
            {onSaveUsername && (
              <UsernameDialog
                open={renaming}
                current={username ?? null}
                dismissable
                onClose={() => setRenaming(false)}
                onSave={onSaveUsername}
              />
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function OnlineHistory({ games, error, enabled }: { games: OnlineGameRow[] | null; error: string | null; enabled: boolean }) {
  if (!enabled) return <p className="text-sm text-ink-soft">Log in to see your online match history.</p>;
  if (error) return <p className="text-sm text-p-red">Could not load online history ({error}).</p>;
  if (!games) return <p className="text-sm text-ink-soft">Loading online history…</p>;
  if (!games.length) return <p className="text-sm text-ink-soft">No online matches recorded yet.</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="text-ink-faint"><tr><th className="py-2">Date</th><th>Result</th><th>VP</th><th>Players</th></tr></thead><tbody>{games.map((game) => <tr key={game.id} className="border-t border-ink/10"><td className="py-2">{new Date(game.endedAt).toLocaleDateString()}</td><td className={game.won ? 'font-bold text-p-green' : 'text-ink-soft'}>{game.abandoned ? 'Abandoned' : game.won ? 'Win' : 'Loss'}</td><td>{game.finalVp}</td><td className="text-ink-soft">{game.players.map((player) => player.name).join(', ')}</td></tr>)}</tbody></table></div>;
}

function Overview({ stats, showAbandoned }: { stats: OverallProfileStats; showAbandoned: boolean }) {
  const winRate = stats.gamesPlayed ? `${Math.round(stats.wins / stats.gamesPlayed * 100)}%` : '0%';
  const averagePoints = stats.gamesPlayed ? (stats.totalVictoryPoints / stats.gamesPlayed).toFixed(1) : '0';
  return <StatGrid><Stat label="Games" value={stats.gamesPlayed} /><Stat label="Wins" value={stats.wins} /><Stat label="Losses" value={stats.gamesPlayed - stats.wins} />{showAbandoned && <Stat label="Abandoned games" value={stats.abandonedGames} />}<Stat label="Win rate" value={winRate} /><Stat label="Total VP" value={stats.totalVictoryPoints} /><Stat label="Average VP" value={averagePoints} /><Stat label="Best VP" value={stats.bestVictoryPoints} /><Stat label="Play time" value={formatDuration(stats.totalDurationMs)} /><Stat label="Classic" value={`${stats.classicWins} / ${stats.classicGames}`} /><Stat label="Rush" value={`${stats.rushWins} / ${stats.rushGames}`} /></StatGrid>;
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
