import { useState } from 'react';
import { motion } from 'framer-motion';
import { RESOURCE_CARD } from '../assets';
import { bestTradePartner } from '../ai/bot';
import { bankTradeRatio } from '../engine/helpers';
import type { GameState, Resource } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { useGame } from '../state/store';

type Bag = Record<Resource, number>;
const zeroBag = (): Bag => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

const CARD = 'rounded-2xl bg-card text-ink shadow-pop ring-1 ring-black/5 dark:ring-white/15';
const BTN = 'inline-flex items-center justify-center gap-1.5 rounded-xl font-bold transition-all duration-200 ease-smooth active:scale-[0.96] disabled:cursor-not-allowed';

/** Bank/port trades and player-to-player offers with the bots. */
export function TradePanel({ game, onClose }: { game: GameState; onClose: () => void }) {
  const [tab, setTab] = useState<'bank' | 'players'>('bank');
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 22 }} className={`max-h-[90vh] w-full max-w-lg overflow-y-auto p-4 sm:p-5 ${CARD}`}>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="font-display text-xl font-extrabold">Trade</h2>
          <div className="ml-auto flex gap-1 rounded-xl bg-card-alt p-1 text-sm">
            <Tab active={tab === 'bank'} onClick={() => setTab('bank')}>Bank</Tab>
            <Tab active={tab === 'players'} onClick={() => setTab('players')}>Players</Tab>
          </div>
          <button onClick={onClose} className={`${BTN} h-8 w-8 bg-card-alt text-ink hover:bg-ink/10`}>✕</button>
        </div>
        {tab === 'bank' ? <BankTrade game={game} onClose={onClose} /> : <PlayerTrade game={game} onClose={onClose} />}
      </motion.div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-3 py-1 font-bold transition ${active ? 'bg-ink text-card shadow-soft' : 'text-ink-soft hover:text-ink'}`}>
      {children}
    </button>
  );
}

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
      <p className="mb-3 text-sm text-ink-soft">Trade with the bank. Ports you own improve your rate automatically.</p>
      <div className="mb-4 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
        <ResourcePick label="Give" value={give} onChange={setGive} game={game} humanId={humanId} showRatio />
        <div className="rotate-90 text-2xl text-ink-faint sm:rotate-0 sm:pt-6">→</div>
        <ResourcePick label="Get" value={get} onChange={setGet} game={game} humanId={humanId} />
      </div>
      <div className="mb-4 flex items-center justify-center gap-1.5 text-sm text-ink-soft">
        Give <b className="text-ink">{ratio}</b>
        <img src={RESOURCE_CARD[give]} alt={give} className="inline-block w-3.5 rounded-[3px] align-middle" draggable={false} />
        for <b className="text-ink">1</b>
        <img src={RESOURCE_CARD[get]} alt={get} className="inline-block w-3.5 rounded-[3px] align-middle" draggable={false} />
      </div>
      <button disabled={!affordable} onClick={() => { dispatch({ type: 'bankTrade', give, receive: get }); onClose(); }} className={`${BTN} w-full px-4 py-3 ${affordable ? 'bg-p-green text-white hover:brightness-105' : 'bg-card-alt text-ink-faint'}`}>
        Trade
      </button>
    </div>
  );
}

function ResourcePick({ label, value, onChange, game, humanId, showRatio }: {
  label: string; value: Resource; onChange: (r: Resource) => void; game: GameState; humanId: number; showRatio?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="flex gap-1.5">
        {RESOURCES.map((r) => (
          <button
            key={r}
            onClick={() => onChange(r)}
            title={showRatio ? `rate ${bankTradeRatio(game, humanId, r)}:1` : undefined}
            className={`rounded-xl p-1 transition ${value === r ? 'bg-amber-300 shadow-soft' : 'bg-card-alt hover:-translate-y-0.5'}`}
          >
            <img src={RESOURCE_CARD[r]} alt={r} className="h-14 w-10 rounded-md object-contain" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerTrade({ game, onClose }: { game: GameState; onClose: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const humanId = useGame((s) => s.humanId);
  const me = game.players[humanId];
  const [giveBag, setGiveBag] = useState<Bag>(zeroBag);
  const [getBag, setGetBag] = useState<Bag>(zeroBag);
  const [message, setMessage] = useState<string | null>(null);

  const canGive = RESOURCES.every((r) => giveBag[r] <= me.resources[r]);
  const nonEmpty = RESOURCES.some((r) => giveBag[r] > 0) && RESOURCES.some((r) => getBag[r] > 0);

  const offer = () => {
    const partner = bestTradePartner(game, humanId, giveBag, getBag);
    if (partner === null) { setMessage('All opponents declined that offer.'); return; }
    dispatch({ type: 'playerTrade', partner, give: giveBag, receive: getBag });
    onClose();
  };

  return (
    <div>
      <p className="mb-3 text-sm text-ink-soft">Propose a swap. A bot accepts only if it comes out ahead.</p>
      <BagEditor label="You give" bag={giveBag} setBag={setGiveBag} max={(r) => me.resources[r]} />
      <BagEditor label="You get" bag={getBag} setBag={setGetBag} max={() => 9} />
      {message && <div className="mt-2 text-center text-sm font-semibold text-p-red">{message}</div>}
      <button disabled={!nonEmpty || !canGive} onClick={offer} className={`${BTN} mt-4 w-full px-4 py-3 ${nonEmpty && canGive ? 'bg-p-green text-white hover:brightness-105' : 'bg-card-alt text-ink-faint'}`}>
        Offer to opponents
      </button>
    </div>
  );
}

function BagEditor({ label, bag, setBag, max }: { label: string; bag: Bag; setBag: (b: Bag) => void; max: (r: Resource) => number }) {
  const adjust = (r: Resource, d: number) => setBag({ ...bag, [r]: Math.max(0, Math.min(max(r), bag[r] + d)) });
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="grid grid-cols-5 gap-2">
        {RESOURCES.map((r) => (
          <div key={r} className="flex flex-col items-center rounded-xl bg-card-alt p-1.5">
            <img src={RESOURCE_CARD[r]} alt={r} className="h-14 w-10 rounded-md object-contain" draggable={false} />
            <div className="mt-1 flex items-center gap-1">
              <button className="h-5 w-5 rounded-md bg-ink/10 text-xs font-bold hover:bg-ink/20 active:scale-90" onClick={() => adjust(r, -1)}>−</button>
              <span className="w-4 text-center text-sm font-extrabold">{bag[r]}</span>
              <button className="h-5 w-5 rounded-md bg-ink/10 text-xs font-bold hover:bg-ink/20 active:scale-90" onClick={() => adjust(r, 1)}>+</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
