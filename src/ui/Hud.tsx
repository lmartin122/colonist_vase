import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CARD_DEV_BACK, RESOURCE_CARD, TRADE_ICON, cityAsset, roadAsset, settlementAsset } from '../assets';
import { COSTS } from '../engine/constants';
import { canAfford, publicVictoryPoints, totalResources, victoryPoints } from '../engine/helpers';
import type { DevCardType, GameState, Player, Resource } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { PLAYER_CSS } from '../render/palette';
import { useGame } from '../state/store';
import { Sidebar } from './Sidebar';
import { TradePanel } from './TradePanel';

/** Seconds a player has to discard before cards are dropped at random. */
const DISCARD_SECONDS = 20;

type Bag = Record<Resource, number>;
const zeroBag = (): Bag => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

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
        <div className="md:hidden">
          <PlayersColumn game={game} />
        </div>
        <HumanDock game={game} />
      </div>
      <Sidebar game={game} />
      <VictoryOverlay game={game} />
      <ErrorToast />
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
        {thinking && <span className="ml-0.5 animate-pulse text-[11px] text-ink-faint">thinking…</span>}
      </div>
      <Dice dice={game.dice} />
    </div>
  );
}

function Dice({ dice }: { dice: [number, number] | null }) {
  if (!dice) return null;
  return (
    <div className="flex items-center gap-1.5">
      {dice.map((d, i) => (
        <motion.div
          key={`${i}-${d}`}
          initial={{ rotate: -30, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 17 }}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-card font-display text-xl font-extrabold text-ink shadow-soft ring-1 ring-black/5"
        >
          {d}
        </motion.div>
      ))}
    </div>
  );
}

// --- Player sidebar --------------------------------------------------------

function PlayersColumn({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  return (
    <div className="absolute right-2 top-14 flex w-40 flex-col gap-2 sm:right-3 sm:top-16 sm:w-56">
      {game.players.map((p) => (
        <PlayerCard key={p.id} game={game} player={p} isHuman={p.id === humanId} active={p.id === game.currentPlayer} />
      ))}
    </div>
  );
}

function PlayerCard({ game, player, isHuman, active }: { game: GameState; player: Player; isHuman: boolean; active: boolean }) {
  const vp = isHuman ? victoryPoints(game, player.id) : publicVictoryPoints(game, player.id);
  const cards = totalResources(player.resources);
  const devCount = player.devCards.filter((c) => !c.played).length;
  const color = PLAYER_CSS[player.color];
  return (
    <motion.div
      animate={{ scale: active ? 1 : 0.98, opacity: active ? 1 : 0.9 }}
      transition={{ duration: 0.2 }}
      className={`relative overflow-hidden px-3 py-2 sm:py-2.5 ${CARD}`}
      style={active ? { boxShadow: `0 0 0 2px ${color}, 0 6px 20px -6px rgba(20,30,40,.35)` } : undefined}
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
        <span className="inline-flex items-center gap-1" title="cards in hand">🃏 {cards}</span>
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

function Badge({ children, title }: { children: React.ReactNode; title: string }) {
  return <span title={title} className="rounded-md bg-amber-100 px-1 py-0.5 text-[11px] ring-1 ring-amber-300/60">{children}</span>;
}

// --- Bottom action dock ----------------------------------------------------

function HumanDock({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const dispatch = useGame((s) => s.dispatch);
  const build = useGame((s) => s.build);
  const setBuild = useGame((s) => s.setBuild);
  const [tradeOpen, setTradeOpen] = useState(false);
  const me = game.players[humanId];
  const myTurn = game.currentPlayer === humanId;
  const inMain = myTurn && game.phase === 'main';
  const canRoll = myTurn && game.phase === 'roll';
  const toggle = (kind: 'road' | 'settlement' | 'city') =>
    setBuild(build?.kind === kind ? null : { kind });

  // --- Discard flow: select cards in-hand, confirm, or auto-drop on timeout ---
  const required = game.phase === 'discard' ? game.pending.discards[humanId] ?? 0 : 0;
  const discarding = required > 0;
  const [sel, setSel] = useState<Bag>(zeroBag);
  const [remaining, setRemaining] = useState(DISCARD_SECONDS);
  const selectedTotal = RESOURCES.reduce((s, r) => s + sel[r], 0);

  // Keep latest hand/target for the timeout closure.
  const meRef = useRef(me);
  meRef.current = me;
  const requiredRef = useRef(required);
  requiredRef.current = required;

  useEffect(() => {
    if (!discarding) return;
    setSel(zeroBag());
    setRemaining(DISCARD_SECONDS);
    const started = Date.now();
    const id = setInterval(() => {
      const left = DISCARD_SECONDS - Math.floor((Date.now() - started) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) {
        clearInterval(id);
        dispatch({ type: 'discard', player: humanId, resources: randomDiscard(meRef.current.resources, requiredRef.current) });
      }
    }, 250);
    return () => clearInterval(id);
    // Re-arm whenever a fresh discard requirement appears.
  }, [discarding, required, humanId, dispatch]);

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
    <div className="pointer-events-auto absolute bottom-2 left-1/2 flex max-w-[97vw] -translate-x-1/2 flex-col items-center gap-2 sm:bottom-3">
      {discarding && (
        <DiscardBanner
          selected={selectedTotal}
          required={required}
          remaining={remaining}
          onConfirm={() => dispatch({ type: 'discard', player: humanId, resources: sel })}
        />
      )}
      {myTurn && !discarding && <DevCardBar game={game} me={me} />}

      <div className="flex items-stretch justify-center gap-2">
        {/* Resource hand — fanned cards, grouped by resource (click to discard) */}
        <div className={`flex items-center gap-2 px-3 pb-2 pt-4 ${CARD} ${discarding ? 'ring-2 ring-amber-400' : ''}`}>
          <ResourceHand me={me} discard={discarding ? { sel, onToggle: toggleDiscard } : undefined} />
        </div>

        {/* Action menu */}
        {(inMain || canRoll) && (
          <div className={`flex items-stretch gap-1.5 p-2 ${CARD}`}>
            <ActionButton img={TRADE_ICON} label="Trade" onClick={() => setTradeOpen(true)} disabled={!inMain} />
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
            {canRoll ? (
              <button
                onClick={() => dispatch({ type: 'rollDice' })}
                className={`${BTN_BASE} animate-pulse bg-p-green px-4 text-white shadow-soft hover:-translate-y-0.5 hover:brightness-105`}
              >
                🎲<span className="ml-1 hidden sm:inline">Roll</span>
              </button>
            ) : (
              <button
                disabled={!inMain}
                onClick={() => dispatch({ type: 'endTurn' })}
                className={`${BTN_BASE} px-4 ${inMain ? 'bg-p-green text-white shadow-soft hover:-translate-y-0.5 hover:brightness-105' : 'bg-card-alt text-ink-faint'}`}
              >
                End<span className="ml-1 hidden sm:inline">Turn</span>
              </button>
            )}
          </div>
        )}
      </div>

      {tradeOpen && inMain && <TradePanel game={game} onClose={() => setTradeOpen(false)} />}

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

/** Banner shown above the hand while the human must discard cards. */
function DiscardBanner({ selected, required, remaining, onConfirm }: {
  selected: number; required: number; remaining: number; onConfirm: () => void;
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
        0:{String(remaining).padStart(2, '0')}
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
function ResourceHand({ me, discard }: { me: Player; discard?: DiscardCtl }) {
  const present = RESOURCES.filter((r) => me.resources[r] > 0);
  if (present.length === 0) {
    return <span className="px-2 py-3 text-sm font-semibold text-ink-faint">No resources</span>;
  }
  return (
    <>
      {present.map((r) => (
        <FannedStack
          key={r}
          src={RESOURCE_CARD[r]}
          count={me.resources[r]}
          title={r}
          selected={discard ? discard.sel[r] : 0}
          onToggle={discard ? (delta) => discard.onToggle(r, delta) : undefined}
        />
      ))}
    </>
  );
}

function FannedStack({ src, count, title, selected = 0, onToggle }: {
  src: string; count: number; title: string; selected?: number; onToggle?: (delta: number) => void;
}) {
  const cardW = 34;
  // Tighten the overlap as a pile grows so wide hands stay compact.
  const offset = count > 6 ? Math.max(9, 84 / count) : 15;
  const width = cardW + (count - 1) * offset;
  const clickable = !!onToggle;
  return (
    <div className="relative shrink-0" style={{ width, height: 50 }} title={`${count} ${title}`}>
      {Array.from({ length: count }).map((_, i) => {
        const isSel = clickable && i >= count - selected;
        return (
          <img
            key={i}
            src={src}
            alt=""
            draggable={false}
            onClick={onToggle ? () => onToggle(isSel ? -1 : 1) : undefined}
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
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`${BTN_BASE} flex-col gap-0.5 px-2 py-1.5 ${
        active
          ? 'bg-amber-300 text-amber-950 shadow-soft'
          : disabled
            ? 'bg-card-alt/50 text-ink-faint'
            : 'bg-card-alt text-ink hover:-translate-y-0.5 hover:shadow-soft'
      }`}
    >
      <img src={img} alt="" className={`h-7 w-7 object-contain ${disabled ? 'opacity-45' : ''}`} />
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

function DevCardBar({ game, me }: { game: GameState; me: Player }) {
  const dispatch = useGame((s) => s.dispatch);
  const setBuild = useGame((s) => s.setBuild);
  const [picker, setPicker] = useState<null | 'monopoly' | 'yop'>(null);
  const canPlay = (game.phase === 'roll' || game.phase === 'main') && !game.pending.playedDevThisTurn;

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
    <div className={`relative flex items-center gap-1.5 px-2.5 py-1.5 text-xs ${CARD}`}>
      <span className="font-bold text-ink-faint">Cards:</span>
      {counts.knight.total > 0 && <DevChip label={`🛡️ Knight ×${counts.knight.total}`} enabled={play('knight')} onClick={() => setBuild({ kind: 'knight' })} />}
      {counts.roadBuilding.total > 0 && <DevChip label={`🛣️ Roads ×${counts.roadBuilding.total}`} enabled={play('roadBuilding')} onClick={() => dispatch({ type: 'playRoadBuilding' })} />}
      {counts.monopoly.total > 0 && <DevChip label={`💰 Monopoly ×${counts.monopoly.total}`} enabled={play('monopoly')} onClick={() => setPicker('monopoly')} />}
      {counts.yearOfPlenty.total > 0 && <DevChip label={`🎁 Plenty ×${counts.yearOfPlenty.total}`} enabled={play('yearOfPlenty')} onClick={() => setPicker('yop')} />}
      {counts.victoryPoint.total > 0 && <span className="font-semibold text-ink-soft">⭐ VP ×{counts.victoryPoint.total}</span>}

      {picker === 'monopoly' && (
        <ResourcePicker count={1} title="Monopolise a resource" onPick={(rs) => { dispatch({ type: 'playMonopoly', resource: rs[0] }); setPicker(null); }} onClose={() => setPicker(null)} />
      )}
      {picker === 'yop' && (
        <ResourcePicker count={2} title="Take any two" onPick={(rs) => { dispatch({ type: 'playYearOfPlenty', resources: rs }); setPicker(null); }} onClose={() => setPicker(null)} />
      )}
    </div>
  );
}

function DevChip({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) {
  return (
    <button
      disabled={!enabled}
      onClick={onClick}
      className={`${BTN_BASE} px-2 py-1 ${enabled ? 'bg-card-alt hover:-translate-y-0.5 hover:shadow-soft' : 'text-ink-faint opacity-50'}`}
    >
      {label}
    </button>
  );
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
          onClick={() => newGame({ players: game.players.map((p) => ({ name: p.name, isBot: p.isBot })), layout: 'random' })}
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
  setup: 'Placing pieces',
  roll: 'Roll the dice',
  discard: 'Discarding',
  moveRobber: 'Move the robber',
  main: 'Build & trade',
  gameOver: 'Game over',
};
