import { useState } from 'react';
import { motion } from 'framer-motion';
import { bestTradePartner } from '../ai/bot';
import { bankTradeRatio } from '../engine/helpers';
import type { GameState, Resource } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { useGame } from '../state/store';
import { RESOURCE_ICON } from './icons';

type EmptyBag = Record<Resource, number>;
const zeroBag = (): EmptyBag => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

/** Bank/port trades and player-to-player offers with the bots. */
export function TradePanel({ game, onClose }: { game: GameState; onClose: () => void }) {
  const [tab, setTab] = useState<'bank' | 'players'>('bank');
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-lg rounded-2xl bg-slate-900 p-5 ring-1 ring-white/15"
      >
        <div className="mb-4 flex items-center gap-2">
          <h2 className="font-display text-xl font-extrabold">Trade</h2>
          <div className="ml-auto flex gap-1 rounded-lg bg-white/5 p-1 text-sm">
            <Tab active={tab === 'bank'} onClick={() => setTab('bank')}>Bank</Tab>
            <Tab active={tab === 'players'} onClick={() => setTab('players')}>Players</Tab>
          </div>
          <button onClick={onClose} className="rounded-lg bg-white/10 px-2 py-1 text-sm hover:bg-white/20">✕</button>
        </div>
        {tab === 'bank' ? <BankTrade game={game} onClose={onClose} /> : <PlayerTrade game={game} onClose={onClose} />}
      </motion.div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-md px-3 py-1 font-semibold ${active ? 'bg-white/90 text-slate-900' : 'text-white/70'}`}>
      {children}
    </button>
  );
}

// --- Bank / port -----------------------------------------------------------

function BankTrade({ game, onClose }: { game: GameState; onClose: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const humanId = useGame((s) => s.humanId);
  const me = game.players[humanId];
  const [give, setGive] = useState<Resource>('wood');
  const [get, setGet] = useState<Resource>('ore');
  const ratio = bankTradeRatio(game, humanId, give);
  const affordable = me.resources[give] >= ratio && game.bank[get] > 0 && give !== get;

  return (
    <div>
      <p className="mb-3 text-sm text-white/50">
        Trade with the bank. Ports you own improve your rate automatically.
      </p>
      <div className="mb-4 flex items-center justify-center gap-4">
        <ResourceSelect label="Give" value={give} onChange={setGive} game={game} humanId={humanId} showRatio />
        <div className="pt-6 text-2xl text-white/40">→</div>
        <ResourceSelect label="Get" value={get} onChange={setGet} game={game} humanId={humanId} />
      </div>
      <div className="mb-4 text-center text-sm text-white/60">
        Give <b>{ratio}</b> {RESOURCE_ICON[give]} for <b>1</b> {RESOURCE_ICON[get]}
      </div>
      <button
        disabled={!affordable}
        onClick={() => { dispatch({ type: 'bankTrade', give, receive: get }); onClose(); }}
        className={`w-full rounded-xl px-4 py-3 font-bold ${affordable ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400' : 'cursor-not-allowed bg-white/5 text-white/30'}`}
      >
        Trade
      </button>
    </div>
  );
}

function ResourceSelect({ label, value, onChange, game, humanId, showRatio }: {
  label: string; value: Resource; onChange: (r: Resource) => void; game: GameState; humanId: number; showRatio?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="mb-1 text-xs uppercase tracking-wide text-white/40">{label}</div>
      <div className="flex gap-1">
        {RESOURCES.map((r) => (
          <button
            key={r}
            onClick={() => onChange(r)}
            className={`flex h-11 w-11 flex-col items-center justify-center rounded-lg text-lg ${value === r ? 'bg-yellow-300 text-yellow-950' : 'bg-white/10 hover:bg-white/20'}`}
            title={showRatio ? `rate ${bankTradeRatio(game, humanId, r)}:1` : undefined}
          >
            {RESOURCE_ICON[r]}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Player-to-player ------------------------------------------------------

function PlayerTrade({ game, onClose }: { game: GameState; onClose: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const humanId = useGame((s) => s.humanId);
  const me = game.players[humanId];
  const [giveBag, setGiveBag] = useState<EmptyBag>(zeroBag);
  const [getBag, setGetBag] = useState<EmptyBag>(zeroBag);
  const [message, setMessage] = useState<string | null>(null);

  const canGive = RESOURCES.every((r) => giveBag[r] <= me.resources[r]);
  const nonEmpty = RESOURCES.some((r) => giveBag[r] > 0) && RESOURCES.some((r) => getBag[r] > 0);

  const offer = () => {
    const partner = bestTradePartner(game, humanId, giveBag, getBag);
    if (partner === null) {
      setMessage('All opponents declined that offer.');
      return;
    }
    dispatch({ type: 'playerTrade', partner, give: giveBag, receive: getBag });
    onClose();
  };

  return (
    <div>
      <p className="mb-3 text-sm text-white/50">Propose a swap. A bot accepts only if it comes out ahead.</p>
      <BagEditor label="You give" bag={giveBag} setBag={setGiveBag} max={(r) => me.resources[r]} />
      <BagEditor label="You get" bag={getBag} setBag={setGetBag} max={() => 9} />
      {message && <div className="mt-2 text-center text-sm text-rose-300">{message}</div>}
      <button
        disabled={!nonEmpty || !canGive}
        onClick={offer}
        className={`mt-4 w-full rounded-xl px-4 py-3 font-bold ${nonEmpty && canGive ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400' : 'cursor-not-allowed bg-white/5 text-white/30'}`}
      >
        Offer to opponents
      </button>
    </div>
  );
}

function BagEditor({ label, bag, setBag, max }: { label: string; bag: EmptyBag; setBag: (b: EmptyBag) => void; max: (r: Resource) => number }) {
  const adjust = (r: Resource, d: number) => {
    const next = Math.max(0, Math.min(max(r), bag[r] + d));
    setBag({ ...bag, [r]: next });
  };
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-white/40">{label}</div>
      <div className="grid grid-cols-5 gap-2">
        {RESOURCES.map((r) => (
          <div key={r} className="flex flex-col items-center rounded-lg bg-white/5 p-1.5">
            <span className="text-lg">{RESOURCE_ICON[r]}</span>
            <div className="mt-1 flex items-center gap-1">
              <button className="h-5 w-5 rounded bg-white/10 text-xs hover:bg-white/20" onClick={() => adjust(r, -1)}>−</button>
              <span className="w-4 text-center text-sm font-bold">{bag[r]}</span>
              <button className="h-5 w-5 rounded bg-white/10 text-xs hover:bg-white/20" onClick={() => adjust(r, 1)}>+</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
