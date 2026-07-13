import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CARD_DEV_BACK, DEV_CARD_ART, RESOURCE_CARD, TRADE_ICON, cityAsset, diceAsset, roadAsset, settlementAsset } from '../assets';
import { nextBotAction } from '../ai/bot';
import { COSTS } from '../engine/constants';
import { canAfford, publicVictoryPoints, totalResources, victoryPoints } from '../engine/helpers';
import type { DevCardType, GameState, Player, Resource } from '../engine/types';
import { emptyBank, RESOURCES } from '../engine/types';
import { PLAYER_CSS } from '../render/palette';
import { useGame } from '../state/store';
import { CardFlights } from './CardFlights';
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
        <TurnCountdown game={game} />
        {thinking && <span className="ml-0.5 animate-pulse text-[11px] text-ink-faint">thinking…</span>}
      </div>
    </div>
  );
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
      <div className="flex w-full items-stretch gap-2">
        {/* Resource hand — fanned cards, grouped by resource (click to discard) */}
        <div
          data-hand-panel
          className={`flex min-h-[82px] basis-1/3 items-center gap-2 overflow-x-auto px-3 pb-2 pt-4 ${CARD} ${discarding ? 'ring-2 ring-amber-400' : ''}`}
        >
          <ResourceHand game={game} me={me} discard={discarding ? { sel, onToggle: toggleDiscard } : undefined} tradeSelected={tradeOpen ? tradeGive : undefined} onCardClick={inMain ? addTradeCard : undefined} />
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
function ResourceHand({ game, me, discard, tradeSelected, onCardClick }: { game: GameState; me: Player; discard?: DiscardCtl; tradeSelected?: Bag; onCardClick?: (resource: Resource) => void }) {
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
      {!discard && <DevelopmentCards game={game} me={me} />}
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
function DevelopmentCards({ game, me }: { game: GameState; me: Player }) {
  const dispatch = useGame((s) => s.dispatch);
  const setBuild = useGame((s) => s.setBuild);
  const humanId = useGame((s) => s.humanId);
  const [picker, setPicker] = useState<null | 'monopoly' | 'yop'>(null);
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
      {counts.monopoly.total > 0 && <DevHandCard type="monopoly" count={counts.monopoly.total} enabled={play('monopoly')} onClick={() => setPicker('monopoly')} />}
      {counts.yearOfPlenty.total > 0 && <DevHandCard type="yearOfPlenty" count={counts.yearOfPlenty.total} enabled={play('yearOfPlenty')} onClick={() => setPicker('yop')} />}
      {counts.victoryPoint.total > 0 && <DevHandCard type="victoryPoint" count={counts.victoryPoint.total} enabled={false} />}

      {picker === 'monopoly' && (
        <ResourcePicker count={1} title="Monopolise a resource" onPick={(rs) => { dispatch({ type: 'playMonopoly', resource: rs[0] }); setPicker(null); }} onClose={() => setPicker(null)} />
      )}
      {picker === 'yop' && (
        <ResourcePicker count={2} title="Take any two" onPick={(rs) => { dispatch({ type: 'playYearOfPlenty', resources: rs }); setPicker(null); }} onClose={() => setPicker(null)} />
      )}
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
    <div className={`absolute bottom-12 left-1/2 -translate-x-1/2 p-2 ${CARD}`}>
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
  if (game.phase !== 'gameOver' || game.winner === null) return null;
  const winner = game.players[game.winner];
  return (
    <Overlay>
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }} className={`p-10 text-center ${CARD}`}>
        <div className="mb-2 text-6xl">🏆</div>
        <h2 className="font-display text-3xl font-extrabold" style={{ color: PLAYER_CSS[winner.color] }}>{winner.name} wins!</h2>
        <p className="mb-6 mt-1 text-ink-soft">{victoryPoints(game, winner.id)} victory points</p>
        <button
          onClick={() => newGame({ players: game.players.map((p) => ({ name: p.name, isBot: p.isBot })), layout: 'random', rules: game.rules })}
          className={`${BTN_BASE} bg-p-green px-6 py-3 text-lg text-white hover:-translate-y-0.5 hover:brightness-105`}
        >
          Play again
        </button>
      </motion.div>
    </Overlay>
  );
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
