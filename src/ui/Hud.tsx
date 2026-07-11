import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { COSTS } from '../engine/constants';
import { canAfford, publicVictoryPoints, totalResources, victoryPoints } from '../engine/helpers';
import type { DevCardType, GameState, Player, Resource } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { PLAYER_CSS } from '../render/palette';
import { useGame, type BuildMode } from '../state/store';
import { RESOURCE_ICON, RESOURCE_LABEL } from './icons';
import { TradePanel } from './TradePanel';

export function Hud() {
  const game = useGame((s) => s.game);
  if (!game) return null;
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
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

// ---------------------------------------------------------------------------
// Top bar: whose turn, phase, dice
// ---------------------------------------------------------------------------

function TopBar({ game }: { game: GameState }) {
  const thinking = useGame((s) => s.thinking);
  const active = game.players[game.currentPlayer];
  const phaseLabel = PHASE_LABEL[game.phase];
  return (
    <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3">
      <div
        className="flex items-center gap-2 rounded-2xl bg-black/40 px-4 py-2 backdrop-blur-md ring-1 ring-white/10"
        style={{ boxShadow: `0 0 0 2px ${PLAYER_CSS[active.color]}66` }}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: PLAYER_CSS[active.color] }} />
        <span className="font-display font-bold">{active.name}</span>
        <span className="text-white/50">·</span>
        <span className="text-sm text-white/70">{phaseLabel}</span>
        {thinking && <span className="ml-1 animate-pulse text-xs text-white/40">thinking…</span>}
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
          initial={{ rotate: -25, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-display text-xl font-extrabold text-slate-900 shadow"
        >
          {d}
        </motion.div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opponent / player summary panels
// ---------------------------------------------------------------------------

function PlayersColumn({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  return (
    <div className="absolute right-3 top-16 flex w-52 flex-col gap-2">
      {game.players.map((p) => (
        <PlayerCard key={p.id} game={game} player={p} isHuman={p.id === humanId} active={p.id === game.currentPlayer} />
      ))}
    </div>
  );
}

function PlayerCard({ game, player, isHuman, active }: { game: GameState; player: Player; isHuman: boolean; active: boolean }) {
  const vp = isHuman ? victoryPoints(game, player.id) : publicVictoryPoints(game, player.id);
  const cards = isHuman ? totalResources(player.resources) : totalResources(player.resources);
  const devCount = player.devCards.filter((c) => !c.played).length;
  return (
    <div
      className={`rounded-xl bg-black/35 px-3 py-2 backdrop-blur-md ring-1 transition ${active ? 'ring-white/40' : 'ring-white/10'}`}
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: PLAYER_CSS[player.color] }} />
        <span className="truncate font-bold">{player.name}</span>
        <span className="ml-auto font-display text-lg font-extrabold">{vp}</span>
        <span className="text-[10px] text-white/40">VP</span>
      </div>
      <div className="mt-1 flex items-center gap-3 text-xs text-white/60">
        <span title="cards in hand">🃏 {cards}</span>
        <span title="development cards">📜 {devCount}</span>
        {game.longestRoad.player === player.id && <span title="Longest Road">🛣️</span>}
        {game.largestArmy.player === player.id && <span title="Largest Army">⚔️</span>}
        <span className="ml-auto" title="knights played">🛡️ {player.knightsPlayed}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action log
// ---------------------------------------------------------------------------

function LogPanel({ game }: { game: GameState }) {
  const recent = game.log.slice(-5);
  return (
    <div className="absolute bottom-4 left-3 w-64 rounded-xl bg-black/30 p-2 text-xs text-white/70 backdrop-blur-md ring-1 ring-white/10">
      {recent.map((e, i) => (
        <div key={game.log.length - recent.length + i} className="truncate leading-5">
          {e.message}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Human control dock: resources + actions
// ---------------------------------------------------------------------------

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
    <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
      {/* Resource hand */}
      <div className="flex gap-1.5 rounded-2xl bg-black/40 p-2 backdrop-blur-md ring-1 ring-white/10">
        {RESOURCES.map((r) => (
          <div key={r} className="flex h-11 w-12 flex-col items-center justify-center rounded-lg bg-white/5" title={RESOURCE_LABEL[r]}>
            <span className="text-lg leading-none">{RESOURCE_ICON[r]}</span>
            <span className="mt-0.5 font-display text-sm font-bold">{me.resources[r]}</span>
          </div>
        ))}
      </div>

      {/* Primary actions */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {myTurn && game.phase === 'roll' && (
          <ActionButton primary onClick={() => dispatch({ type: 'rollDice' })}>
            🎲 Roll Dice
          </ActionButton>
        )}

        {inMain && (
          <>
            <BuildButton label="Road" icon="🛣️" mode={{ kind: 'road' }} cost={COSTS.road} build={build} setBuild={setBuild} game={game} me={me} stock={me.stock.roads} />
            <BuildButton label="Town" icon="🏠" mode={{ kind: 'settlement' }} cost={COSTS.settlement} build={build} setBuild={setBuild} game={game} me={me} stock={me.stock.settlements} />
            <BuildButton label="City" icon="🏙️" mode={{ kind: 'city' }} cost={COSTS.city} build={build} setBuild={setBuild} game={game} me={me} stock={me.stock.cities} />
            <ActionButton
              disabled={!canAfford(me.resources, COSTS.devCard) || game.devDeck.length === 0}
              onClick={() => dispatch({ type: 'buyDevCard' })}
              title="1 sheep, 1 wheat, 1 ore"
            >
              📜 Dev
            </ActionButton>
            <ActionButton onClick={() => setTradeOpen(true)}>🤝 Trade</ActionButton>
            <ActionButton primary onClick={() => dispatch({ type: 'endTurn' })}>
              End Turn
            </ActionButton>
          </>
        )}
      </div>

      {tradeOpen && inMain && <TradePanel game={game} onClose={() => setTradeOpen(false)} />}

      {/* Development cards */}
      {myTurn && <DevCardBar game={game} me={me} />}

      {build && (
        <div className="rounded-full bg-yellow-300/90 px-3 py-1 text-xs font-bold text-yellow-950">
          Select a spot on the board · <button className="underline" onClick={() => setBuild(null)}>cancel</button>
        </div>
      )}
      {game.pending.freeRoads > 0 && myTurn && (
        <div className="rounded-full bg-yellow-300/90 px-3 py-1 text-xs font-bold text-yellow-950">
          Place {game.pending.freeRoads} free road{game.pending.freeRoads > 1 ? 's' : ''}
        </div>
      )}
    </div>
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

  const hasAny = Object.values(counts).some((c) => c.total > 0);
  if (!hasAny) return null;

  const play = (type: DevCardType) => canPlay && counts[type].playable > 0;

  return (
    <div className="flex items-center gap-1.5 rounded-xl bg-black/35 px-2 py-1.5 text-xs backdrop-blur-md ring-1 ring-white/10">
      <span className="text-white/40">Cards:</span>
      {counts.knight.total > 0 && (
        <DevChip label={`🛡️ Knight ×${counts.knight.total}`} enabled={play('knight')} onClick={() => setBuild({ kind: 'knight' })} />
      )}
      {counts.roadBuilding.total > 0 && (
        <DevChip label={`🛣️ Roads ×${counts.roadBuilding.total}`} enabled={play('roadBuilding')} onClick={() => dispatch({ type: 'playRoadBuilding' })} />
      )}
      {counts.monopoly.total > 0 && (
        <DevChip label={`💰 Monopoly ×${counts.monopoly.total}`} enabled={play('monopoly')} onClick={() => setPicker('monopoly')} />
      )}
      {counts.yearOfPlenty.total > 0 && (
        <DevChip label={`🎁 Plenty ×${counts.yearOfPlenty.total}`} enabled={play('yearOfPlenty')} onClick={() => setPicker('yop')} />
      )}
      {counts.victoryPoint.total > 0 && <span className="text-white/60">⭐ VP ×{counts.victoryPoint.total}</span>}

      {picker === 'monopoly' && (
        <ResourcePicker
          count={1}
          onPick={(rs) => {
            dispatch({ type: 'playMonopoly', resource: rs[0] });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'yop' && (
        <ResourcePicker
          count={2}
          onPick={(rs) => {
            dispatch({ type: 'playYearOfPlenty', resources: rs });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function DevChip({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) {
  return (
    <button
      disabled={!enabled}
      onClick={onClick}
      className={`rounded-lg px-2 py-1 font-semibold transition ${enabled ? 'bg-white/10 hover:bg-white/20' : 'cursor-not-allowed text-white/30'}`}
    >
      {label}
    </button>
  );
}

/** Small popover to choose one or two resources (monopoly / year of plenty). */
function ResourcePicker({ count, onPick, onClose }: { count: number; onPick: (rs: Resource[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<Resource[]>([]);
  const choose = (r: Resource) => {
    const next = [...picked, r];
    if (next.length >= count) onPick(next);
    else setPicked(next);
  };
  return (
    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 rounded-xl bg-slate-900/95 p-2 shadow-xl ring-1 ring-white/15">
      <div className="mb-1 text-center text-[11px] text-white/60">
        {count === 2 ? `Pick 2 (${picked.length}/2)` : 'Pick a resource'}
      </div>
      <div className="flex gap-1">
        {RESOURCES.map((r) => (
          <button key={r} onClick={() => choose(r)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-lg hover:bg-white/20">
            {RESOURCE_ICON[r]}
          </button>
        ))}
      </div>
      <button onClick={onClose} className="mt-1 w-full text-center text-[11px] text-white/40 underline">
        cancel
      </button>
    </div>
  );
}

function BuildButton({
  label, icon, mode, cost, build, setBuild, game, me, stock,
}: {
  label: string; icon: string; mode: BuildMode; cost: Partial<Record<Resource, number>>;
  build: BuildMode; setBuild: (m: BuildMode) => void; game: GameState; me: Player; stock: number;
}) {
  const affordable = canAfford(me.resources, cost) && stock > 0;
  const active = build?.kind === (mode as { kind: string }).kind;
  const costText = RESOURCES.filter((r) => cost[r]).map((r) => `${cost[r]}${RESOURCE_ICON[r]}`).join(' ');
  void game;
  return (
    <button
      disabled={!affordable}
      onClick={() => setBuild(active ? null : mode)}
      title={costText}
      className={`flex flex-col items-center rounded-xl px-3 py-1.5 text-sm font-bold transition ${
        active ? 'bg-yellow-300 text-yellow-950' : affordable ? 'bg-white/10 hover:bg-white/20' : 'cursor-not-allowed bg-white/5 text-white/30'
      }`}
    >
      <span>{icon} {label}</span>
      <span className="text-[10px] font-medium opacity-70">{costText}</span>
    </button>
  );
}

function ActionButton({ children, onClick, disabled, primary, title }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; title?: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition active:scale-95 ${
        disabled
          ? 'cursor-not-allowed bg-white/5 text-white/30'
          : primary
            ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-emerald-950 shadow hover:brightness-110'
            : 'bg-white/10 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Discard modal (after a 7)
// ---------------------------------------------------------------------------

function DiscardModal({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const dispatch = useGame((s) => s.dispatch);
  const required = game.phase === 'discard' ? game.pending.discards[humanId] : undefined;
  const me = game.players[humanId];
  const [sel, setSel] = useState<Record<Resource, number>>({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

  useEffect(() => {
    setSel({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
  }, [required]);

  if (required === undefined) return null;
  const chosen = RESOURCES.reduce((s, r) => s + sel[r], 0);
  const adjust = (r: Resource, d: number) => {
    setSel((prev) => {
      const next = Math.max(0, Math.min(me.resources[r], prev[r] + d));
      return { ...prev, [r]: next };
    });
  };

  return (
    <Overlay>
      <div className="w-full max-w-md rounded-2xl bg-slate-900 p-6 ring-1 ring-white/15">
        <h2 className="mb-1 font-display text-xl font-extrabold">Discard {required} cards</h2>
        <p className="mb-4 text-sm text-white/50">You rolled over 7 cards — choose what to lose.</p>
        <div className="mb-4 grid grid-cols-5 gap-2">
          {RESOURCES.map((r) => (
            <div key={r} className="flex flex-col items-center rounded-xl bg-white/5 p-2">
              <span className="text-xl">{RESOURCE_ICON[r]}</span>
              <span className="text-xs text-white/50">have {me.resources[r]}</span>
              <div className="mt-1 flex items-center gap-1">
                <button className="h-6 w-6 rounded bg-white/10 hover:bg-white/20" onClick={() => adjust(r, -1)}>−</button>
                <span className="w-5 text-center font-bold">{sel[r]}</span>
                <button className="h-6 w-6 rounded bg-white/10 hover:bg-white/20" onClick={() => adjust(r, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>
        <button
          disabled={chosen !== required}
          onClick={() => dispatch({ type: 'discard', player: humanId, resources: sel })}
          className={`w-full rounded-xl px-4 py-3 font-bold transition ${
            chosen === required ? 'bg-rose-500 text-white hover:bg-rose-400' : 'cursor-not-allowed bg-white/5 text-white/30'
          }`}
        >
          Discard ({chosen}/{required})
        </button>
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------
// Victory + error
// ---------------------------------------------------------------------------

function VictoryOverlay({ game }: { game: GameState }) {
  const newGame = useGame((s) => s.newGame);
  if (game.phase !== 'gameOver' || game.winner === null) return null;
  const winner = game.players[game.winner];
  return (
    <Overlay>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-3xl bg-slate-900 p-10 text-center ring-1 ring-white/15"
      >
        <div className="mb-2 text-6xl">🏆</div>
        <h2 className="font-display text-3xl font-extrabold" style={{ color: PLAYER_CSS[winner.color] }}>
          {winner.name} wins!
        </h2>
        <p className="mb-6 mt-1 text-white/50">{victoryPoints(game, winner.id)} victory points</p>
        <button
          onClick={() => newGame({ players: game.players.map((p) => ({ name: p.name, isBot: p.isBot })), layout: 'random' })}
          className="rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-6 py-3 font-display text-lg font-extrabold text-emerald-950 hover:brightness-110"
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
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 rounded-xl bg-rose-500/90 px-4 py-2 text-sm font-semibold text-white shadow-lg"
        >
          {error}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
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
