import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CARD_DEV_BACK, DEV_CARD_ART, RESOURCE_CARD, TRADE_ICON, cityAsset, diceAsset, roadAsset, settlementAsset } from '../assets';
import { nextBotAction } from '../ai/bot';
import { COSTS, VP_LARGEST_ARMY, VP_LONGEST_ROAD } from '../engine/constants';
import { canAfford, publicVictoryPoints, totalResources, victoryPoints } from '../engine/helpers';
import { longestRoadLength } from '../engine/longestRoad';
import type { DevCardType, GameState, Player, Resource } from '../engine/types';
import { emptyBank, RESOURCES } from '../engine/types';
import { PLAYER_CSS } from '../render/palette';
import { useGame } from '../state/store';
import { CardFlights } from './CardFlights';
import { SoundManager } from './SoundManager';
import { DebugPanel } from '../debug/DebugPanel';
import { Sidebar } from './Sidebar';
import { TradePanel } from './TradePanel';
import { TradeOffersPanel } from './TradeOffersPanel';
import { StackedCard } from './StackedCard';

type Bag = Record<Resource, number>;
const zeroBag = emptyBank;

/** A resource shown as its card art — used everywhere a resource is depicted. */
function ResCard({ resource, size = 16 }: { resource: Resource; size?: number }) {
  return (
    <img
      src={RESOURCE_CARD[resource]}
      alt={resource}
      draggable={false}
      style={{ width: size }}
      className="inline-block rounded-[3px] object-contain align-middle"
    />
  );
}

export function Hud() {
  const game = useGame((s) => s.game);
  if (!game) return null;
  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans">
      {/* Play area (left of the sidebar on md+). */}
      <div className="absolute inset-y-0 left-0 right-0 md:right-[300px] lg:right-[330px]">
        <TopBar game={game} />
        <AbandonButton />
        <PhaseGuide game={game} />
        <div className="md:hidden">
          <PlayersColumn game={game} />
        </div>
        <HumanDock game={game} />
      </div>
      <Sidebar game={game} />
      <TradeOffersPanel game={game} />
      <VictoryOverlay game={game} />
      <ErrorToast />
      <CardFlights />
      <SoundManager />
      <DebugPanel />
    </div>
  );
}

// --- shared styles ---------------------------------------------------------

const CARD = 'rounded-2xl bg-card text-ink shadow-panel ring-1 ring-black/5 dark:ring-white/15';
const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-xl font-bold transition-all duration-200 ease-smooth active:scale-[0.96] disabled:cursor-not-allowed';

function Cost({ cost }: { cost: Partial<Record<Resource, number>> }) {
  return (
    <span className="inline-flex items-center gap-1">
      {RESOURCES.filter((r) => cost[r]).map((r) => (
        <span key={r} className="inline-flex items-center">
          <ResCard resource={r} size={12} />
          <span className="ml-0.5 text-[11px] font-bold">{cost[r]}</span>
        </span>
      ))}
    </span>
  );
}

// --- Top bar ---------------------------------------------------------------

function TopBar({ game }: { game: GameState }) {
  const thinking = useGame((s) => s.thinking);
  const active = game.players[game.currentPlayer];
  return (
    <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 sm:top-4 sm:gap-3">
      <div className={`flex items-center gap-2 px-3 py-2 sm:px-4 ${CARD}`}>
        <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: PLAYER_CSS[active.color] }} />
        <span className="font-display text-sm font-extrabold sm:text-base">{active.name}</span>
        <span className="text-ink-faint">·</span>
        <span className="text-xs text-ink-soft sm:text-sm">{PHASE_LABEL[game.phase]}</span>
        <span className="text-ink-faint">·</span>
        <span className="text-xs font-bold tabular-nums text-ink-soft">{game.turn > 0 ? `Turn ${game.turn}` : 'Setup'}</span>
        <MatchElapsed />
        <TurnCountdown game={game} />
        {thinking && <span className="ml-0.5 animate-pulse text-[11px] text-ink-faint">thinking…</span>}
      </div>
    </div>
  );
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function MatchElapsed() {
  const startedAt = useGame((state) => state.matchStartedAt);
  const endedAt = useGame((state) => state.matchEndedAt);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt || endedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt, endedAt]);
  if (!startedAt) return null;
  return <span title="Match time" className="rounded-lg bg-ink/10 px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-ink-soft">{formatDuration((endedAt ?? now) - startedAt)}</span>;
}

function AbandonButton() {
  const abandonGame = useGame((s) => s.abandonGame);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title="Abandon game"
        aria-label="Abandon game"
        className="pointer-events-auto absolute left-2 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-xl bg-card text-ink shadow-panel ring-1 ring-black/5 transition hover:bg-p-red hover:text-white sm:left-3 sm:top-4 dark:ring-white/15"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5" />
          <path d="m14 8 4 4-4 4M18 12H9" />
        </svg>
      </button>
      <AnimatePresence>
        {confirming && (
          <motion.div
            className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setConfirming(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="abandon-game-title"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              className={`w-full max-w-sm p-5 ${CARD}`}
            >
              <h2 id="abandon-game-title" className="font-display text-xl font-extrabold">Abandon this game?</h2>
              <p className="mt-2 text-sm text-ink-soft">Your current game will end and you will return to the setup screen.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirming(false)} className={`${BTN_BASE} bg-card-alt px-4 py-2 text-sm text-ink hover:bg-ink/10`}>Keep playing</button>
                <button type="button" onClick={abandonGame} className={`${BTN_BASE} bg-p-red px-4 py-2 text-sm text-white hover:brightness-110`}>Abandon game</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function PhaseGuide({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const [visibleTitle, setVisibleTitle] = useState<string | null>(null);
  const announced = useRef(new Set<string>());
  const gameJustStarted = game.phase === 'roll' && game.turn === 1;
  const title = gameJustStarted
    ? 'Let the Game Begin!'
    : game.currentPlayer !== humanId
      ? null
      : game.phase === 'startingRoll'
      ? 'Roll the dice to see who starts'
      : game.phase === 'setup'
        ? 'Starting Placement'
        : game.phase === 'moveRobber'
          ? 'Place the Robber'
        : null;

  useEffect(() => {
    if (game.phase === 'gameOver') announced.current.clear();
  }, [game.phase]);

  useEffect(() => {
    if (!title || announced.current.has(title)) {
      setVisibleTitle(null);
      return;
    }
    setVisibleTitle(title);
    // Defer the marker so React StrictMode's discarded effect pass cannot
    // consume the one-time announcement before it is actually displayed.
    const markShown = setTimeout(() => announced.current.add(title), 0);
    const timeout = setTimeout(() => setVisibleTitle(null), 2200);
    return () => {
      clearTimeout(markShown);
      clearTimeout(timeout);
    };
  }, [title]);

  return (
    <AnimatePresence mode="wait">
      {visibleTitle && (
        <div key={visibleTitle} className="pointer-events-none absolute inset-x-0 bottom-[112px] top-0 z-10 flex items-center justify-center">
          <motion.div
            key={visibleTitle}
            initial={{ y: -10, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.96 }}
            className={`max-w-[calc(100%-2rem)] px-7 py-3 text-center font-display text-3xl font-extrabold sm:text-4xl ${CARD}`}
          >
            {visibleTitle}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// --- Player sidebar --------------------------------------------------------

function PlayersColumn({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  return (
    <div className="absolute right-2 top-14 flex w-40 flex-col gap-2 sm:right-3 sm:top-16 sm:w-56">
      {game.turnOrder.map((playerId) => (
        <PlayerCard key={playerId} game={game} player={game.players[playerId]} isHuman={playerId === humanId} active={playerId === game.currentPlayer} />
      ))}
    </div>
  );
}

function PlayerCard({ game, player, isHuman, active }: { game: GameState; player: Player; isHuman: boolean; active: boolean }) {
  const vp = isHuman ? victoryPoints(game, player.id) : publicVictoryPoints(game, player.id);
  const cards = totalResources(player.resources);
  const devCount = player.devCards.filter((c) => !c.played).length;
  const color = PLAYER_CSS[player.color];
  const shownDice = game.phase === 'startingRoll'
    ? game.startingRoll?.rolls[player.id] ?? null
    : active ? game.dice : null;
  return (
    <motion.div
      data-player={player.id}
      animate={{ scale: active ? 1 : 0.98, opacity: active ? 1 : 0.9 }}
      transition={{ duration: 0.2 }}
      className={`relative overflow-hidden px-3 py-2 sm:py-2.5 ${CARD} ${active ? 'bg-card-alt' : ''}`}
      style={active ? { boxShadow: `0 0 0 3px ${color}, 0 8px 24px -6px rgba(20,30,40,.45)` } : undefined}
    >
      {/* Color accent strip */}
      <span className="absolute left-0 top-0 h-full w-1.5" style={{ background: color }} />
      <div className="flex items-center gap-2 pl-1">
        <span className="truncate font-display text-sm font-extrabold">{player.name}</span>
        {player.botDifficulty && <span title={`${player.botDifficulty} bot`} className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-ink-soft">{player.botDifficulty[0]}</span>}
        {active && <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-soft">turn</span>}
        <span className="ml-auto flex items-baseline gap-0.5">
          <span className="font-display text-2xl font-extrabold leading-none" style={{ color }}>{vp}</span>
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2.5 pl-1 text-[11px] font-semibold text-ink-soft">
        {shownDice && <PlayerDice dice={shownDice} compact />}
        <span data-player-cards={player.id} className="inline-flex items-center gap-1" title="cards in hand">🃏 {cards}</span>
        <span className="inline-flex items-center gap-1" title="development cards">📜 {devCount}</span>
        <span className="inline-flex items-center gap-1" title="knights played">🛡️ {player.knightsPlayed}</span>
        <span className="ml-auto flex gap-1">
          {game.longestRoad.player === player.id && <Badge title="Longest Road">🛣️</Badge>}
          {game.largestArmy.player === player.id && <Badge title="Largest Army">⚔️</Badge>}
        </span>
      </div>
    </motion.div>
  );
}

function PlayerDice({ dice, compact = false }: { dice: [number, number]; compact?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" title={`Rolled ${dice[0]} + ${dice[1]} = ${dice[0] + dice[1]}`}>
      {dice.map((value, index) => (
        <motion.img
          key={`${index}-${value}`}
          src={diceAsset(value)}
          alt={`Die showing ${value}`}
          draggable={false}
          initial={{ rotate: -25, scale: 0.5 }}
          animate={{ rotate: 0, scale: 1 }}
          className={compact ? 'h-6 w-6 drop-shadow-sm' : 'h-8 w-8 drop-shadow-sm'}
        />
      ))}
    </div>
  );
}

function Badge({ children, title }: { children: React.ReactNode; title: string }) {
  return <span title={title} className="rounded-md bg-amber-100 px-1 py-0.5 text-[11px] ring-1 ring-amber-300/60">{children}</span>;
}

// --- Bottom action dock ----------------------------------------------------

function HumanDock({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const dispatch = useGame((s) => s.dispatch);
  const build = useGame((s) => s.build);
  const setBuild = useGame((s) => s.setBuild);
  const debugInfiniteTimer = useGame((s) => s.debugInfiniteTimer);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeGive, setTradeGive] = useState<Bag>(zeroBag);
  const [devPicker, setDevPicker] = useState<null | 'monopoly' | 'yop'>(null);
  const me = game.players[humanId];
  const myTurn = game.currentPlayer === humanId;
  const inMain = myTurn && game.phase === 'main';
  const canRoll = myTurn && game.phase === 'roll';
  const canStartRoll = myTurn && game.phase === 'startingRoll';
  const mustResolveAction = game.pending.freeRoads > 0 || build?.kind === 'knight';
  const canTakeRoll = canRoll && !mustResolveAction;
  const toggle = (kind: 'road' | 'settlement' | 'city') =>
    setBuild(build?.kind === kind ? null : { kind });

  useEffect(() => {
    if (!inMain) {
      setTradeOpen(false);
      setTradeGive(zeroBag());
    }
  }, [inMain]);

  useEffect(() => {
    if (!myTurn || (game.phase !== 'roll' && game.phase !== 'main')) setDevPicker(null);
  }, [game.phase, myTurn]);

  const addTradeCard = (resource: Resource) => {
    if (!inMain) return;
    setTradeGive((current) => current[resource] >= me.resources[resource] ? current : { ...current, [resource]: current[resource] + 1 });
    setTradeOpen(true);
  };
  const removeTradeCard = (resource: Resource) => setTradeGive((current) => ({ ...current, [resource]: Math.max(0, current[resource] - 1) }));
  const openTrade = () => {
    if (tradeOpen) {
      closeTrade();
      return;
    }
    setTradeGive(zeroBag());
    setTradeOpen(true);
  };
  const closeTrade = () => {
    setTradeOpen(false);
    setTradeGive(zeroBag());
  };
  const resetTradeCards = () => setTradeGive(zeroBag());

  // --- Discard flow: select cards in-hand, confirm, or auto-drop on timeout ---
  const required = game.phase === 'discard' ? game.pending.discards[humanId] ?? 0 : 0;
  const discarding = required > 0;
  const infiniteTime = debugInfiniteTimer?.player === game.currentPlayer && debugInfiniteTimer.turn === game.turn;
  const [sel, setSel] = useState<Bag>(zeroBag);
  const [remaining, setRemaining] = useState<number>(game.rules.turnTimer);
  const selectedTotal = RESOURCES.reduce((s, r) => s + sel[r], 0);

  // Keep latest hand/target for the timeout closure.
  const meRef = useRef(me);
  meRef.current = me;
  const requiredRef = useRef(required);
  requiredRef.current = required;

  useEffect(() => {
    if (!discarding || infiniteTime) return;
    setSel(zeroBag());
    setRemaining(game.rules.turnTimer);
    const started = Date.now();
    const id = setInterval(() => {
      const left = game.rules.turnTimer - Math.floor((Date.now() - started) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) {
        clearInterval(id);
        dispatch({ type: 'discard', player: humanId, resources: randomDiscard(meRef.current.resources, requiredRef.current) });
      }
    }, 250);
    return () => clearInterval(id);
    // Re-arm whenever a fresh discard requirement appears.
  }, [discarding, required, humanId, dispatch, game.rules.turnTimer, infiniteTime]);

  const toggleDiscard = (r: Resource, delta: number) =>
    setSel((prev) => {
      if (delta > 0) {
        if (selectedTotal >= required || prev[r] >= me.resources[r]) return prev;
        return { ...prev, [r]: prev[r] + 1 };
      }
      if (prev[r] <= 0) return prev;
      return { ...prev, [r]: prev[r] - 1 };
    });

  return (
    <div className="pointer-events-auto absolute bottom-2 left-0 right-0 z-20 flex flex-col items-center gap-2 px-2 sm:bottom-3 sm:px-3">
      {discarding && (
        <DiscardBanner
          selected={selectedTotal}
          required={required}
          remaining={remaining}
          infinite={infiniteTime}
          onConfirm={() => dispatch({ type: 'discard', player: humanId, resources: sel })}
        />
      )}
      {devPicker === 'monopoly' && (
        <ResourcePicker
          count={1}
          title="Choose a resource to monopolise"
          onPick={(resources) => {
            dispatch({ type: 'playMonopoly', resource: resources[0] });
            setDevPicker(null);
          }}
          onClose={() => setDevPicker(null)}
        />
      )}
      {devPicker === 'yop' && (
        <ResourcePicker
          count={2}
          title="Choose any two resources"
          onPick={(resources) => {
            dispatch({ type: 'playYearOfPlenty', resources });
            setDevPicker(null);
          }}
          onClose={() => setDevPicker(null)}
        />
      )}
      <div className="flex w-full items-stretch gap-2">
        {/* Resource hand — fanned cards, grouped by resource (click to discard) */}
        <div
          data-hand-panel
          className={`flex min-h-[82px] basis-1/3 items-center gap-2 overflow-x-auto px-3 pb-2 pt-4 ${CARD} ${discarding ? 'ring-2 ring-amber-400' : ''}`}
        >
          <ResourceHand game={game} me={me} discard={discarding ? { sel, onToggle: toggleDiscard } : undefined} tradeSelected={tradeOpen ? tradeGive : undefined} onCardClick={inMain ? addTradeCard : undefined} onDevPick={setDevPicker} />
        </div>

        {/* Action menu */}
        <div className={`relative flex basis-2/3 items-stretch justify-between gap-1.5 p-2 ${CARD}`}>
          {myTurn && (canStartRoll || canRoll || game.dice) && (
            <RollDiceDisplay
              dice={game.dice}
              onRoll={canStartRoll
                ? () => dispatch({ type: 'rollForStart' })
                : canTakeRoll ? () => dispatch({ type: 'rollDice' }) : undefined}
            />
          )}
            <ActionButton img={TRADE_ICON} label="Trade" onClick={openTrade} disabled={!inMain} />
            <ActionButton
              img={CARD_DEV_BACK}
              label="Dev"
              cost={COSTS.devCard}
              onClick={() => dispatch({ type: 'buyDevCard' })}
              disabled={!inMain || !canAfford(me.resources, COSTS.devCard) || game.devDeck.length === 0}
            />
            <ActionButton
              img={roadAsset(me.color)}
              label="Road"
              cost={COSTS.road}
              active={build?.kind === 'road'}
              onClick={() => toggle('road')}
              disabled={!inMain || !canAfford(me.resources, COSTS.road) || me.stock.roads === 0}
            />
            <ActionButton
              img={settlementAsset(me.color)}
              label="Town"
              cost={COSTS.settlement}
              active={build?.kind === 'settlement'}
              onClick={() => toggle('settlement')}
              disabled={!inMain || !canAfford(me.resources, COSTS.settlement) || me.stock.settlements === 0}
            />
            <ActionButton
              img={cityAsset(me.color)}
              label="City"
              cost={COSTS.city}
              active={build?.kind === 'city'}
              onClick={() => toggle('city')}
              disabled={!inMain || !canAfford(me.resources, COSTS.city) || me.stock.cities === 0}
            />
            <div className="mx-0.5 w-px self-stretch bg-black/10 dark:bg-white/15" />
            {canRoll || canStartRoll ? (
              <button
                disabled={mustResolveAction}
                onClick={() => dispatch({ type: canStartRoll ? 'rollForStart' : 'rollDice' })}
                className={`${BTN_BASE} flex-1 px-4 text-base ${mustResolveAction ? 'bg-card-alt text-ink-faint' : 'bg-p-green text-white shadow-soft hover:-translate-y-0.5 hover:brightness-105'}`}
              >
                🎲<span className="ml-1 hidden sm:inline">{canStartRoll ? 'Roll for first' : 'Roll'}</span>
              </button>
            ) : (
              <button
                disabled={!inMain || mustResolveAction}
                onClick={() => dispatch({ type: 'endTurn' })}
                className={`${BTN_BASE} flex-1 px-4 text-base ${inMain && !mustResolveAction ? 'bg-p-green text-white shadow-soft hover:-translate-y-0.5 hover:brightness-105' : 'bg-card-alt text-ink-faint'}`}
              >
                End<span className="ml-1 hidden sm:inline">Turn</span>
              </button>
            )}
          </div>
      </div>

      {tradeOpen && inMain && <TradePanel game={game} give={tradeGive} onRemoveGive={removeTradeCard} onResetGive={resetTradeCards} onClose={closeTrade} />}

      <AnimatePresence>
        {build && (
          <Hint key="build">
            Select a spot on the board · <button className="underline" onClick={() => setBuild(null)}>cancel</button>
          </Hint>
        )}
        {game.pending.freeRoads > 0 && myTurn && (
          <Hint key="free">Place {game.pending.freeRoads} free road{game.pending.freeRoads > 1 ? 's' : ''}</Hint>
        )}
      </AnimatePresence>
    </div>
  );
}

function TurnCountdown({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const dispatch = useGame((s) => s.dispatch);
  const debugInfiniteTimer = useGame((s) => s.debugInfiniteTimer);
  const humanMustAct = game.currentPlayer === humanId && game.phase !== 'discard';
  const seconds = game.rules.turnTimer;
  const infiniteTime = debugInfiniteTimer?.player === game.currentPlayer && debugInfiniteTimer.turn === game.turn;
  const [remaining, setRemaining] = useState<number>(seconds);
  const gameRef = useRef(game);
  gameRef.current = game;
  const actionKey = `${game.phase}-${game.currentPlayer}-${game.turn}-${game.setup?.step ?? ''}-${game.setup?.lastSettlement ?? ''}-${game.pending.discards[humanId] ?? ''}`;

  useEffect(() => {
    if (!humanMustAct || infiniteTime || game.phase === 'gameOver') return;
    setRemaining(seconds);
    const started = Date.now();
    const interval = setInterval(() => {
      const left = seconds - Math.floor((Date.now() - started) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) {
        clearInterval(interval);
        const current = gameRef.current;
        if (current.phase === 'main') dispatch({ type: 'endTurn' });
        else {
          const action = nextBotAction(current, humanId);
          if (action) dispatch(action);
        }
      }
    }, 250);
    return () => clearInterval(interval);
  }, [actionKey, dispatch, humanId, humanMustAct, infiniteTime, seconds]);

  if (!humanMustAct || game.phase === 'gameOver') return null;
  return (
    <span className={`ml-1 rounded-lg px-2 py-1 text-xs font-extrabold tabular-nums ${remaining <= 5 ? 'bg-p-red text-white' : 'bg-card-alt text-ink'}`}>
      {infiniteTime ? '∞' : `${remaining}s`}
    </span>
  );
}

function RollDiceDisplay({ dice, onRoll }: { dice: [number, number] | null; onRoll?: () => void }) {
  const faces: [number, number] = dice ?? [1, 6];
  return (
    <button
      type="button"
      onClick={onRoll}
      disabled={!onRoll}
      className={`absolute -top-16 right-3 flex items-end gap-1.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
        onRoll ? 'cursor-pointer transition hover:scale-105 active:scale-95' : 'cursor-default'
      }`}
      aria-label={dice ? `Rolled ${dice[0]} and ${dice[1]}` : 'Dice ready to roll'}
    >
      {faces.map((value, index) => (
        <motion.img
          key={`${index}-${value}`}
          src={diceAsset(value)}
          alt=""
          draggable={false}
          initial={dice ? { rotate: -25, scale: 0.5 } : undefined}
          animate={dice
            ? { rotate: 0, scale: 1, y: 0 }
            : { rotate: index === 0 ? -8 : 8, y: index === 0 ? 1 : -1 }}
          transition={dice
            ? { type: 'spring', stiffness: 320, damping: 17 }
            : { repeat: Infinity, repeatType: 'reverse', duration: 0.7, ease: 'easeInOut' }}
          className="h-14 w-14 drop-shadow-lg"
        />
      ))}
    </button>
  );
}

/** Banner shown above the hand while the human must discard cards. */
function DiscardBanner({ selected, required, remaining, infinite, onConfirm }: {
  selected: number; required: number; remaining: number; infinite: boolean; onConfirm: () => void;
}) {
  const done = selected === required;
  const low = remaining <= 5;
  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 text-sm font-bold shadow-pop ring-1 ${
        done ? 'bg-p-green text-white ring-white/30' : 'bg-amber-300 text-amber-950 ring-amber-500/40'
      }`}
    >
      <span>Select cards to discard ({selected}/{required})</span>
      <span className={`rounded-full px-2 py-0.5 font-mono tabular-nums ${low ? 'bg-p-red text-white' : 'bg-black/15'}`}>
        {infinite ? '∞' : `0:${String(remaining).padStart(2, '0')}`}
      </span>
      <button
        disabled={!done}
        onClick={onConfirm}
        className={`${BTN_BASE} h-8 w-8 text-base ${done ? 'bg-white text-p-green hover:brightness-95' : 'bg-black/10 text-black/30'}`}
        title="Confirm discard"
      >
        ✓
      </button>
    </motion.div>
  );
}

type DiscardCtl = { sel: Bag; onToggle: (r: Resource, delta: number) => void };

/** The human's hand: one fanned pile per held resource, using the card art. */
function ResourceHand({ game, me, discard, tradeSelected, onCardClick, onDevPick }: { game: GameState; me: Player; discard?: DiscardCtl; tradeSelected?: Bag; onCardClick?: (resource: Resource) => void; onDevPick: (picker: 'monopoly' | 'yop') => void }) {
  const present = RESOURCES.filter((r) => me.resources[r] - (tradeSelected?.[r] ?? 0) > 0);
  const hasDevCards = me.devCards.some((card) => !card.played);
  if (present.length === 0 && !hasDevCards) {
    return <span className="w-full text-center text-sm font-semibold text-ink-faint">No resources</span>;
  }
  return (
    <>
      {present.map((r) => (
        discard ? <FannedStack key={r} res={r} src={RESOURCE_CARD[r]} count={me.resources[r] - (tradeSelected?.[r] ?? 0)} title={r} selected={discard.sel[r]} onToggle={(delta) => discard.onToggle(r, delta)} />
          : <StackedCard key={r} handStackId={r} src={RESOURCE_CARD[r]} alt={r} count={me.resources[r] - (tradeSelected?.[r] ?? 0)} direction="left" maxVisible={6} overlap={7} onClick={onCardClick ? () => onCardClick(r) : undefined} />
      ))}
      {!discard && <DevelopmentCards game={game} me={me} onPick={onDevPick} />}
    </>
  );
}

function FannedStack({ src, count, title, res, selected = 0, onToggle, onClick }: {
  src: string; count: number; title: string; res?: string; selected?: number; onToggle?: (delta: number) => void; onClick?: () => void;
}) {
  const cardW = 40;
  // Tighten the overlap as a pile grows so wide hands stay compact.
  const offset = count > 6 ? Math.max(11, 100 / count) : 18;
  const width = cardW + (count - 1) * offset;
  const clickable = !!onToggle || !!onClick;
  return (
    <div data-hand-stack={res} className="relative shrink-0" style={{ width, height: 58 }} title={`${count} ${title}`}>
      {Array.from({ length: count }).map((_, i) => {
        const isSel = clickable && i >= count - selected;
        return (
          <img
            key={i}
            src={src}
            alt=""
            draggable={false}
            onClick={onToggle ? () => onToggle(isSel ? -1 : 1) : onClick}
            className={`absolute bottom-0 rounded-[5px] shadow-sm transition-transform ${
              isSel ? 'ring-2 ring-amber-400' : 'ring-1 ring-black/10'
            } ${clickable ? 'cursor-pointer' : ''}`}
            style={{ left: i * offset, width: cardW, zIndex: i, transform: isSel ? 'translateY(-10px)' : undefined }}
          />
        );
      })}
      <span className="absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 rounded-full bg-ink px-1.5 text-[10px] font-extrabold text-card ring-1 ring-white/40">
        {count}
      </span>
    </div>
  );
}

/** Pick `count` random cards from a hand — used when the discard timer expires. */
function randomDiscard(resources: Record<Resource, number>, count: number): Bag {
  const pool: Resource[] = [];
  for (const r of RESOURCES) for (let i = 0; i < resources[r]; i++) pool.push(r);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const bag = zeroBag();
  for (let i = 0; i < count && i < pool.length; i++) bag[pool[i]] += 1;
  return bag;
}

function ActionButton({ img, label, cost, onClick, disabled, active }: {
  img: string; label: string; cost?: Partial<Record<Resource, number>>;
  onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  const title = cost ? `${label} — ${RESOURCES.filter((r) => cost[r]).map((r) => `${cost[r]} ${r}`).join(', ')}` : label;
  return (
    <button
      data-dock-action={label}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`${BTN_BASE} flex-1 flex-col gap-0.5 px-2 py-1.5 ${
        active
          ? 'bg-amber-300 text-amber-950 shadow-soft'
          : disabled
            ? 'bg-card-alt/50 text-ink-faint'
            : 'bg-card-alt text-ink hover:-translate-y-0.5 hover:shadow-soft'
      }`}
    >
      <img src={img} alt="" className={`h-9 w-9 object-contain ${disabled ? 'opacity-45' : ''}`} />
      {cost ? (
        <span className="leading-none"><Cost cost={cost} /></span>
      ) : (
        <span className="text-[10px] font-bold leading-none">{label}</span>
      )}
    </button>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0 }}
      className="rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-amber-950 shadow-soft"
    >
      {children}
    </motion.div>
  );
}

/** Played from the same hand as resource cards; victory cards remain informational. */
function DevelopmentCards({ game, me, onPick }: { game: GameState; me: Player; onPick: (picker: 'monopoly' | 'yop') => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const setBuild = useGame((s) => s.setBuild);
  const humanId = useGame((s) => s.humanId);
  const canPlay = game.currentPlayer === humanId && (game.phase === 'roll' || game.phase === 'main') && !game.pending.playedDevThisTurn;

  const counts: Record<DevCardType, { total: number; playable: number }> = {
    knight: { total: 0, playable: 0 },
    victoryPoint: { total: 0, playable: 0 },
    roadBuilding: { total: 0, playable: 0 },
    monopoly: { total: 0, playable: 0 },
    yearOfPlenty: { total: 0, playable: 0 },
  };
  for (const c of me.devCards) {
    if (c.played) continue;
    counts[c.type].total += 1;
    if (c.boughtOnTurn < game.turn) counts[c.type].playable += 1;
  }
  if (!Object.values(counts).some((c) => c.total > 0)) return null;
  const play = (type: DevCardType) => canPlay && counts[type].playable > 0;

  return (
    <div className="relative flex shrink-0 items-center gap-2 border-l border-ink/10 pl-2 dark:border-white/10">
      {counts.knight.total > 0 && <DevHandCard type="knight" count={counts.knight.total} enabled={play('knight')} onClick={() => setBuild({ kind: 'knight' })} />}
      {counts.roadBuilding.total > 0 && <DevHandCard type="roadBuilding" count={counts.roadBuilding.total} enabled={play('roadBuilding')} onClick={() => dispatch({ type: 'playRoadBuilding' })} />}
      {counts.monopoly.total > 0 && <DevHandCard type="monopoly" count={counts.monopoly.total} enabled={play('monopoly')} onClick={() => onPick('monopoly')} />}
      {counts.yearOfPlenty.total > 0 && <DevHandCard type="yearOfPlenty" count={counts.yearOfPlenty.total} enabled={play('yearOfPlenty')} onClick={() => onPick('yop')} />}
      {counts.victoryPoint.total > 0 && <DevHandCard type="victoryPoint" count={counts.victoryPoint.total} enabled={false} />}
    </div>
  );
}

function DevHandCard({ type, count, enabled, onClick }: { type: DevCardType; count: number; enabled: boolean; onClick?: () => void }) {
  const label: Record<DevCardType, string> = {
    knight: 'Knight', roadBuilding: 'Road Building', monopoly: 'Monopoly', yearOfPlenty: 'Year of Plenty', victoryPoint: 'Victory Point',
  };
  return <StackedCard src={DEV_CARD_ART[type]} alt={label[type]} count={count} direction="left" maxVisible={4} overlap={7} title={enabled ? `Play ${label[type]}` : label[type]} onClick={enabled ? onClick : undefined} className={enabled ? '' : 'opacity-60'} />;
}

function ResourcePicker({ count, title, onPick, onClose }: { count: number; title: string; onPick: (rs: Resource[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<Resource[]>([]);
  const choose = (r: Resource) => {
    const next = [...picked, r];
    if (next.length >= count) onPick(next);
    else setPicked(next);
  };
  return (
    <div className={`z-30 shrink-0 p-3 ${CARD}`} role="dialog" aria-label={title}>
      <div className="mb-1 whitespace-nowrap text-center text-[11px] font-semibold text-ink-soft">
        {title} {count === 2 ? `(${picked.length}/2)` : ''}
      </div>
      <div className="flex gap-1">
        {RESOURCES.map((r) => (
          <button key={r} onClick={() => choose(r)} className="flex items-center justify-center rounded-xl bg-card-alt p-1.5 transition hover:-translate-y-0.5 hover:shadow-soft">
            <ResCard resource={r} size={30} />
          </button>
        ))}
      </div>
      <button onClick={onClose} className="mt-1 w-full text-center text-[11px] text-ink-faint underline">cancel</button>
    </div>
  );
}

// --- Victory + error -------------------------------------------------------

function VictoryOverlay({ game }: { game: GameState }) {
  const newGame = useGame((s) => s.newGame);
  const abandonGame = useGame((s) => s.abandonGame);
  const startedAt = useGame((s) => s.matchStartedAt);
  const endedAt = useGame((s) => s.matchEndedAt);
  const [tab, setTab] = useState<'overview' | 'dice' | 'resources' | 'development' | 'activity'>('overview');
  if (game.phase !== 'gameOver' || game.winner === null) return null;
  const winner = game.players[game.winner];
  const rows = game.players.map((player) => ({
    player,
    points: victoryPoints(game, player.id),
    towns: Object.values(game.buildings).filter((piece) => piece.owner === player.id && piece.type === 'settlement').length,
    cities: Object.values(game.buildings).filter((piece) => piece.owner === player.id && piece.type === 'city').length,
    vpCards: player.devCards.filter((card) => card.type === 'victoryPoint').length,
    roadAward: game.longestRoad.player === player.id ? VP_LONGEST_ROAD : 0,
    armyAward: game.largestArmy.player === player.id ? VP_LARGEST_ARMY : 0,
    route: longestRoadLength(game, player.id),
  })).sort((a, b) => b.points - a.points || a.player.id - b.player.id);
  const tabs = ['overview', 'dice', 'resources', 'development', 'activity'] as const;
  const duration = startedAt ? formatDuration((endedAt ?? Date.now()) - startedAt) : '0:00';
  return (
    <Overlay>
      <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }} className={`flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden p-4 text-center sm:p-6 ${CARD}`}>
        <div className="flex flex-wrap items-center justify-center gap-x-3">
          <span className="text-4xl">🏆</span>
          <div className="text-left"><h2 className="font-display text-2xl font-extrabold sm:text-3xl" style={{ color: PLAYER_CSS[winner.color] }}>{winner.name === 'You' ? 'You win!' : `${winner.name} wins!`}</h2><p className="text-sm text-ink-soft">Turn {game.turn} · {duration}</p></div>
        </div>
        <div className="my-4 flex shrink-0 gap-1 overflow-x-auto rounded-xl bg-card-alt p-1">
          {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`min-w-max flex-1 rounded-lg px-3 py-2 text-xs font-extrabold capitalize transition ${tab === item ? 'bg-card text-ink shadow-soft' : 'text-ink-soft hover:bg-ink/10'}`}>{item}</button>)}
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-2xl bg-card-alt ring-1 ring-ink/10">
          {tab === 'overview' && <OverviewStats rows={rows} />}
          {tab === 'dice' && <DiceStats game={game} />}
          {tab === 'resources' && <ResourceStats game={game} rows={rows} />}
          {tab === 'development' && <DevelopmentStats rows={rows} />}
          {tab === 'activity' && <ActivityStats rows={rows} />}
        </div>
        <div className="mt-4 flex shrink-0 flex-wrap justify-center gap-2">
          <button onClick={abandonGame} className={`${BTN_BASE} bg-card-alt px-5 py-2.5 text-sm text-ink hover:bg-ink/10`}>Main menu</button>
          <button onClick={() => newGame({ players: game.players.map((p) => ({ name: p.name, isBot: p.isBot, color: p.color, botDifficulty: p.botDifficulty ?? undefined })), layout: 'random', rules: game.rules })} className={`${BTN_BASE} bg-p-green px-5 py-2.5 text-sm text-white hover:-translate-y-0.5 hover:brightness-105`}>Play again</button>
        </div>
      </motion.div>
    </Overlay>
  );
}

function PlayerResult({ player, rank }: { player: Player; rank?: number }) {
  const color = PLAYER_CSS[player.color];
  return <div className="flex min-w-40 items-center gap-2">{rank !== undefined && <span className="w-5 text-center font-extrabold text-ink-faint">{rank}</span>}<span className="flex h-9 w-9 items-center justify-center rounded-full text-base ring-2" style={{ background: `${color}22`, boxShadow: `inset 0 0 0 2px ${color}` }}>{player.isBot ? '🤖' : '🎩'}</span><span className="font-display font-bold text-ink">{player.name}</span></div>;
}

type StatColumn<T> = { label: string; title?: string; value: (row: T) => number };

function PlayerStatTable<T extends { player: Player }>({ rows, columns, totals = false, ranked = false }: { rows: T[]; columns: StatColumn<T>[]; totals?: boolean; ranked?: boolean }) {
  const highs = columns.map((column) => Math.max(...rows.map(column.value)));
  return <table className="w-full min-w-[720px] border-collapse text-sm"><thead><tr className="sticky top-0 z-10 border-b border-ink/10 bg-card-alt text-[11px] uppercase tracking-wide text-ink-faint"><th className="px-3 py-2 text-left">Player</th>{columns.map((column) => <th key={column.label} title={column.title} className="px-2 py-2 text-center">{column.label}</th>)}</tr></thead><tbody>{rows.map((row, rank) => <tr key={row.player.id} className="border-b border-ink/5"><td className="px-3 py-2 text-left"><PlayerResult player={row.player} rank={ranked ? rank + 1 : undefined} /></td>{columns.map((column, index) => { const value = column.value(row); const high = value > 0 && value === highs[index]; return <td key={column.label} className="px-2 py-2 text-center"><span className={`inline-flex min-w-7 justify-center rounded-lg px-2 py-1 font-bold ${high ? 'bg-amber-300 text-amber-950 ring-1 ring-amber-500/40' : 'text-ink-soft'}`}>{value}</span></td>; })}</tr>)}{totals && <tr className="sticky bottom-0 bg-card font-extrabold text-ink"><td className="px-3 py-2 text-left">Total</td>{columns.map((column) => <td key={column.label} className="px-2 py-2 text-center">{rows.reduce((sum, row) => sum + column.value(row), 0)}</td>)}</tr>}</tbody></table>;
}

function OverviewStats({ rows }: { rows: Array<{ player: Player; points: number; towns: number; cities: number; vpCards: number; roadAward: number; armyAward: number }> }) {
  const columns: StatColumn<typeof rows[number]>[] = [
    { label: 'Towns', title: 'Victory points from towns', value: (row) => row.towns },
    { label: 'Cities', title: 'Victory points from cities', value: (row) => row.cities * 2 },
    { label: 'VP cards', value: (row) => row.vpCards },
    { label: 'Road', title: 'Longest Road points', value: (row) => row.roadAward },
    { label: 'Army', title: 'Largest Army points', value: (row) => row.armyAward },
    { label: 'Total VP', value: (row) => row.points },
  ];
  return <PlayerStatTable rows={rows} columns={columns} ranked />;
}

const DICE_WAYS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
function DiceStats({ game }: { game: GameState }) {
  const total = Object.values(game.diceStats).reduce((sum, count) => sum + count, 0);
  const peak = Math.max(1, ...Object.values(game.diceStats));
  return <div className="mx-auto max-w-4xl p-3 sm:p-5"><div className="grid min-w-[620px] grid-cols-11 gap-2 border-b border-ink/10 px-2 pt-3">{Object.keys(DICE_WAYS).map(Number).map((roll) => { const count = game.diceStats[roll] ?? 0; const percent = total ? Math.round(count / total * 100) : 0; const height = count > 0 ? Math.max(5, count / peak * 100) : 0; return <div key={roll} title={`${roll}: ${count} rolls (${percent}%), expected ${Math.round(DICE_WAYS[roll] / 36 * 100)}%`} className="flex h-64 flex-col items-center justify-end"><span className="mb-1 text-xs font-extrabold tabular-nums text-ink">{count}</span><div className="flex h-48 w-full items-end justify-center"><div className="w-full max-w-12 rounded-t-lg bg-p-blue shadow-soft transition-all" style={{ height: `${height}%` }} /></div><span className="mt-1 text-[9px] text-ink-faint">{percent}%</span><span className="pb-2 font-display text-lg font-extrabold text-ink">{roll}</span></div>; })}</div><div className="pt-3 text-sm font-extrabold text-ink">Total gameplay rolls: {total} <span className="ml-2 font-normal text-ink-faint">Opening rolls excluded</span></div></div>;
}

function ResourceStats<T extends { player: Player }>({ rows }: { game: GameState; rows: T[] }) {
  const columns: StatColumn<T>[] = [...RESOURCES.map((resource) => ({ label: resource[0].toUpperCase() + resource.slice(1), value: (row: T) => row.player.stats.resourcesCollected[resource] })), { label: 'Total', value: (row: T) => totalResources(row.player.stats.resourcesCollected) }];
  return <PlayerStatTable rows={rows} columns={columns} totals />;
}

const DEV_LABELS: Record<DevCardType, string> = { knight: 'Knight', roadBuilding: 'Road Building', monopoly: 'Monopoly', yearOfPlenty: 'Year of Plenty', victoryPoint: 'VP Card' };
const DEV_TYPES = Object.keys(DEV_LABELS) as DevCardType[];
function DevelopmentStats<T extends { player: Player }>({ rows }: { rows: T[] }) {
  const columns: StatColumn<T>[] = [...DEV_TYPES.map((type) => ({ label: DEV_LABELS[type], value: (row: T) => row.player.stats.devCardsCollected[type] })), { label: 'Total', value: (row: T) => DEV_TYPES.reduce((sum, type) => sum + row.player.stats.devCardsCollected[type], 0) }];
  return <PlayerStatTable rows={rows} columns={columns} totals />;
}

function ActivityStats<T extends { player: Player; route: number }>({ rows }: { rows: T[] }) {
  const [mode, setMode] = useState<'building' | 'trading' | 'robber' | 'progress'>('building');
  const modes = ['building', 'trading', 'robber', 'progress'] as const;
  const columns: Record<typeof mode, StatColumn<T>[]> = {
    building: [
      { label: 'Roads placed', value: (row) => row.player.stats.roadsPlaced },
      { label: 'Towns placed', value: (row) => row.player.stats.settlementsPlaced },
      { label: 'Cities built', value: (row) => row.player.stats.citiesBuilt },
      { label: 'Longest route', value: (row) => row.route },
    ],
    trading: [
      { label: 'Bank trades', value: (row) => row.player.stats.bankTrades },
      { label: 'Player trades', value: (row) => row.player.stats.playerTrades },
    ],
    robber: [
      { label: 'Robber moved', value: (row) => row.player.stats.robberMoves },
      { label: 'Knights played', value: (row) => row.player.knightsPlayed },
      { label: 'Cards discarded', value: (row) => row.player.stats.cardsDiscarded },
    ],
    progress: [
      { label: 'Cards bought', value: (row) => row.player.stats.devCardsBought },
      { label: 'Cards played', value: (row) => row.player.stats.devCardsPlayed },
      { label: 'VP cards', value: (row) => row.player.stats.devCardsCollected.victoryPoint },
    ],
  };
  return <div><div className="flex gap-1 border-b border-ink/10 p-2">{modes.map((item) => <button key={item} onClick={() => setMode(item)} className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-extrabold capitalize transition ${mode === item ? 'bg-card text-ink shadow-soft' : 'text-ink-soft hover:bg-ink/10'}`}>{item}</button>)}</div><PlayerStatTable rows={rows} columns={columns[mode]} totals /></div>;
}

function ErrorToast() {
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 2600);
    return () => clearTimeout(t);
  }, [error, clearError]);
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute left-1/2 top-[4.5rem] -translate-x-1/2 rounded-xl bg-p-red px-4 py-2 text-sm font-bold text-white shadow-pop"
        >
          {error}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      {children}
    </div>
  );
}

const PHASE_LABEL: Record<GameState['phase'], string> = {
  startingRoll: 'First roll',
  setup: 'Setup',
  roll: 'Roll dice',
  discard: 'Discard cards',
  moveRobber: 'Move robber',
  main: 'Build & trade',
  gameOver: 'Game over',
};
