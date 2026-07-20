import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CARD_HIDDEN, LARGEST_ARMY, RESOURCE_CARD_FRAME } from '../assets';
import { RESOURCES, bankTradeRatio, emptyBank } from '@colonist/shared';
import type { GameState, Resource } from '@colonist/shared';
import { useGame } from '../state/store';
import { StackedCard } from './StackedCard';
import { PackedSprite } from './PackedSprite';

type Bag = Record<Resource, number>;
const zeroBag = emptyBank;
const bagTotal = (bag: Bag) => RESOURCES.reduce((sum, resource) => sum + bag[resource], 0);
const CARD = 'rounded-2xl bg-card text-ink shadow-pop ring-1 ring-black/5 dark:ring-white/15';
const BTN = 'inline-flex items-center justify-center rounded-xl font-bold transition-all duration-200 ease-smooth active:scale-[0.96] disabled:cursor-not-allowed';

/** One offer builder for both bank and player trades. */
export function TradePanel({ game, give, onRemoveGive, onResetGive, onClose }: { game: GameState; give: Bag; onRemoveGive: (resource: Resource) => void; onResetGive: () => void; onClose: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const humanId = useGame((s) => s.humanId);
  const [want, setWant] = useState<Bag>(zeroBag);
  const [wantAny, setWantAny] = useState(0);
  const [offerLayout, setOfferLayout] = useState({ left: 8, bottom: 120, width: 320 });

  useEffect(() => {
    const hand = document.querySelector<HTMLElement>('[data-hand-panel]');
    if (!hand) return;
    const measure = () => {
      const handRect = hand.getBoundingClientRect();
      setOfferLayout({
        left: handRect.left,
        width: handRect.width,
        // Keep the offer just above the hand with a small visual gap.
        bottom: window.innerHeight - handRect.top + 8,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(hand);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const addWant = (resource: Resource) => {
    setWant({ ...want, [resource]: want[resource] + 1 });
  };
  const removeWant = (resource: Resource) => setWant({ ...want, [resource]: Math.max(0, want[resource] - 1) });
  const chooseAny = () => setWantAny((current) => current + 1);
  const removeAny = () => setWantAny((current) => Math.max(0, current - 1));
  const resetAll = () => { setWant(zeroBag()); setWantAny(0); onResetGive(); };

  const offeredTypes = RESOURCES.filter((resource) => give[resource] > 0);
  const requestedTypes = RESOURCES.filter((resource) => want[resource] > 0);
  const overlaps = offeredTypes.some((resource) => want[resource] > 0);
  const bankGive = offeredTypes.length === 1 ? offeredTypes[0] : null;
  const bankReceive = requestedTypes.length === 1 && want[requestedTypes[0]] === 1 ? requestedTypes[0] : null;
  const bankRate = bankGive ? bankTradeRatio(game, humanId, bankGive) : 4;
  const bankReady = !!bankGive && !!bankReceive && bankGive !== bankReceive && wantAny === 0 && give[bankGive] === bankRate && game.bank[bankReceive] > 0;
  const playersReady = game.rules.allowPlayerTrades && !overlaps && bagTotal(give) > 0 && (wantAny > 0 || bagTotal(want) > 0);

  const tradeWithBank = () => {
    if (!bankGive || !bankReceive) return;
    if (dispatch({ type: 'bankTrade', give: bankGive, receive: bankReceive, player: humanId })) onResetGive();
  };
  const tradeWithPlayers = () => {
    if (dispatch({ type: 'createTradeOffer', give, receive: want, anyCount: wantAny, player: humanId })) {
      resetAll();
    }
  };

  return (
    <div data-trade-panel className="pointer-events-none fixed inset-0 z-30">
      <motion.section
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className={`pointer-events-auto absolute max-h-[calc(100vh-9rem)] overflow-auto p-3.5 ${CARD}`}
        style={offerLayout}
      >
        <header className="mb-2.5 flex items-center gap-2 border-b border-ink/10 pb-2 dark:border-white/10">
          <h2 className="font-display text-xl font-extrabold">Trade offer</h2>
          <button type="button" onClick={resetAll} className={`${BTN} ml-auto min-h-11 px-3 text-xs text-ink-soft hover:bg-ink/10`}>Reset</button>
          <button type="button" onClick={onClose} aria-label="Close trade panel" className={`${BTN} h-11 w-11 shrink-0 bg-card-alt text-ink hover:bg-ink/10`}>×</button>
        </header>

        <div className="space-y-2">
          <ResourcePicker label="Ask for" onPick={addWant} onAny={chooseAny} disabled={offeredTypes} />
          <div className="rounded-xl bg-card-alt/70 p-2.5 ring-1 ring-black/5 dark:ring-white/10">
            <div>
            <OfferRow label="You receive" bag={want} anyCount={wantAny} onRemove={removeWant} onRemoveAny={removeAny} />
            <div className="my-1.5 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-faint before:h-px before:flex-1 before:bg-ink/10 after:h-px after:flex-1 after:bg-ink/10 dark:before:bg-white/10 dark:after:bg-white/10">for</div>
            <div className="border-t border-ink/5 pt-1.5 dark:border-white/10"><OfferRow label="You give" bag={give} onRemove={onRemoveGive} /></div>
            </div>
          </div>
          <p role="status" className="min-h-4 text-[11px] font-bold text-ink-soft">{overlaps ? 'The same resource cannot be on both sides.' : bankGive ? `Bank rate: ${bankRate}:1 ${bankGive}.` : playersReady ? 'Ready to offer to players.' : 'Choose cards for both sides.'}</p>
          <div className="grid grid-cols-2 gap-2 border-t border-ink/10 pt-2 dark:border-white/10">
            <TradeAction title={bankGive ? `Bank rate: ${bankRate}:1 ${bankGive}` : 'Bank trade'} icon="🏦" label="Bank" enabled={bankReady} onClick={tradeWithBank} />
            <TradeAction title="Offer to players" iconSrc={LARGEST_ARMY} label="Players" enabled={playersReady} onClick={tradeWithPlayers} />
          </div>
        </div>

      </motion.section>
    </div>
  );
}

function OfferRow({ label, bag, anyCount = 0, onRemove, onRemoveAny }: { label: string; bag: Bag; anyCount?: number; onRemove: (resource: Resource) => void; onRemoveAny?: () => void }) {
  const cards = RESOURCES.filter((resource) => bag[resource] > 0);
  return (
    <div className="p-0">
      <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">{label}</span>
      <div className="flex min-h-14 items-center gap-2 overflow-x-auto">
        {cards.length === 0 && anyCount === 0 ? <span className="pl-1 text-xs font-semibold text-ink-faint">Choose cards below</span> : <>
          {cards.map((resource) => <StackedCard key={resource} sprite={RESOURCE_CARD_FRAME[resource]} alt={resource} count={bag[resource]} direction="left" title={`Remove ${resource}`} onClick={() => onRemove(resource)} />)}
          {anyCount > 0 && <StackedCard src={CARD_HIDDEN} alt="Any card request" count={anyCount} direction="left" title="Remove any card request" onClick={onRemoveAny ?? (() => undefined)} />}
        </>}
      </div>
    </div>
  );
}

function ResourcePicker({ label, onPick, onAny, disabled = [] }: { label: string; onPick: (resource: Resource) => void; onAny: () => void; disabled?: Resource[] }) {
  return (
    <div className="rounded-xl bg-ink/[0.035] p-2 ring-1 ring-ink/5 dark:bg-white/[0.04] dark:ring-white/10">
      <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">{label}</span>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {RESOURCES.map((resource) => (
          <ResourceButton key={resource} resource={resource} onClick={() => onPick(resource)} disabled={disabled.includes(resource)} />
        ))}
        <button type="button" title="Accept any resource from the other player" onClick={onAny} className="shrink-0 rounded-md transition hover:-translate-y-0.5 hover:shadow-soft"><QuestionCard /></button>
      </div>
    </div>
  );
}

function ResourceButton({ resource, onClick, disabled = false }: { resource: Resource; onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={resource} className="shrink-0 rounded-md transition hover:-translate-y-0.5 hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-35"><PackedSprite name={RESOURCE_CARD_FRAME[resource]} alt={resource} className="h-14 w-10 rounded-md object-contain" /></button>;
}

function QuestionCard() {
  return <img src={CARD_HIDDEN} alt="Any card" className="h-14 w-10 rounded-md object-contain shadow-sm" draggable={false} />;
}

function TradeAction({ title, icon, iconSrc, label, enabled, onClick }: { title: string; icon?: string; iconSrc?: string; label: string; enabled: boolean; onClick: () => void }) {
  return (
    <button type="button" title={title} aria-label={label} disabled={!enabled} onClick={onClick} className={`${BTN} min-h-14 gap-2 px-3 py-2 ${enabled ? 'bg-p-green text-white shadow-soft hover:-translate-y-0.5 hover:brightness-105' : 'bg-card-alt text-ink-faint'}`}>
      {iconSrc ? <img src={iconSrc} alt="" className="h-8 w-8 object-contain" draggable={false} /> : <span className="text-2xl leading-none">{icon}</span>}
      <span className="text-xs font-extrabold">{label}</span>
    </button>
  );
}
