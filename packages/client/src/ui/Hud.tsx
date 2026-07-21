import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  CARD_DEV_BACK_FRAME,
  DEV_CARD_FRAME,
  RESOURCE_CARD_FRAME,
  ROBBER_FRAME,
  TRADE_FRAME,
  cityFrame,
  diceAsset,
  roadFrame,
  settlementFrame,
} from '../assets';
import {
  COSTS,
  RESOURCES,
  VP_LARGEST_ARMY,
  VP_LONGEST_ROAD,
  canAfford,
  devDeckSize,
  emptyBank,
  isConcurrentPhase,
  longestRoadLength,
  nextBotAction,
  publicVictoryPoints,
  totalResources,
  victoryPoints,
} from '@colonist/shared';
import type { DevCardType, GameState, Player, Resource } from '@colonist/shared';
import { PLAYER_CSS } from '../render/palette';
import { useGame } from '../state/store';
import { CardFlights } from './CardFlights';
import { SoundManager } from './SoundManager';
import { DebugPanel } from '../debug/DebugPanel';
import { Sidebar } from './Sidebar';
import { TradePanel } from './TradePanel';
import { TradeOffersPanel } from './TradeOffersPanel';
import { StackedCard } from './StackedCard';
import { useRecentLogEntry } from './useRecentLogEntry';
import { PackedSprite } from './PackedSprite';
import { PlayerIcon, PlayerScorePortrait } from './PlayerDecorations';
import { currentActionMessage } from './actionGuidance';
import { MobileInfoSheet } from './MobileInfoSheet';
import { ThemeToggle } from './ThemeToggle';
import { SettingsPopover } from './SettingsPopover';
import { sendBoardControl } from '../state/boardControls';
import { useReducedMotionPreference } from '../state/useMotionPreference';
import {
  clampDockHandHeight,
  clampDockHandPercent,
  DEFAULT_PANEL_LAYOUT,
  loadPanelLayout,
  savePanelLayout,
} from './panelLayout';
import { leaveRoom } from '../net/socket';
import { useOnline } from '../state/online';

type Bag = Record<Resource, number>;
const zeroBag = emptyBank;

/** A resource shown as its card art — used everywhere a resource is depicted. */
function ResCard({ resource, size = 16 }: { resource: Resource; size?: number }) {
  return (
    <PackedSprite
      name={RESOURCE_CARD_FRAME[resource]}
      alt={resource}
      style={{ width: size }}
      className="inline-block rounded-[3px] object-contain align-middle"
    />
  );
}

export function Hud() {
  const game = useGame((s) => s.game);
  const spectator = useGame((s) => s.spectator);
  if (!game) return null;
  if (spectator) return <SpectatorHud game={game} />;
  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans">
      {/* Play area (left of the sidebar on md+). */}
      <div className="absolute inset-y-0 left-0 right-0 md:right-[260px] lg:right-[280px] xl:right-[320px]">
        <TopBar game={game} />
        <GameControls />
        <PhaseGuide game={game} />
        <div className="md:hidden">
          <PlayersColumn game={game} />
        </div>
        <HumanDock game={game} />
      </div>
      <Sidebar game={game} />
      <TradeOffersPanel game={game} />
      <MobileInfoSheet game={game} />
      <VictoryOverlay game={game} />
      <ErrorToast />
      <CardFlights />
      <SoundManager />
      <DebugPanel />
    </div>
  );
}

function SpectatorHud({ game }: { game: GameState }) {
  const exitGame = useExitGame();
  const code = useOnline((state) => state.code);
  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans">
      <div className="absolute inset-y-0 left-0 right-0 md:right-[260px] lg:right-[280px] xl:right-[320px]">
        <TopBar game={game} />
        <div className="pointer-events-auto absolute left-3 top-3 z-40 flex min-h-11 items-center gap-2 rounded-2xl bg-card/95 p-1.5 pl-3 text-ink shadow-panel ring-1 ring-black/5 backdrop-blur-sm dark:ring-white/15">
          <span className="text-xs font-extrabold">Spectating {code ?? ''}</span>
          <button
            type="button"
            onClick={() => { void exitGame(); }}
            className="rounded-xl bg-p-red px-3 py-2 text-xs font-extrabold text-white transition hover:brightness-110"
          >
            Leave
          </button>
        </div>
        <div className="md:hidden">
          <PlayersColumn game={game} />
        </div>
      </div>
      <Sidebar game={game} />
      <MobileInfoSheet game={game} />
      <VictoryOverlay game={game} />
      <ErrorToast />
      <CardFlights />
      <SoundManager />
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
  const concurrent = isConcurrentPhase(game);
  const active = game.players[game.currentPlayer];
  return (
    <div className="absolute left-1/2 top-[4.75rem] hidden -translate-x-1/2 items-center gap-2 sm:gap-3 md:flex xl:top-4">
      <div className={`flex items-center gap-2 px-3 py-2 sm:px-4 ${CARD}`}>
        {concurrent ? (
          <span className="font-display text-sm font-extrabold sm:text-base">⚡ Everyone</span>
        ) : (
          <>
            <span
              className="h-3 w-3 rounded-full ring-2 ring-white"
              style={{ background: PLAYER_CSS[active.color] }}
            />
            <span className="font-display text-sm font-extrabold sm:text-base">{active.name}</span>
          </>
        )}
        <span className="text-ink-faint">·</span>
        <span className="text-xs text-ink-soft sm:text-sm">{PHASE_LABEL[game.phase]}</span>
        <span className="text-ink-faint">·</span>
        <span className="text-xs font-bold tabular-nums text-ink-soft">
          {game.turn > 0 ? `${concurrent ? 'Round' : 'Turn'} ${game.turn}` : 'Setup'}
        </span>
        <MatchElapsed />
        <TurnCountdown game={game} />
        <RoundCountdown game={game} />
        {thinking && (
          <span className="ml-0.5 animate-pulse text-[11px] text-ink-faint">thinking…</span>
        )}
      </div>
    </div>
  );
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
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
  return (
    <span
      title="Match time"
      className="rounded-lg bg-ink/10 px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-ink-soft"
    >
      {formatDuration((endedAt ?? now) - startedAt)}
    </span>
  );
}

function GameControls() {
  const controlClass =
    'flex h-11 w-11 items-center justify-center rounded-xl text-lg font-extrabold text-ink transition hover:bg-ink/10 active:scale-95';
  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-40 flex items-center gap-0.5 rounded-2xl bg-card/95 p-1 shadow-panel ring-1 ring-black/5 backdrop-blur-sm sm:top-4 dark:ring-white/15">
      <AbandonButton />
      <ThemeToggle embedded />
      <button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => sendBoardControl('zoomIn')}
        className={controlClass}
      >
        +
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => sendBoardControl('zoomOut')}
        className={controlClass}
      >
        −
      </button>
      <button
        type="button"
        aria-label="Recenter board"
        title="Recenter board"
        onClick={() => sendBoardControl('recenter')}
        className={controlClass}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5 fill-none stroke-current"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="1.5" className="fill-current stroke-none" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      </button>
      <SettingsPopover embedded />
    </div>
  );
}

function AbandonButton() {
  const exitGame = useExitGame();
  const mode = useGame((s) => s.mode);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title="Abandon game"
        aria-label="Abandon game"
        className="relative flex h-11 w-11 items-center justify-center rounded-xl text-ink transition hover:bg-p-red hover:text-white active:scale-95"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-[18px] w-[18px] fill-none stroke-current"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5" />
          <path d="m14 8 4 4-4 4M18 12H9" />
        </svg>
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
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
                  <h2 id="abandon-game-title" className="font-display text-xl font-extrabold">
                    Abandon this game?
                  </h2>
                  <p className="mt-2 text-sm text-ink-soft">
                    {mode === 'online'
                      ? 'A bot will take over your seat. You can reclaim it later with the room code.'
                      : 'Your current game will end and you will return to the setup screen.'}
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className={`${BTN_BASE} bg-card-alt px-4 py-2 text-sm text-ink hover:bg-ink/10`}
                    >
                      Keep playing
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void exitGame();
                      }}
                      className={`${BTN_BASE} bg-p-red px-4 py-2 text-sm text-white hover:brightness-110`}
                    >
                      Abandon game
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function useExitGame(): () => Promise<void> {
  const abandonGame = useGame((state) => state.abandonGame);
  const mode = useGame((state) => state.mode);
  const setCode = useOnline((state) => state.setCode);
  const navigate = useNavigate();
  return async () => {
    if (mode === 'online') {
      setCode(null);
      navigate('/', { replace: true });
      void leaveRoom();
    }
    abandonGame();
    if (mode !== 'online') navigate('/');
  };
}

function PhaseGuide({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const build = useGame((s) => s.build);
  const message = currentActionMessage(game, humanId, build);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-[4.5rem] z-10 max-w-[calc(100%-7rem)] -translate-x-1/2 rounded-xl bg-card/95 px-3 py-1.5 text-center text-xs font-extrabold text-ink shadow-panel ring-1 ring-black/5 sm:top-20 sm:text-sm md:top-32 xl:top-20 dark:ring-white/10"
    >
      {message}
    </div>
  );
}

// --- Player sidebar --------------------------------------------------------

function PlayersColumn({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const concurrent = isConcurrentPhase(game);
  const lastEntry = useRecentLogEntry(game.log, 700);
  return (
    <div className="absolute right-0 top-14 flex w-[78px] flex-col gap-px sm:right-1 sm:top-16 sm:w-[86px]">
      {game.turnOrder.map((playerId) => (
        <PlayerCard
          key={playerId}
          game={game}
          player={game.players[playerId]}
          isHuman={playerId === humanId}
          active={concurrent ? !game.pending.passed[playerId] : playerId === game.currentPlayer}
          passed={concurrent ? !!game.pending.passed[playerId] : undefined}
          justActed={lastEntry?.player === playerId}
        />
      ))}
    </div>
  );
}

function PlayerCard({
  game,
  player,
  isHuman,
  active,
  passed,
  justActed,
}: {
  game: GameState;
  player: Player;
  isHuman: boolean;
  active: boolean;
  passed?: boolean;
  justActed?: boolean;
}) {
  const vp = isHuman ? victoryPoints(game, player.id) : publicVictoryPoints(game, player.id);
  const color = PLAYER_CSS[player.color];
  const shownDice =
    game.phase === 'startingRoll'
      ? (game.startingRoll?.rolls[player.id] ?? null)
      : (passed === undefined ? active : player.id === game.pending.roundCaptain)
        ? game.dice
        : null;
  return (
    <motion.div
      data-player={player.id}
      animate={{ scale: justActed ? 1.03 : active ? 1 : 0.98, opacity: active ? 1 : 0.9 }}
      transition={{ duration: 0.2 }}
      className={`relative flex min-h-[94px] flex-col items-center justify-center overflow-hidden rounded-l-xl bg-card/95 px-1 py-1.5 transition-shadow ${active ? 'bg-card-alt' : ''} ${justActed ? 'ring-2 ring-p-green' : ''}`}
      style={
        active ? { boxShadow: `0 0 0 3px ${color}, 0 8px 24px -6px rgba(20,30,40,.45)` } : undefined
      }
    >
      <span className="absolute left-1 top-1 z-30 max-w-[40px] truncate text-left font-display text-[11px] font-bold leading-none text-ink">
        {player.name}
      </span>
      <PlayerScorePortrait
        player={player}
        points={vp}
        ribbon="large"
        showName={false}
        className="mt-2 h-16 w-16"
      />
      {(game.phase === 'moveRobber' || game.phase === 'discard') &&
        game.currentPlayer === player.id && (
          <PackedSprite
            name={ROBBER_FRAME}
            alt="Must move the robber"
            className="absolute left-1 top-5 h-6 w-6"
          />
        )}
      {shownDice && (
        <div className="absolute right-0.5 top-4 scale-75">
          <PlayerDice dice={shownDice} compact />
        </div>
      )}
      {passed !== undefined && (
        <span
          title={passed ? 'Passed / ready' : 'Still deciding'}
          className="absolute left-1 top-5 text-[9px]"
        >
          {passed ? '✅' : '⏳'}
        </span>
      )}
    </motion.div>
  );
}

function PlayerDice({ dice, compact = false }: { dice: [number, number]; compact?: boolean }) {
  const animationsDisabled = useReducedMotionPreference();
  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      title={`Rolled ${dice[0]} + ${dice[1]} = ${dice[0] + dice[1]}`}
    >
      {dice.map((value, index) => (
        <motion.img
          key={`${index}-${value}`}
          src={diceAsset(value)}
          alt={`Die showing ${value}`}
          draggable={false}
          initial={animationsDisabled ? false : { rotate: -25, scale: 0.5 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={animationsDisabled ? { duration: 0 } : undefined}
          className={compact ? 'h-6 w-6 drop-shadow-sm' : 'h-8 w-8 drop-shadow-sm'}
        />
      ))}
    </div>
  );
}

// --- Bottom action dock ----------------------------------------------------

function dockColumns(handPercent: number): string {
  return `minmax(220px, ${handPercent}fr) 10px minmax(520px, ${100 - handPercent}fr)`;
}

function HumanDock({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const dispatch = useGame((s) => s.dispatch);
  const build = useGame((s) => s.build);
  const setBuild = useGame((s) => s.setBuild);
  const debugInfiniteTimer = useGame((s) => s.debugInfiniteTimer);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeGive, setTradeGive] = useState<Bag>(zeroBag);
  const [devPicker, setDevPicker] = useState<null | 'monopoly' | 'yop'>(null);
  const dockPanelsRef = useRef<HTMLDivElement>(null);
  const actionPanelRef = useRef<HTMLDivElement>(null);
  const [handPercent, setHandPercent] = useState(() => loadPanelLayout().handPercent);
  const [handHeight, setHandHeight] = useState(() => loadPanelLayout().handHeight);
  const [dockWidth, setDockWidth] = useState(0);
  const [actionPanelHeight, setActionPanelHeight] = useState(0);
  const liveHandPercent = useRef(handPercent);
  const liveHandHeight = useRef(handHeight);
  const me = game.players[humanId];
  const concurrent = isConcurrentPhase(game);
  const myTurn = concurrent ? !game.pending.passed[humanId] : game.currentPlayer === humanId;
  const inMain = myTurn && (game.phase === 'main' || concurrent);
  const canRoll = myTurn && game.phase === 'roll';
  const canStartRoll = myTurn && game.phase === 'startingRoll';
  const mustResolveAction = (game.pending.freeRoads[humanId] ?? 0) > 0 || build?.kind === 'knight';
  const canTakeRoll = canRoll && !mustResolveAction;
  const passed = !!game.pending.passed[humanId];
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
    setTradeGive((current) =>
      current[resource] >= me.resources[resource]
        ? current
        : { ...current, [resource]: current[resource] + 1 },
    );
    setTradeOpen(true);
  };
  const removeTradeCard = (resource: Resource) =>
    setTradeGive((current) => ({ ...current, [resource]: Math.max(0, current[resource] - 1) }));
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (devPicker) setDevPicker(null);
      else if (tradeOpen) closeTrade();
      else if (build) setBuild(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [build, devPicker, setBuild, tradeOpen]);

  // --- Discard flow: select cards in-hand, confirm, or auto-drop on timeout ---
  const required = game.phase === 'discard' ? (game.pending.discards[humanId] ?? 0) : 0;
  const discarding = required > 0;
  const infiniteTime =
    debugInfiniteTimer?.player === game.currentPlayer && debugInfiniteTimer.turn === game.turn;
  const [sel, setSel] = useState<Bag>(zeroBag);
  const [remaining, setRemaining] = useState<number>(game.rules.turnTimer);
  const selectedTotal = RESOURCES.reduce((s, r) => s + sel[r], 0);

  useEffect(() => {
    const dock = dockPanelsRef.current;
    const actions = actionPanelRef.current;
    if (!dock || !actions) return;
    const observer = new ResizeObserver(() => {
      setDockWidth(dock.getBoundingClientRect().width);
      setActionPanelHeight(actions.getBoundingClientRect().height);
    });
    observer.observe(dock);
    observer.observe(actions);
    return () => observer.disconnect();
  }, []);

  const resolvedHandPercent =
    dockWidth > 0 ? clampDockHandPercent(dockWidth, handPercent) : handPercent;
  const resolvedHandHeight = clampDockHandHeight(window.innerHeight, handHeight, actionPanelHeight);

  const resizeDock = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !dockPanelsRef.current) return;
    const bounds = dockPanelsRef.current.getBoundingClientRect();
    liveHandPercent.current = clampDockHandPercent(
      bounds.width,
      ((event.clientX - bounds.left) / bounds.width) * 100,
    );
    dockPanelsRef.current.style.gridTemplateColumns = dockColumns(liveHandPercent.current);
  };
  const finishDockResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setHandPercent(liveHandPercent.current);
    savePanelLayout({ handPercent: liveHandPercent.current });
  };
  const resizeDockHeight = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !dockPanelsRef.current) return;
    const bounds = dockPanelsRef.current.getBoundingClientRect();
    liveHandHeight.current = clampDockHandHeight(
      window.innerHeight,
      event.clientY - bounds.top,
      actionPanelRef.current?.getBoundingClientRect().height ?? 0,
    );
    dockPanelsRef.current.style.setProperty('--dock-hand-height', `${liveHandHeight.current}px`);
  };
  const finishDockHeightResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setHandHeight(liveHandHeight.current);
    savePanelLayout({ handHeight: liveHandHeight.current });
  };
  const resizeDockWithKeyboard = (direction: number) => {
    const next = clampDockHandPercent(
      dockPanelsRef.current?.getBoundingClientRect().width ?? dockWidth,
      liveHandPercent.current + direction * 2,
    );
    liveHandPercent.current = next;
    setHandPercent(next);
    savePanelLayout({ handPercent: next });
  };

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
        dispatch({
          type: 'discard',
          player: humanId,
          resources: randomDiscard(meRef.current.resources, requiredRef.current),
        });
      }
    }, 1000);
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
            dispatch({ type: 'playMonopoly', resource: resources[0], player: humanId });
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
            dispatch({ type: 'playYearOfPlenty', resources, player: humanId });
            setDevPicker(null);
          }}
          onClose={() => setDevPicker(null)}
        />
      )}
      <div
        ref={dockPanelsRef}
        className="flex w-full flex-col items-stretch xl:grid xl:gap-0"
        style={
          {
            gridTemplateColumns: dockColumns(resolvedHandPercent),
            '--dock-hand-height': `${resolvedHandHeight}px`,
          } as CSSProperties
        }
      >
        {/* Resource hand — fanned cards, grouped by resource (click to discard) */}
        <div
          data-hand-panel
          className={`flex h-[var(--dock-hand-height)] min-h-[70px] w-full min-w-0 flex-none items-center gap-2 overflow-x-auto px-2 pb-2 pt-3 xl:h-auto xl:min-h-[82px] xl:flex-1 xl:px-3 xl:pt-4 ${CARD} ${discarding ? 'ring-2 ring-amber-400' : ''}`}
        >
          <ResourceHand
            game={game}
            me={me}
            discard={discarding ? { sel, onToggle: toggleDiscard } : undefined}
            tradeSelected={tradeOpen ? tradeGive : undefined}
            onCardClick={inMain ? addTradeCard : undefined}
            onDevPick={setDevPicker}
          />
        </div>

        <div
          role="separator"
          tabIndex={0}
          aria-label="Resize resource cards and build controls"
          aria-orientation="horizontal"
          aria-valuenow={Math.round(resolvedHandHeight)}
          title="Drag to resize · Right-click to reset"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={resizeDockHeight}
          onPointerUp={finishDockHeightResize}
          onPointerCancel={finishDockHeightResize}
          onContextMenu={(event) => {
            event.preventDefault();
            liveHandHeight.current = DEFAULT_PANEL_LAYOUT.handHeight;
            setHandHeight(DEFAULT_PANEL_LAYOUT.handHeight);
            savePanelLayout({ handHeight: DEFAULT_PANEL_LAYOUT.handHeight });
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            const next = clampDockHandHeight(
              window.innerHeight,
              liveHandHeight.current + (event.key === 'ArrowDown' ? 8 : -8),
              actionPanelRef.current?.getBoundingClientRect().height ?? actionPanelHeight,
            );
            liveHandHeight.current = next;
            setHandHeight(next);
            savePanelLayout({ handHeight: next });
          }}
          className="group flex h-2.5 cursor-row-resize touch-none items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-p-green xl:hidden"
        >
          <span className="h-1 w-14 rounded-full bg-ink/20 opacity-50 transition group-hover:bg-ink/50 group-hover:opacity-100 group-active:bg-ink group-focus-visible:bg-p-green group-focus-visible:opacity-100" />
        </div>

        <div
          role="separator"
          tabIndex={0}
          aria-label="Resize resource cards and build controls"
          aria-orientation="vertical"
          aria-valuenow={Math.round(resolvedHandPercent)}
          title="Drag to resize · Right-click to reset"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={resizeDock}
          onPointerUp={finishDockResize}
          onPointerCancel={finishDockResize}
          onContextMenu={(event) => {
            event.preventDefault();
            liveHandPercent.current = DEFAULT_PANEL_LAYOUT.handPercent;
            setHandPercent(DEFAULT_PANEL_LAYOUT.handPercent);
            savePanelLayout({ handPercent: DEFAULT_PANEL_LAYOUT.handPercent });
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            resizeDockWithKeyboard(event.key === 'ArrowRight' ? 1 : -1);
          }}
          className="group hidden cursor-col-resize touch-none items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-p-green xl:flex"
        >
          <span className="h-12 w-1 rounded-full bg-ink/20 opacity-50 transition group-hover:bg-ink/50 group-hover:opacity-100 group-active:bg-ink group-focus-visible:bg-p-green group-focus-visible:opacity-100" />
        </div>

        {/* Action menu */}
        <div
          ref={actionPanelRef}
          className={`relative flex w-full min-w-0 shrink-0 items-stretch justify-start gap-1.5 overflow-x-auto p-1.5 xl:w-auto xl:min-w-[520px] xl:justify-between xl:overflow-visible xl:p-2 ${CARD}`}
        >
          {myTurn && (canStartRoll || canRoll || game.dice) && (
            <RollDiceDisplay
              dice={game.dice}
              onRoll={
                canStartRoll
                  ? () => dispatch({ type: 'rollForStart' })
                  : canTakeRoll
                    ? () => dispatch({ type: 'rollDice' })
                    : undefined
              }
            />
          )}
          <ActionButton
            sprite={TRADE_FRAME}
            label="Trade"
            onClick={openTrade}
            disabled={!inMain}
            reason={!inMain ? 'Available during your action phase' : undefined}
          />
          <ActionButton
            sprite={CARD_DEV_BACK_FRAME}
            label="Dev"
            cost={COSTS.devCard}
            onClick={() => dispatch({ type: 'buyDevCard', player: humanId })}
            disabled={!inMain || !canAfford(me.resources, COSTS.devCard) || devDeckSize(game) === 0}
            reason={
              !inMain
                ? 'Available during your action phase'
                : devDeckSize(game) === 0
                  ? 'The development deck is empty'
                  : !canAfford(me.resources, COSTS.devCard)
                    ? 'Not enough resources'
                    : undefined
            }
          />
          <ActionButton
            sprite={roadFrame(me.color)}
            label="Road"
            cost={COSTS.road}
            active={build?.kind === 'road'}
            onClick={() => toggle('road')}
            disabled={!inMain || !canAfford(me.resources, COSTS.road) || me.stock.roads === 0}
            reason={
              !inMain
                ? 'Available during your action phase'
                : me.stock.roads === 0
                  ? 'No roads remaining'
                  : !canAfford(me.resources, COSTS.road)
                    ? 'Not enough resources'
                    : undefined
            }
          />
          <ActionButton
            sprite={settlementFrame(me.color)}
            label="Town"
            cost={COSTS.settlement}
            active={build?.kind === 'settlement'}
            onClick={() => toggle('settlement')}
            disabled={
              !inMain || !canAfford(me.resources, COSTS.settlement) || me.stock.settlements === 0
            }
            reason={
              !inMain
                ? 'Available during your action phase'
                : me.stock.settlements === 0
                  ? 'No towns remaining'
                  : !canAfford(me.resources, COSTS.settlement)
                    ? 'Not enough resources'
                    : undefined
            }
          />
          <ActionButton
            sprite={cityFrame(me.color)}
            label="City"
            cost={COSTS.city}
            active={build?.kind === 'city'}
            onClick={() => toggle('city')}
            disabled={!inMain || !canAfford(me.resources, COSTS.city) || me.stock.cities === 0}
            reason={
              !inMain
                ? 'Available during your action phase'
                : me.stock.cities === 0
                  ? 'No cities remaining'
                  : !canAfford(me.resources, COSTS.city)
                    ? 'Not enough resources'
                    : undefined
            }
          />
          <div className="mx-0.5 w-px self-stretch bg-black/10 dark:bg-white/15" />
          {canRoll || canStartRoll ? (
            <button
              disabled={mustResolveAction}
              onClick={() => dispatch({ type: canStartRoll ? 'rollForStart' : 'rollDice' })}
              className={`${BTN_BASE} min-w-14 flex-1 px-3 text-base md:px-4 ${mustResolveAction ? 'bg-card-alt text-ink-faint' : 'bg-p-green text-white shadow-soft hover:-translate-y-0.5 hover:brightness-105'}`}
            >
              🎲
              <span className="ml-1 hidden sm:inline">
                {canStartRoll ? 'Roll for first' : 'Roll'}
              </span>
            </button>
          ) : concurrent ? (
            <button
              disabled={!passed && mustResolveAction}
              onClick={() =>
                dispatch(
                  passed
                    ? { type: 'cancelPass', player: humanId }
                    : { type: 'passRound', player: humanId },
                )
              }
              title={passed ? 'Change your mind and keep playing this round' : undefined}
              className={`${BTN_BASE} min-w-14 flex-1 px-3 text-base md:px-4 ${passed ? 'bg-card-alt text-ink-soft hover:bg-ink/10' : mustResolveAction ? 'bg-card-alt text-ink-faint' : 'bg-p-green text-white shadow-soft hover:-translate-y-0.5 hover:brightness-105'}`}
            >
              {passed ? (
                'Waiting… (tap to resume)'
              ) : (
                <>
                  Ready<span className="ml-1 hidden sm:inline">for next round</span>
                </>
              )}
            </button>
          ) : (
            <button
              disabled={!inMain || mustResolveAction}
              onClick={() => dispatch({ type: 'endTurn' })}
              className={`${BTN_BASE} min-w-14 flex-1 px-3 text-base md:px-4 ${inMain && !mustResolveAction ? 'bg-p-green text-white shadow-soft hover:-translate-y-0.5 hover:brightness-105' : 'bg-card-alt text-ink-faint'}`}
            >
              End<span className="ml-1 hidden sm:inline">Turn</span>
            </button>
          )}
        </div>
      </div>

      {tradeOpen && inMain && (
        <TradePanel
          game={game}
          give={tradeGive}
          onRemoveGive={removeTradeCard}
          onResetGive={resetTradeCards}
          onClose={closeTrade}
        />
      )}

      <AnimatePresence>
        {build && (
          <Hint key="build">
            Select a spot on the board ·{' '}
            <button className="underline" onClick={() => setBuild(null)}>
              cancel
            </button>
          </Hint>
        )}
        {(game.pending.freeRoads[humanId] ?? 0) > 0 && myTurn && (
          <Hint key="free">
            Place {game.pending.freeRoads[humanId]} free road
            {game.pending.freeRoads[humanId] > 1 ? 's' : ''}
          </Hint>
        )}
      </AnimatePresence>
    </div>
  );
}

function TurnCountdown({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const dispatch = useGame((s) => s.dispatch);
  const debugInfiniteTimer = useGame((s) => s.debugInfiniteTimer);
  const humanMustAct =
    !isConcurrentPhase(game) && game.currentPlayer === humanId && game.phase !== 'discard';
  const seconds = game.rules.turnTimer;
  const infiniteTime =
    debugInfiniteTimer?.player === game.currentPlayer && debugInfiniteTimer.turn === game.turn;
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
    }, 1000);
    return () => clearInterval(interval);
  }, [actionKey, dispatch, humanId, humanMustAct, infiniteTime, seconds]);

  if (!humanMustAct || game.phase === 'gameOver') return null;
  return (
    <span
      className={`ml-1 rounded-lg px-2 py-1 text-xs font-extrabold tabular-nums ${remaining <= 5 ? 'bg-p-red text-white' : 'bg-card-alt text-ink'}`}
    >
      {infiniteTime ? '∞' : `${remaining}s`}
    </span>
  );
}

function RoundCountdown({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const dispatch = useGame((s) => s.dispatch);
  const humanWaiting = isConcurrentPhase(game) && !game.pending.passed[humanId];
  const seconds = game.rules.turnTimer;
  const [remaining, setRemaining] = useState<number>(seconds);
  const clock = useRef<{ turn: number; startedAt: number }>({ turn: -1, startedAt: 0 });

  useEffect(() => {
    if (!humanWaiting) return;
    if (clock.current.turn !== game.turn) {
      clock.current = { turn: game.turn, startedAt: Date.now() };
    }
    const update = () => {
      const left = seconds - Math.floor((Date.now() - clock.current.startedAt) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) dispatch({ type: 'passRound', player: humanId });
      return left;
    };
    update();
    const interval = setInterval(() => {
      if (update() <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [dispatch, game.turn, humanId, humanWaiting, seconds]);

  if (!isConcurrentPhase(game)) return null;
  return (
    <span
      className={`ml-1 rounded-lg px-2 py-1 text-xs font-extrabold tabular-nums ${humanWaiting && remaining <= 5 ? 'bg-p-red text-white' : 'bg-card-alt text-ink'}`}
    >
      {humanWaiting ? `${remaining}s` : 'waiting…'}
    </span>
  );
}

function RollDiceDisplay({ dice, onRoll }: { dice: [number, number] | null; onRoll?: () => void }) {
  const faces: [number, number] = dice ?? [1, 6];
  const animationsDisabled = useReducedMotionPreference();
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
        <motion.div
          key={`${index}-${value}`}
          initial={animationsDisabled ? false : dice ? { rotate: -25, scale: 0.5 } : undefined}
          animate={
            animationsDisabled
              ? { rotate: 0, scale: 1, y: 0 }
              : dice
                ? { rotate: 0, scale: 1, y: 0 }
                : { rotate: index === 0 ? -8 : 8, y: index === 0 ? 1 : -1 }
          }
          transition={
            animationsDisabled
              ? { duration: 0 }
              : dice
                ? { type: 'spring', stiffness: 320, damping: 17 }
                : { repeat: Infinity, repeatType: 'reverse', duration: 0.7, ease: 'easeInOut' }
          }
        >
          <img
            src={diceAsset(value)}
            alt=""
            draggable={false}
            className="h-14 w-14 drop-shadow-lg"
          />
        </motion.div>
      ))}
    </button>
  );
}

/** Banner shown above the hand while the human must discard cards. */
function DiscardBanner({
  selected,
  required,
  remaining,
  infinite,
  onConfirm,
}: {
  selected: number;
  required: number;
  remaining: number;
  infinite: boolean;
  onConfirm: () => void;
}) {
  const done = selected === required;
  const low = remaining <= 5;
  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 text-sm font-bold shadow-pop ring-1 ${
        done
          ? 'bg-p-green text-white ring-white/30'
          : 'bg-amber-300 text-amber-950 ring-amber-500/40'
      }`}
    >
      <span>
        Select cards to discard ({selected}/{required})
      </span>
      <span
        className={`rounded-full px-2 py-0.5 font-mono tabular-nums ${low ? 'bg-p-red text-white' : 'bg-black/15'}`}
      >
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
function ResourceHand({
  game,
  me,
  discard,
  tradeSelected,
  onCardClick,
  onDevPick,
}: {
  game: GameState;
  me: Player;
  discard?: DiscardCtl;
  tradeSelected?: Bag;
  onCardClick?: (resource: Resource) => void;
  onDevPick: (picker: 'monopoly' | 'yop') => void;
}) {
  const present = RESOURCES.filter((r) => me.resources[r] - (tradeSelected?.[r] ?? 0) > 0);
  const hasDevCards = me.devCards.some((card) => !card.played);
  if (present.length === 0 && !hasDevCards) {
    return (
      <span className="w-full text-center text-sm font-semibold text-ink-faint">No resources</span>
    );
  }
  return (
    <>
      {present.map((r) =>
        discard ? (
          <FannedStack
            key={r}
            res={r}
            sprite={RESOURCE_CARD_FRAME[r]}
            count={me.resources[r] - (tradeSelected?.[r] ?? 0)}
            title={r}
            selected={discard.sel[r]}
            onToggle={(delta) => discard.onToggle(r, delta)}
          />
        ) : (
          <StackedCard
            key={r}
            handStackId={r}
            sprite={RESOURCE_CARD_FRAME[r]}
            alt={r}
            count={me.resources[r] - (tradeSelected?.[r] ?? 0)}
            direction="left"
            maxVisible={6}
            overlap={7}
            onClick={onCardClick ? () => onCardClick(r) : undefined}
          />
        ),
      )}
      {!discard && <DevelopmentCards game={game} me={me} onPick={onDevPick} />}
    </>
  );
}

function FannedStack({
  sprite,
  count,
  title,
  res,
  selected = 0,
  onToggle,
  onClick,
}: {
  sprite: string;
  count: number;
  title: string;
  res?: string;
  selected?: number;
  onToggle?: (delta: number) => void;
  onClick?: () => void;
}) {
  const cardW = 40;
  // Tighten the overlap as a pile grows so wide hands stay compact.
  const offset = count > 6 ? Math.max(11, 100 / count) : 18;
  const width = cardW + (count - 1) * offset;
  const clickable = !!onToggle || !!onClick;
  return (
    <div
      data-hand-stack={res}
      className="relative shrink-0"
      style={{ width, height: 58 }}
      title={`${count} ${title}`}
    >
      {Array.from({ length: count }).map((_, i) => {
        const isSel = clickable && i >= count - selected;
        return (
          <PackedSprite
            key={i}
            name={sprite}
            onClick={onToggle ? () => onToggle(isSel ? -1 : 1) : onClick}
            className={`absolute bottom-0 rounded-[5px] shadow-sm transition-transform ${
              isSel ? 'ring-2 ring-amber-400' : 'ring-1 ring-black/10'
            } ${clickable ? 'cursor-pointer' : ''}`}
            style={{
              left: i * offset,
              width: cardW,
              zIndex: i,
              transform: isSel ? 'translateY(-10px)' : undefined,
            }}
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

function ActionButton({
  img,
  sprite,
  label,
  cost,
  onClick,
  disabled,
  active,
  reason: _reason,
}: {
  img?: string;
  sprite?: string;
  label: string;
  cost?: Partial<Record<Resource, number>>;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  reason?: string;
}) {
  const title = cost
    ? `${label} — ${RESOURCES.filter((r) => cost[r])
        .map((r) => `${cost[r]} ${r}`)
        .join(', ')}`
    : label;
  const [showHeldCost, setShowHeldCost] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const startHold = () => {
    if (!cost || window.matchMedia('(min-width: 768px)').matches) return;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      suppressClick.current = true;
      setShowHeldCost(true);
    }, 450);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setShowHeldCost(false);
  };
  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );
  return (
    <span className="group relative flex min-w-14 flex-1 xl:min-w-0">
      <button
        data-dock-action={label}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (!disabled) onClick();
        }}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        onPointerLeave={endHold}
        title={disabled ? undefined : title}
        className={`${BTN_BASE} min-h-11 w-full flex-1 flex-col gap-0.5 px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-p-green ${
          active
            ? 'bg-amber-300 text-amber-950 shadow-soft'
            : disabled
              ? 'bg-card-alt/50 text-ink-faint'
              : 'bg-card-alt text-ink hover:-translate-y-0.5 hover:shadow-soft'
        }`}
      >
        {sprite ? (
          <PackedSprite name={sprite} className={`h-9 w-9 ${disabled ? 'opacity-45' : ''}`} />
        ) : (
          <img
            src={img}
            alt=""
            className={`h-9 w-9 object-contain ${disabled ? 'opacity-45' : ''}`}
          />
        )}
        {cost ? (
          <>
            <span className="text-[10px] font-bold leading-none md:hidden">{label}</span>
            <span className="hidden leading-none md:inline">
              <Cost cost={cost} />
            </span>
          </>
        ) : (
          <span className="text-[10px] font-bold leading-none">{label}</span>
        )}
      </button>
      {cost && showHeldCost && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 flex min-h-9 -translate-x-1/2 items-center rounded-xl bg-ink px-3 text-card shadow-pop md:hidden"
        >
          <Cost cost={cost} />
        </span>
      )}
    </span>
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
function DevelopmentCards({
  game,
  me,
  onPick,
}: {
  game: GameState;
  me: Player;
  onPick: (picker: 'monopoly' | 'yop') => void;
}) {
  const dispatch = useGame((s) => s.dispatch);
  const setBuild = useGame((s) => s.setBuild);
  const humanId = useGame((s) => s.humanId);
  const concurrent = isConcurrentPhase(game);
  const myTurn = concurrent ? !game.pending.passed[humanId] : game.currentPlayer === humanId;
  const canPlay =
    myTurn &&
    (game.phase === 'roll' || game.phase === 'main' || concurrent) &&
    !game.pending.playedDevThisTurn[humanId];

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
    <div
      data-dev-hand
      className="relative flex shrink-0 items-center gap-2 border-l border-ink/10 pl-2 dark:border-white/10"
    >
      {counts.knight.total > 0 && (
        <DevHandCard
          type="knight"
          count={counts.knight.total}
          enabled={play('knight')}
          onClick={() => setBuild({ kind: 'knight' })}
        />
      )}
      {counts.roadBuilding.total > 0 && (
        <DevHandCard
          type="roadBuilding"
          count={counts.roadBuilding.total}
          enabled={play('roadBuilding')}
          onClick={() => dispatch({ type: 'playRoadBuilding', player: humanId })}
        />
      )}
      {counts.monopoly.total > 0 && (
        <DevHandCard
          type="monopoly"
          count={counts.monopoly.total}
          enabled={play('monopoly')}
          onClick={() => onPick('monopoly')}
        />
      )}
      {counts.yearOfPlenty.total > 0 && (
        <DevHandCard
          type="yearOfPlenty"
          count={counts.yearOfPlenty.total}
          enabled={play('yearOfPlenty')}
          onClick={() => onPick('yop')}
        />
      )}
      {counts.victoryPoint.total > 0 && (
        <DevHandCard type="victoryPoint" count={counts.victoryPoint.total} enabled={false} />
      )}
    </div>
  );
}

function DevHandCard({
  type,
  count,
  enabled,
  onClick,
}: {
  type: DevCardType;
  count: number;
  enabled: boolean;
  onClick?: () => void;
}) {
  const label: Record<DevCardType, string> = {
    knight: 'Knight',
    roadBuilding: 'Road Building',
    monopoly: 'Monopoly',
    yearOfPlenty: 'Year of Plenty',
    victoryPoint: 'Victory Point',
  };
  return (
    <StackedCard
      sprite={DEV_CARD_FRAME[type]}
      alt={label[type]}
      count={count}
      direction="left"
      maxVisible={4}
      overlap={7}
      title={enabled ? `Play ${label[type]}` : label[type]}
      onClick={enabled ? onClick : undefined}
      className={enabled ? '' : 'opacity-60'}
    />
  );
}

function ResourcePicker({
  count,
  title,
  onPick,
  onClose,
}: {
  count: number;
  title: string;
  onPick: (rs: Resource[]) => void;
  onClose: () => void;
}) {
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
          <button
            key={r}
            onClick={() => choose(r)}
            className="flex items-center justify-center rounded-xl bg-card-alt p-1.5 transition hover:-translate-y-0.5 hover:shadow-soft"
          >
            <ResCard resource={r} size={30} />
          </button>
        ))}
      </div>
      <button
        onClick={onClose}
        className="mt-1 w-full text-center text-[11px] text-ink-faint underline"
      >
        cancel
      </button>
    </div>
  );
}

// --- Victory + error -------------------------------------------------------

function VictoryOverlay({ game }: { game: GameState }) {
  const newGame = useGame((s) => s.newGame);
  const exitGame = useExitGame();
  const mode = useGame((s) => s.mode);
  const startedAt = useGame((s) => s.matchStartedAt);
  const endedAt = useGame((s) => s.matchEndedAt);
  const [tab, setTab] = useState<'overview' | 'dice' | 'resources' | 'development' | 'activity'>(
    'overview',
  );
  if (game.phase !== 'gameOver') return null;
  if (game.winner === null) {
    return (
      <Overlay>
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`w-full max-w-md p-6 text-center ${CARD}`}
        >
          <div className="text-4xl">🏁</div>
          <h2 className="mt-2 font-display text-2xl font-extrabold">Game ended</h2>
          <p className="mt-2 text-sm text-ink-soft">All players left the game.</p>
          <button
            onClick={() => { void exitGame(); }}
            className={`${BTN_BASE} mt-5 bg-card-alt px-5 py-2.5 text-sm text-ink hover:bg-ink/10`}
          >
            Main menu
          </button>
        </motion.div>
      </Overlay>
    );
  }
  const winner = game.players[game.winner];
  const rows = game.players
    .map((player) => ({
      player,
      points: victoryPoints(game, player.id),
      towns: Object.values(game.buildings).filter(
        (piece) => piece.owner === player.id && piece.type === 'settlement',
      ).length,
      cities: Object.values(game.buildings).filter(
        (piece) => piece.owner === player.id && piece.type === 'city',
      ).length,
      vpCards: player.devCards.filter((card) => card.type === 'victoryPoint').length,
      roadAward: game.longestRoad.player === player.id ? VP_LONGEST_ROAD : 0,
      armyAward: game.largestArmy.player === player.id ? VP_LARGEST_ARMY : 0,
      route: longestRoadLength(game, player.id),
    }))
    .sort((a, b) => b.points - a.points || a.player.id - b.player.id);
  const tabs = ['overview', 'dice', 'resources', 'development', 'activity'] as const;
  const duration = startedAt ? formatDuration((endedAt ?? Date.now()) - startedAt) : '0:00';
  return (
    <Overlay>
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className={`flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden p-4 text-center sm:p-6 ${CARD}`}
      >
        <div className="flex flex-wrap items-center justify-center gap-x-3">
          <span className="text-4xl">🏆</span>
          <div className="text-left">
            <h2
              className="font-display text-2xl font-extrabold sm:text-3xl"
              style={{ color: PLAYER_CSS[winner.color] }}
            >
              {winner.name === 'You' ? 'You win!' : `${winner.name} wins!`}
            </h2>
            <p className="text-sm text-ink-soft">
              Turn {game.turn} · {duration}
            </p>
          </div>
        </div>
        <div className="my-4 flex shrink-0 gap-1 overflow-x-auto rounded-xl bg-card-alt p-1">
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`min-w-max flex-1 rounded-lg px-3 py-2 text-xs font-extrabold capitalize transition ${tab === item ? 'bg-card text-ink shadow-soft' : 'text-ink-soft hover:bg-ink/10'}`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-2xl bg-card-alt ring-1 ring-ink/10">
          {tab === 'overview' && <OverviewStats rows={rows} />}
          {tab === 'dice' && <DiceStats game={game} />}
          {tab === 'resources' && <ResourceStats game={game} rows={rows} />}
          {tab === 'development' && <DevelopmentStats rows={rows} />}
          {tab === 'activity' && <ActivityStats rows={rows} />}
        </div>
        <div className="mt-4 flex shrink-0 flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              void exitGame();
            }}
            className={`${BTN_BASE} bg-card-alt px-5 py-2.5 text-sm text-ink hover:bg-ink/10`}
          >
            Main menu
          </button>
          {mode === 'local' && (
            <button
              onClick={() =>
                newGame({
                  players: game.players.map((p) => ({
                    name: p.name,
                    isBot: p.isBot,
                    color: p.color,
                    botDifficulty: p.botDifficulty ?? undefined,
                  })),
                  layout: 'random',
                  rules: game.rules,
                })
              }
              className={`${BTN_BASE} bg-p-green px-5 py-2.5 text-sm text-white hover:-translate-y-0.5 hover:brightness-105`}
            >
              Play again
            </button>
          )}
        </div>
      </motion.div>
    </Overlay>
  );
}

function PlayerResult({ player, rank }: { player: Player; rank?: number }) {
  const color = PLAYER_CSS[player.color];
  return (
    <div className="flex min-w-40 items-center gap-2">
      {rank !== undefined && (
        <span className="w-5 text-center font-extrabold text-ink-faint">{rank}</span>
      )}
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full ring-2"
        style={{ background: `${color}22`, boxShadow: `inset 0 0 0 2px ${color}` }}
      >
        <PlayerIcon isBot={player.isBot} className="h-7 w-7" />
      </span>
      <span className="font-display font-bold text-ink">{player.name}</span>
    </div>
  );
}

type StatColumn<T> = { label: string; title?: string; value: (row: T) => number };

function PlayerStatTable<T extends { player: Player }>({
  rows,
  columns,
  totals = false,
  ranked = false,
}: {
  rows: T[];
  columns: StatColumn<T>[];
  totals?: boolean;
  ranked?: boolean;
}) {
  const highs = columns.map((column) => Math.max(...rows.map(column.value)));
  return (
    <table className="w-full min-w-[720px] border-collapse text-sm">
      <thead>
        <tr className="sticky top-0 z-10 border-b border-ink/10 bg-card-alt text-[11px] uppercase tracking-wide text-ink-faint">
          <th className="px-3 py-2 text-left">Player</th>
          {columns.map((column) => (
            <th key={column.label} title={column.title} className="px-2 py-2 text-center">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rank) => (
          <tr key={row.player.id} className="border-b border-ink/5">
            <td className="px-3 py-2 text-left">
              <PlayerResult player={row.player} rank={ranked ? rank + 1 : undefined} />
            </td>
            {columns.map((column, index) => {
              const value = column.value(row);
              const high = value > 0 && value === highs[index];
              return (
                <td key={column.label} className="px-2 py-2 text-center">
                  <span
                    className={`inline-flex min-w-7 justify-center rounded-lg px-2 py-1 font-bold ${high ? 'bg-amber-300 text-amber-950 ring-1 ring-amber-500/40' : 'text-ink-soft'}`}
                  >
                    {value}
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
        {totals && (
          <tr className="sticky bottom-0 bg-card font-extrabold text-ink">
            <td className="px-3 py-2 text-left">Total</td>
            {columns.map((column) => (
              <td key={column.label} className="px-2 py-2 text-center">
                {rows.reduce((sum, row) => sum + column.value(row), 0)}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

function OverviewStats({
  rows,
}: {
  rows: Array<{
    player: Player;
    points: number;
    towns: number;
    cities: number;
    vpCards: number;
    roadAward: number;
    armyAward: number;
  }>;
}) {
  const columns: StatColumn<(typeof rows)[number]>[] = [
    { label: 'Towns', title: 'Victory points from towns', value: (row) => row.towns },
    { label: 'Cities', title: 'Victory points from cities', value: (row) => row.cities * 2 },
    { label: 'VP cards', value: (row) => row.vpCards },
    { label: 'Road', title: 'Longest Road points', value: (row) => row.roadAward },
    { label: 'Army', title: 'Largest Army points', value: (row) => row.armyAward },
    { label: 'Total VP', value: (row) => row.points },
  ];
  return <PlayerStatTable rows={rows} columns={columns} ranked />;
}

const DICE_WAYS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};
function DiceStats({ game }: { game: GameState }) {
  const total = Object.values(game.diceStats).reduce((sum, count) => sum + count, 0);
  const peak = Math.max(1, ...Object.values(game.diceStats));
  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-5">
      <div className="grid min-w-[620px] grid-cols-11 gap-2 border-b border-ink/10 px-2 pt-3">
        {Object.keys(DICE_WAYS)
          .map(Number)
          .map((roll) => {
            const count = game.diceStats[roll] ?? 0;
            const percent = total ? Math.round((count / total) * 100) : 0;
            const height = count > 0 ? Math.max(5, (count / peak) * 100) : 0;
            return (
              <div
                key={roll}
                title={`${roll}: ${count} rolls (${percent}%), expected ${Math.round((DICE_WAYS[roll] / 36) * 100)}%`}
                className="flex h-64 flex-col items-center justify-end"
              >
                <span className="mb-1 text-xs font-extrabold tabular-nums text-ink">{count}</span>
                <div className="flex h-48 w-full items-end justify-center">
                  <div
                    className="w-full max-w-12 rounded-t-lg bg-p-blue shadow-soft transition-all"
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className="mt-1 text-[9px] text-ink-faint">{percent}%</span>
                <span className="pb-2 font-display text-lg font-extrabold text-ink">{roll}</span>
              </div>
            );
          })}
      </div>
      <div className="pt-3 text-sm font-extrabold text-ink">
        Total gameplay rolls: {total}{' '}
        <span className="ml-2 font-normal text-ink-faint">Opening rolls excluded</span>
      </div>
    </div>
  );
}

function ResourceStats<T extends { player: Player }>({ rows }: { game: GameState; rows: T[] }) {
  const columns: StatColumn<T>[] = [
    ...RESOURCES.map((resource) => ({
      label: resource[0].toUpperCase() + resource.slice(1),
      value: (row: T) => row.player.stats.resourcesCollected[resource],
    })),
    { label: 'Total', value: (row: T) => totalResources(row.player.stats.resourcesCollected) },
  ];
  return <PlayerStatTable rows={rows} columns={columns} totals />;
}

const DEV_LABELS: Record<DevCardType, string> = {
  knight: 'Knight',
  roadBuilding: 'Road Building',
  monopoly: 'Monopoly',
  yearOfPlenty: 'Year of Plenty',
  victoryPoint: 'VP Card',
};
const DEV_TYPES = Object.keys(DEV_LABELS) as DevCardType[];
function DevelopmentStats<T extends { player: Player }>({ rows }: { rows: T[] }) {
  const columns: StatColumn<T>[] = [
    ...DEV_TYPES.map((type) => ({
      label: DEV_LABELS[type],
      value: (row: T) => row.player.stats.devCardsCollected[type],
    })),
    {
      label: 'Total',
      value: (row: T) =>
        DEV_TYPES.reduce((sum, type) => sum + row.player.stats.devCardsCollected[type], 0),
    },
  ];
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
  return (
    <div>
      <div className="flex gap-1 border-b border-ink/10 p-2">
        {modes.map((item) => (
          <button
            key={item}
            onClick={() => setMode(item)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-extrabold capitalize transition ${mode === item ? 'bg-card text-ink shadow-soft' : 'text-ink-soft hover:bg-ink/10'}`}
          >
            {item}
          </button>
        ))}
      </div>
      <PlayerStatTable rows={rows} columns={columns[mode]} totals />
    </div>
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
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
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
  rushRound: 'Everyone acts at once',
  gameOver: 'Game over',
};
