import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { COSTS } from '../engine/constants';
import { canAfford, publicVictoryPoints, totalResources, victoryPoints } from '../engine/helpers';
import type { DevCardType, GameState, Player, Resource } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { PLAYER_CSS } from '../render/palette';
import { useGame, type BuildMode } from '../state/store';
import { ResourceIcon } from './ResourceIcon';
import { TradePanel } from './TradePanel';

export function Hud() {
  const game = useGame((s) => s.game);
  if (!game) return null;
  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans">
      <TopBar game={game} />
      <PlayersColumn game={game} />
      <LogPanel game={game} />
      <HumanDock game={game} />
      <DiscardModal game={game} />
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
          <ResourceIcon resource={r} size={13} />
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

// --- Log -------------------------------------------------------------------

function LogPanel({ game }: { game: GameState }) {
  const recent = game.log.slice(-5);
  return (
    <div className={`absolute bottom-3 left-2 hidden w-60 p-2.5 text-xs text-ink-soft sm:left-3 sm:block ${CARD}`}>
      {recent.map((e, i) => (
        <div key={game.log.length - recent.length + i} className="truncate leading-5">
          {e.message}
        </div>
      ))}
    </div>
  );
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

  return (
    <div className="pointer-events-auto absolute bottom-2 left-1/2 flex max-w-[96vw] -translate-x-1/2 flex-col items-center gap-2 sm:bottom-3">
      {/* Resource hand */}
      <div className={`flex gap-1 p-1.5 sm:gap-1.5 sm:p-2 ${CARD}`}>
        {RESOURCES.map((r) => (
          <div key={r} className="flex h-12 w-11 flex-col items-center justify-center rounded-xl bg-card-alt/70 sm:w-12" title={r}>
            <ResourceIcon resource={r} size={22} />
            <span className="mt-0.5 font-display text-sm font-extrabold leading-none">{me.resources[r]}</span>
          </div>
        ))}
      </div>

      {/* Primary actions */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {myTurn && game.phase === 'roll' && (
          <button className={`${BTN_BASE} bg-p-green px-5 py-2.5 text-base text-white shadow-soft hover:-translate-y-0.5 hover:brightness-105`} onClick={() => dispatch({ type: 'rollDice' })}>
            🎲 Roll Dice
          </button>
        )}

        {inMain && (
          <>
            <BuildButton label="Road" icon="🛣️" mode={{ kind: 'road' }} cost={COSTS.road} build={build} setBuild={setBuild} me={me} stock={me.stock.roads} />
            <BuildButton label="Town" icon="🏠" mode={{ kind: 'settlement' }} cost={COSTS.settlement} build={build} setBuild={setBuild} me={me} stock={me.stock.settlements} />
            <BuildButton label="City" icon="🏙️" mode={{ kind: 'city' }} cost={COSTS.city} build={build} setBuild={setBuild} me={me} stock={me.stock.cities} />
            <SecondaryButton
              disabled={!canAfford(me.resources, COSTS.devCard) || game.devDeck.length === 0}
              onClick={() => dispatch({ type: 'buyDevCard' })}
              title="Buy development card"
            >
              📜 Dev
            </SecondaryButton>
            <SecondaryButton onClick={() => setTradeOpen(true)}>🤝 Trade</SecondaryButton>
            <button className={`${BTN_BASE} bg-p-green px-4 py-2.5 text-sm text-white shadow-soft hover:-translate-y-0.5 hover:brightness-105`} onClick={() => dispatch({ type: 'endTurn' })}>
              End Turn
            </button>
          </>
        )}
      </div>

      {tradeOpen && inMain && <TradePanel game={game} onClose={() => setTradeOpen(false)} />}

      {myTurn && <DevCardBar game={game} me={me} />}

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
          <button key={r} onClick={() => choose(r)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-card-alt transition hover:-translate-y-0.5 hover:shadow-soft">
            <ResourceIcon resource={r} size={22} />
          </button>
        ))}
      </div>
      <button onClick={onClose} className="mt-1 w-full text-center text-[11px] text-ink-faint underline">cancel</button>
    </div>
  );
}

function BuildButton({ label, icon, mode, cost, build, setBuild, me, stock }: {
  label: string; icon: string; mode: BuildMode; cost: Partial<Record<Resource, number>>;
  build: BuildMode; setBuild: (m: BuildMode) => void; me: Player; stock: number;
}) {
  const affordable = canAfford(me.resources, cost) && stock > 0;
  const active = build?.kind === (mode as { kind: string }).kind;
  return (
    <button
      disabled={!affordable}
      onClick={() => setBuild(active ? null : mode)}
      className={`${BTN_BASE} flex-col px-2.5 py-1.5 ${
        active ? 'bg-amber-300 text-amber-950 shadow-soft' : affordable ? 'bg-card-alt hover:-translate-y-0.5 hover:shadow-soft' : 'bg-card-alt/50 text-ink-faint'
      }`}
    >
      <span className="text-sm">{icon} {label}</span>
      <span className="opacity-80"><Cost cost={cost} /></span>
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`${BTN_BASE} px-3.5 py-2.5 text-sm ${disabled ? 'bg-card-alt/50 text-ink-faint' : 'bg-card-alt hover:-translate-y-0.5 hover:shadow-soft'}`}
    >
      {children}
    </button>
  );
}

// --- Discard modal ---------------------------------------------------------

function DiscardModal({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const dispatch = useGame((s) => s.dispatch);
  const required = game.phase === 'discard' ? game.pending.discards[humanId] : undefined;
  const me = game.players[humanId];
  const [sel, setSel] = useState<Record<Resource, number>>({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

  useEffect(() => setSel({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }), [required]);
  if (required === undefined) return null;

  const chosen = RESOURCES.reduce((s, r) => s + sel[r], 0);
  const adjust = (r: Resource, d: number) => setSel((prev) => ({ ...prev, [r]: Math.max(0, Math.min(me.resources[r], prev[r] + d)) }));

  return (
    <Overlay>
      <div className={`w-full max-w-md p-6 ${CARD}`}>
        <h2 className="font-display text-xl font-extrabold">Discard {required} cards</h2>
        <p className="mb-4 mt-1 text-sm text-ink-soft">You rolled over 7 cards — choose what to lose.</p>
        <div className="mb-4 grid grid-cols-5 gap-2">
          {RESOURCES.map((r) => (
            <div key={r} className="flex flex-col items-center rounded-xl bg-card-alt p-2">
              <ResourceIcon resource={r} size={26} />
              <span className="mt-0.5 text-[11px] text-ink-faint">have {me.resources[r]}</span>
              <div className="mt-1 flex items-center gap-1">
                <Stepper onClick={() => adjust(r, -1)}>−</Stepper>
                <span className="w-5 text-center font-display font-extrabold">{sel[r]}</span>
                <Stepper onClick={() => adjust(r, 1)}>+</Stepper>
              </div>
            </div>
          ))}
        </div>
        <button
          disabled={chosen !== required}
          onClick={() => dispatch({ type: 'discard', player: humanId, resources: sel })}
          className={`${BTN_BASE} w-full px-4 py-3 text-base ${chosen === required ? 'bg-p-red text-white hover:brightness-105' : 'bg-card-alt text-ink-faint'}`}
        >
          Discard ({chosen}/{required})
        </button>
      </div>
    </Overlay>
  );
}

function Stepper({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="h-6 w-6 rounded-lg bg-ink/10 font-bold text-ink transition hover:bg-ink/20 active:scale-90">
      {children}
    </button>
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
