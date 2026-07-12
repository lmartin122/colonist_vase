import { useEffect, useRef, useState } from 'react';
import {
  CARD_DEV_BACK,
  CARD_HIDDEN,
  CARD_HIDDEN_WARNING,
  LARGEST_ARMY,
  LARGEST_ARMY_HL,
  LARGEST_ROAD,
  LARGEST_ROAD_HL,
  RESOURCE_CARD,
} from '../assets';
import { DISCARD_LIMIT, STARTING_STOCK } from '../engine/constants';
import { publicVictoryPoints, totalResources, victoryPoints } from '../engine/helpers';
import type { GameState, Player } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { PLAYER_CSS } from '../render/palette';
import { useGame } from '../state/store';

/**
 * Right game sidebar (colonist.io-style): event log, chat, an approximate bank
 * summary, and the per-player panels. Visible on md+; a compact fallback covers
 * small screens (see Hud).
 */
export function Sidebar({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const opponents = game.players.filter((p) => p.id !== humanId);
  const human = game.players[humanId];
  return (
    <aside className="pointer-events-auto absolute right-0 top-0 z-10 hidden h-full w-[300px] flex-col gap-2 p-2 md:flex lg:w-[330px]">
      <LogPane game={game} />
      <ChatPane />
      <BankSummary game={game} />
      <div className="flex flex-col gap-1.5">
        {opponents.map((p) => (
          <PlayerPanel key={p.id} game={game} player={p} isHuman={false} />
        ))}
      </div>
      <PlayerPanel game={game} player={human} isHuman />
    </aside>
  );
}

// --- Event log -------------------------------------------------------------

function LogPane({ game }: { game: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [game.log.length]);
  return (
    <div
      ref={ref}
      className="min-h-[110px] flex-1 overflow-y-auto rounded-2xl bg-card p-3 text-sm text-ink shadow-panel ring-1 ring-black/5 dark:ring-white/10"
    >
      {game.log.slice(-40).map((e, i) => (
        <div key={i} className="flex items-start gap-1.5 leading-6">
          {e.player !== null && (
            <span
              className="mt-2 h-2 w-2 shrink-0 rounded-full"
              style={{ background: PLAYER_CSS[game.players[e.player].color] }}
            />
          )}
          <span className={e.player === null ? 'text-ink-soft' : ''}>{e.message}</span>
        </div>
      ))}
    </div>
  );
}

// --- Chat (hardcoded template for now) -------------------------------------

function ChatPane() {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl bg-card text-ink shadow-panel ring-1 ring-black/5 dark:ring-white/10">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 font-display font-extrabold"
      >
        <span>💬 Chat</span>
        <span className={`transition-transform ${open ? '' : 'rotate-180'}`}>⌃</span>
      </button>
      {open && (
        <div className="border-t border-black/5 px-3 py-2 dark:border-white/10">
          <div className="max-h-24 space-y-1 overflow-y-auto text-xs text-ink-soft">
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

// --- Bank summary ----------------------------------------------------------

/** How many cards to fan out for an approximate count (1–3). */
function stackHeight(n: number): number {
  if (n >= 14) return 3;
  if (n >= 7) return 2;
  if (n >= 1) return 1;
  return 0;
}

function BankSummary({ game }: { game: GameState }) {
  return (
    <div className="flex items-center gap-1.5 rounded-2xl bg-card p-2 shadow-panel ring-1 ring-black/5 dark:ring-white/10">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card-alt text-xl" title="Bank">
        🏦
      </div>
      <div className="flex flex-1 items-end justify-around">
        {RESOURCES.map((r) => (
          <div key={r} data-bank={r}>
            <CardStack src={RESOURCE_CARD[r]} count={game.bank[r]} title={`${r}: ~${game.bank[r]}`} />
          </div>
        ))}
        <CardStack src={CARD_DEV_BACK} count={game.devDeck.length} title={`dev cards: ${game.devDeck.length}`} />
      </div>
    </div>
  );
}

function CardStack({ src, count, title }: { src: string; count: number; title: string }) {
  const h = stackHeight(count);
  return (
    <div className="relative h-9 w-7" title={title}>
      {h === 0 && <img src={src} className="absolute inset-x-0 bottom-0 mx-auto w-6 opacity-25 grayscale" alt="" />}
      {Array.from({ length: h }).map((_, i) => (
        <img
          key={i}
          src={src}
          alt=""
          className="absolute inset-x-0 mx-auto w-6 drop-shadow-sm"
          style={{ bottom: `${i * 4}px`, zIndex: i }}
        />
      ))}
    </div>
  );
}

// --- Player panel ----------------------------------------------------------

function PlayerPanel({ game, player, isHuman }: { game: GameState; player: Player; isHuman: boolean }) {
  const active = game.currentPlayer === player.id;
  const color = PLAYER_CSS[player.color];
  const vp = isHuman ? victoryPoints(game, player.id) : publicVictoryPoints(game, player.id);
  const handSize = totalResources(player.resources);
  const overLimit = handSize > DISCARD_LIMIT;
  const devCount = player.devCards.filter((c) => !c.played).length;
  const roadsBuilt = STARTING_STOCK.roads - player.stock.roads;
  const hasArmy = game.largestArmy.player === player.id;
  const hasRoad = game.longestRoad.player === player.id;

  return (
    <div
      data-player={player.id}
      className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 shadow-panel ring-1 transition ${
        isHuman ? 'bg-card' : 'bg-card/90'
      } ${active ? 'ring-2' : 'ring-black/5 dark:ring-white/10'}`}
      style={active ? { boxShadow: `0 0 0 2px ${color}, 0 6px 20px -6px rgba(20,30,40,.35)` } : undefined}
    >
      <Avatar color={color} isHuman={isHuman} vp={vp} active={active} big={isHuman} />
      <div className={`flex flex-1 items-center justify-between ${isHuman ? 'gap-2' : 'gap-1.5'}`}>
        {isHuman && <span className="mr-1 font-display text-lg font-extrabold text-ink">{player.name}</span>}
        {!isHuman && <span className="mr-auto font-display text-sm font-bold text-ink">{player.name}</span>}
        <CountCard src={overLimit ? CARD_HIDDEN_WARNING : CARD_HIDDEN} count={handSize} />
        <CountCard src={CARD_DEV_BACK} count={devCount} />
        <StatIcon
          src={hasArmy ? LARGEST_ARMY_HL : LARGEST_ARMY}
          count={player.knightsPlayed}
          title={hasArmy ? 'Largest Army' : 'Knights played'}
          lit={hasArmy}
        />
        <StatIcon
          src={hasRoad ? LARGEST_ROAD_HL : LARGEST_ROAD}
          count={roadsBuilt}
          title={hasRoad ? 'Longest Road' : 'Roads built'}
          lit={hasRoad}
        />
      </div>
    </div>
  );
}

function Avatar({ color, isHuman, vp, active, big }: { color: string; isHuman: boolean; vp: number; active: boolean; big?: boolean }) {
  const size = big ? 'h-14 w-14 text-2xl' : 'h-11 w-11 text-lg';
  return (
    <div className="relative flex shrink-0 flex-col items-center">
      <div
        className={`flex items-center justify-center rounded-full ${size} ${active ? 'ring-[3px]' : 'ring-2'}`}
        style={{ background: `${color}22`, boxShadow: `inset 0 0 0 2px ${color}` }}
      >
        <span>{isHuman ? '🎩' : '🤖'}</span>
      </div>
      {/* VP ribbon */}
      <div
        className="-mt-2 rounded-md px-2 text-xs font-extrabold text-white shadow-sm"
        style={{ background: color }}
        title="Victory points"
      >
        {vp}
      </div>
    </div>
  );
}

function CountCard({ src, count }: { src: string; count: number }) {
  return (
    <div className="relative h-10 w-[30px] shrink-0">
      <img src={src} alt="" className="h-full w-full object-contain drop-shadow-sm" />
      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-extrabold text-card ring-1 ring-white/40">
        {count}
      </span>
    </div>
  );
}

function StatIcon({ src, count, title, lit }: { src: string; count: number; title: string; lit: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-center" title={title}>
      <img
        src={src}
        alt=""
        className={`h-6 w-6 object-contain transition ${lit ? 'drop-shadow-[0_0_4px_rgba(255,196,60,.7)]' : 'opacity-70'}`}
      />
      <span className={`text-xs font-bold ${lit ? 'text-ink' : 'text-ink-soft'}`}>{count}</span>
    </div>
  );
}
