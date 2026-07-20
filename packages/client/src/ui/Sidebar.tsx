import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  CARD_DEV_BACK_FRAME,
  DEV_CARD_FRAME,
  CARD_HIDDEN,
  CARD_HIDDEN_WARNING,
  LARGEST_ARMY,
  LARGEST_ARMY_HL,
  LARGEST_ROAD,
  LARGEST_ROAD_HL,
  RESOURCE_CARD_FRAME,
  ROBBER_FRAME,
  cityFrame,
  diceAsset,
  roadFrame,
  settlementFrame,
} from '../assets';
import { RESOURCES, devDeckSize, handSize as handSizeOf, isConcurrentPhase, longestRoadLength, publicVictoryPoints, unplayedDevCount as unplayedDevCountOf, victoryPoints } from '@colonist/shared';
import type { GameState, LogEntry, Player, ResourceBundle } from '@colonist/shared';
import { PLAYER_CSS } from '../render/palette';
import { useGame } from '../state/store';
import { setRoadPathHover } from '../state/roadPathHover';
import { boardPreviewForLogEntry, setBoardPreview } from '../state/boardPreview';
import { ChatPanel } from './ChatPanel';
import { canRevealLogResources } from './history';
import { PackedSprite } from './PackedSprite';
import { PlayerIdentity, PlayerScorePortrait } from './PlayerDecorations';
import { StackedCard } from './StackedCard';
import { useRecentLogEntry } from './useRecentLogEntry';

/**
 * Right game sidebar (colonist.io-style): event log, chat, an approximate bank
 * summary, and the per-player panels. Visible on md+; a compact fallback covers
 * small screens (see Hud).
 */
export function Sidebar({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const lastEntry = useRecentLogEntry(game.log, 700);
  return (
    <aside className="pointer-events-auto absolute bottom-3 right-0 top-0 z-10 hidden w-[260px] flex-col gap-2 px-2 pt-2 md:flex lg:w-[280px] xl:w-[320px]">
      <HistoryChatPanels game={game} />
      <BankSummary game={game} />
      <div className="flex flex-col gap-1.5">
        {game.turnOrder.map((playerId) => (
          <PlayerPanel key={playerId} game={game} player={game.players[playerId]} isHuman={playerId === humanId} justActed={lastEntry?.player === playerId} />
        ))}
      </div>
    </aside>
  );
}
// --- Event log -------------------------------------------------------------

function LogPane({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const ref = useRef<HTMLDivElement>(null);
  const [lockedEntry, setLockedEntry] = useState<number | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [game.log.length]);
  return (
    <div className="min-h-0 overflow-hidden rounded-2xl bg-card shadow-panel ring-1 ring-black/5 dark:ring-white/10">
      <div ref={ref} className="h-full overflow-x-hidden overflow-y-auto p-3 text-sm text-ink">
        {game.log.slice(-40).map((e, i) => {
          const preview = boardPreviewForLogEntry(e, game);
          return (
          <div key={i} tabIndex={preview ? 0 : undefined} onMouseEnter={() => preview && setBoardPreview(preview)} onMouseLeave={() => lockedEntry === i ? undefined : setBoardPreview(null)} onFocus={() => preview && setBoardPreview(preview)} onBlur={() => lockedEntry === i ? undefined : setBoardPreview(null)} onClick={() => { if (!preview) return; const next = lockedEntry === i ? null : i; setLockedEntry(next); setBoardPreview(next === null ? null : preview); }} className={`flex items-start gap-1.5 rounded-lg leading-6 ${preview ? 'cursor-pointer px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-p-green' : ''} ${lockedEntry === i ? 'bg-ink/10' : ''}`}>
            <HistoryEntry entry={e} game={game} viewer={humanId} />
          </div>
        );})}
      </div>
    </div>
  );
}

function ResourceStacks({ resources }: { resources: ResourceBundle }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 py-0.5">
      {RESOURCES.filter((resource) => (resources[resource] ?? 0) > 0).map((resource) => (
        <StackedCard
          key={resource}
          sprite={RESOURCE_CARD_FRAME[resource]}
          alt={`${resources[resource]} ${resource} card${resources[resource] === 1 ? '' : 's'}`}
          count={resources[resource] ?? 0}
          direction="right"
          cardWidth={20}
          cardHeight={28}
          overlap={3}
          maxVisible={3}
          stacked={false}
        />
      ))}
    </div>
  );
}

function HiddenCards({ count, any = false }: { count: number; any?: boolean }) {
  return (
    <StackedCard
      src={any ? CARD_HIDDEN_WARNING : CARD_HIDDEN}
      alt={any ? `${count} card${count === 1 ? '' : 's'} of any resource` : `${count} hidden card${count === 1 ? '' : 's'}`}
      count={count}
      direction="right"
      cardWidth={20}
      cardHeight={28}
      overlap={3}
      maxVisible={3}
      stacked={false}
    />
  );
}

function HistoryDice({ dice }: { dice: [number, number] }) {
  return (
    <span className="inline-flex shrink-0 gap-0.5" title={`Rolled ${dice[0]} + ${dice[1]}`}>
      {dice.map((value, index) => (
        <img key={`${index}-${value}`} src={diceAsset(value)} alt={`Die showing ${value}`} className="h-6 w-6" />
      ))}
    </span>
  );
}

function HistoryEntry({ entry, game, viewer }: { entry: LogEntry; game: GameState; viewer: number }) {
  const details = entry.details;
  if (!details) return <PlainHistoryMessage entry={entry} game={game} />;
  const actor = entry.player === null ? null : game.players[entry.player];
  const rich = 'flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5';

  switch (details.type) {
    case 'dice':
      return (
        <div className={rich}>
          {details.context === 'rushRound'
            ? <span>{`Round ${entry.turn} begins —`}</span>
            : <>{actor && <PlayerIdentity player={actor} />}<span>rolled</span></>}
          <HistoryDice dice={details.dice} />
          <span>({details.dice[0] + details.dice[1]})</span>
          {details.context === 'startingOrder' && <span>for starting order</span>}
        </div>
      );
    case 'piece': {
      if (entry.player === null) return <span>{entry.message}</span>;
      const color = game.players[entry.player].color;
      const frame = details.piece === 'road' ? roadFrame(color) : details.piece === 'city' ? cityFrame(color) : settlementFrame(color);
      return (
        <div className={rich}>
          {actor && <PlayerIdentity player={actor} />}<span>{details.verb} a</span>
          <PackedSprite name={frame} alt={`${color} ${details.piece}`} className="h-8 w-8 shrink-0 object-contain" />
        </div>
      );
    }
    case 'developmentCard':
      return (
        <div className={rich}>
          {actor && <PlayerIdentity player={actor} />}<span>bought a</span>
          <PackedSprite name={CARD_DEV_BACK_FRAME} alt="Development card" className="h-8 w-6 shrink-0 rounded object-contain" />
        </div>
      );
    case 'resourceGain':
      return (
        <div className={rich}>
          {actor && <PlayerIdentity player={actor} />}<span>got</span><ResourceStacks resources={details.resources} />
          {details.source === 'setup' && <span>from initial placement</span>}
          {details.source === 'yearOfPlenty' && <><span>with</span><PackedSprite name={DEV_CARD_FRAME.yearOfPlenty} alt="Year of Plenty" className="h-8 w-6 shrink-0 rounded object-contain" /></>}
        </div>
      );
    case 'trade':
      return (
        <div className={rich}>
          {actor && <PlayerIdentity player={actor} />}<span>traded</span><ResourceStacks resources={details.give} /><span>for</span>
          <ResourceStacks resources={details.receive} />
          <span>with</span>{details.kind === 'bank' ? <span>the bank</span> : <PlayerIdentity player={game.players[details.partner!]} />}
        </div>
      );
    case 'tradeOffer':
      return (
        <div className={rich}>
          {actor && <PlayerIdentity player={actor} />}<span>proposed</span><ResourceStacks resources={details.give} /><span>for</span>
          <ResourceStacks resources={details.receive} />
          {details.anyCount > 0 && <HiddenCards count={details.anyCount} any />}
        </div>
      );
    case 'discard':
      return (
        <div className={rich}>
          {actor && <PlayerIdentity player={actor} />}<span>had to discard</span>
          <ResourceStacks resources={details.resources} />
        </div>
      );
    case 'steal':
      return (
        <div className={rich}>
          {actor && <PlayerIdentity player={actor} />}<span>stole</span>
          {canRevealLogResources(entry, viewer)
            ? <ResourceStacks resources={{ [details.resource]: 1 }} />
            : <HiddenCards count={1} />}
          <span>from</span><PlayerIdentity player={game.players[details.victim]} />
        </div>
      );
    case 'monopoly':
      return details.count > 0 ? (
        <div className={rich}>
          {actor && <PlayerIdentity player={actor} />}<span>took</span><ResourceStacks resources={{ [details.resource]: details.count }} /><span>with Monopoly</span>
        </div>
      ) : <div className={rich}>{actor && <PlayerIdentity player={actor} />}<span>played Monopoly but took no cards</span></div>;
    case 'robber':
      return <div className={rich}>{actor && <PlayerIdentity player={actor} />}<span>moved the robber</span></div>;
  }
}

function PlainHistoryMessage({ entry, game }: { entry: LogEntry; game: GameState }) {
  const players = game.players.filter((player) => entry.message.includes(player.name));
  if (players.length === 0) return <span className={entry.player === null ? 'text-ink-soft' : ''}>{entry.message}</span>;
  const pattern = new RegExp(`(${players.map((player) => player.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const byName = new Map(players.map((player) => [player.name, player]));
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1">
      {entry.message.split(pattern).filter(Boolean).map((part, index) => {
        const player = byName.get(part);
        return player ? <PlayerIdentity key={`${part}-${index}`} player={player} /> : <span key={`${part}-${index}`}>{part}</span>;
      })}
    </span>
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
            <StackedCard
              sprite={RESOURCE_CARD_FRAME[r]}
              count={game.rules.hideBankCards ? 1 : game.bank[r]}
              alt={r}
              title={game.rules.hideBankCards ? `${r}: hidden` : `${r}: ${game.bank[r]}`}
              direction="up"
              cardWidth={24}
              cardHeight={36}
              overlap={4}
              visibleCount={stackHeight(game.rules.hideBankCards ? 1 : game.bank[r])}
            />
          </div>
        ))}
        <div data-dev-deck>
          <StackedCard
            sprite={CARD_DEV_BACK_FRAME}
            count={game.rules.hideBankCards ? 1 : devDeckSize(game)}
            alt="Development card"
            title={game.rules.hideBankCards ? 'dev cards: hidden' : `dev cards: ${devDeckSize(game)}`}
            direction="up"
            cardWidth={24}
            cardHeight={36}
            overlap={4}
            visibleCount={stackHeight(game.rules.hideBankCards ? 1 : devDeckSize(game))}
          />
        </div>
      </div>
    </div>
  );
}

// --- Player panel ----------------------------------------------------------

function PlayerPanel({ game, player, isHuman, justActed }: { game: GameState; player: Player; isHuman: boolean; justActed?: boolean }) {
  const concurrent = isConcurrentPhase(game);
  const active = concurrent ? !game.pending.passed[player.id] : game.currentPlayer === player.id;
  const currentTurn = !concurrent && active;
  const passed = concurrent ? !!game.pending.passed[player.id] : undefined;
  const color = PLAYER_CSS[player.color];
  const vp = isHuman ? victoryPoints(game, player.id) : publicVictoryPoints(game, player.id);
  const handSize = handSizeOf(player);
  const overLimit = handSize > game.rules.discardLimit;
  const devCount = unplayedDevCountOf(player);
  const roadLength = longestRoadLength(game, player.id);
  const hasArmy = game.largestArmy.player === player.id;
  const hasRoad = game.longestRoad.player === player.id;
  const shownDice = game.phase === 'startingRoll'
    ? game.startingRoll?.rolls[player.id] ?? null
    : (concurrent ? player.id === game.pending.roundCaptain : active) ? game.dice : null;
  const turnStyle = currentTurn ? {
    backgroundColor: 'rgb(var(--card))',
    backgroundImage: `linear-gradient(100deg, ${color}78 0%, ${color}3D 42%, rgb(var(--card)) 82%)`,
    boxShadow: `0 0 0 4px ${color}, 0 10px 28px -6px ${color}99`,
  } : active && !justActed ? { boxShadow: `0 0 0 3px ${color}, 0 8px 24px -6px rgba(20,30,40,.45)` } : {};

  return (
    <div
      data-player={player.id}
      data-current-turn={currentTurn || undefined}
      className={`relative flex items-center gap-2 overflow-hidden rounded-2xl px-2.5 py-2 shadow-panel ring-1 transition-all ${
        isHuman ? 'bg-card' : 'bg-card/90'
      } ${currentTurn ? 'ring-2' : justActed ? 'ring-2 ring-p-green' : active ? 'bg-card-alt ring-2' : 'ring-black/5 dark:ring-white/10'}`}
      style={turnStyle}
    >
      {currentTurn && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2" style={{ backgroundColor: color }} />}
      <div className="flex w-16 shrink-0 flex-col items-center self-stretch justify-center">
        <PlayerScorePortrait player={player} points={vp} ribbon="large" className="h-16 w-16" />
      </div>
      {shownDice && <RollDice dice={shownDice} />}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        {(game.phase === 'moveRobber' || game.phase === 'discard') && game.currentPlayer === player.id && <PackedSprite name={ROBBER_FRAME} alt="Must move the robber" className="h-7 w-7" />}
        {player.botDifficulty && <span title={`${player.botDifficulty} bot`} className="rounded-md bg-ink/10 px-1 py-0.5 text-[8px] font-extrabold uppercase text-ink-soft">{player.botDifficulty[0]}</span>}
        {passed !== undefined && <span title={passed ? 'Passed / ready' : 'Still deciding'} className="text-xs">{passed ? '✅' : '⏳'}</span>}
        <div className="flex items-center gap-0.5">
          <CountCard src={overLimit ? CARD_HIDDEN_WARNING : CARD_HIDDEN} count={handSize} playerId={player.id} />
          <div data-dev-stack={player.id}>
            <CountCard sprite={CARD_DEV_BACK_FRAME} count={devCount} />
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <StatIcon
            src={hasArmy ? LARGEST_ARMY_HL : LARGEST_ARMY}
            count={player.knightsPlayed}
            title={hasArmy ? 'Largest Army' : 'Knights played'}
            lit={hasArmy}
          />
          <StatIcon
            src={hasRoad ? LARGEST_ROAD_HL : LARGEST_ROAD}
            count={roadLength}
            title={hasRoad ? 'Longest Road' : 'Longest continuous road'}
            lit={hasRoad}
            onMouseEnter={() => setRoadPathHover(player.id)}
            onMouseLeave={() => setRoadPathHover(null)}
          />
        </div>
      </div>
    </div>
  );
}

function historyChatRows(historyPercent: number): string {
  return `minmax(0, ${historyPercent}fr) 10px minmax(0, ${100 - historyPercent}fr)`;
}

function HistoryChatPanels({ game }: { game: GameState }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [historyPercent, setHistoryPercent] = useState(52);
  const livePercent = useRef(historyPercent);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const host = hostRef.current;
    if (!host) return;
    const bounds = host.getBoundingClientRect();
    const percent = ((event.clientY - bounds.top) / bounds.height) * 100;
    livePercent.current = Math.min(78, Math.max(22, percent));
    host.style.gridTemplateRows = historyChatRows(livePercent.current);
  };
  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setHistoryPercent(livePercent.current);
  };

  return (
    <div ref={hostRef} className="grid min-h-[220px] flex-1 overflow-hidden" style={{ gridTemplateRows: historyChatRows(historyPercent) }}>
      <LogPane game={game} />
      <div
        role="separator"
        aria-label="Resize history and chat panels"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(historyPercent)}
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        className="group flex cursor-row-resize touch-none items-center justify-center"
      >
        <span className="h-1 w-14 rounded-full bg-white/20 opacity-0 shadow-sm transition group-hover:bg-white/70 group-hover:opacity-100 group-active:bg-white group-active:opacity-100" />
      </div>
      <ChatPanel game={game} />
    </div>
  );
}

function RollDice({ dice }: { dice: [number, number] }) {
  return (
    <div className="flex shrink-0 gap-0.5" title={`Rolled ${dice[0]} + ${dice[1]} = ${dice[0] + dice[1]}`}>
      {dice.map((value, index) => (
        <img key={`${index}-${value}`} src={diceAsset(value)} alt={`Die showing ${value}`} className="h-6 w-6 drop-shadow-sm" />
      ))}
    </div>
  );
}

function CountCard({ src, sprite, count, playerId }: { src?: string; sprite?: string; count: number; playerId?: number }) {
  return (
    <div data-player-cards={playerId} className="relative h-10 w-[30px] shrink-0">
      {sprite
        ? <PackedSprite name={sprite} className="h-full w-full object-contain drop-shadow-sm" />
        : <img src={src} alt="" className="h-full w-full object-contain drop-shadow-sm" />}
      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-extrabold text-card ring-1 ring-white/40">
        {count}
      </span>
    </div>
  );
}

function StatIcon({ src, count, title, lit, onMouseEnter, onMouseLeave }: { src: string; count: number; title: string; lit: boolean; onMouseEnter?: () => void; onMouseLeave?: () => void }) {
  return (
    <div className="flex shrink-0 flex-col items-center" title={title} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <img
        src={src}
        alt=""
        className={`h-6 w-6 object-contain transition ${lit ? 'drop-shadow-[0_0_4px_rgba(255,196,60,.7)]' : 'opacity-70'}`}
      />
      <span className={`text-xs font-bold ${lit ? 'text-ink' : 'text-ink-soft'}`}>{count}</span>
    </div>
  );
}
