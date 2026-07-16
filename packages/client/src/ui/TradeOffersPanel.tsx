import { useEffect, useState, type ReactNode } from 'react';
import { CARD_HIDDEN, RESOURCE_CARD } from '../assets';
import type { GameState, Resource, TradeOffer } from '@colonist/shared';
import { RESOURCES } from '@colonist/shared';
import { canAfford } from '@colonist/shared';
import { PLAYER_CSS } from '../render/palette';
import { useGame } from '../state/store';
import { StackedCard } from './StackedCard';

export function TradeOffersPanel({ game }: { game: GameState }) {
  const humanId = useGame((state) => state.humanId);
  const dispatch = useGame((state) => state.dispatch);
  const offers = game.tradeOffers.filter((offer) => offer.proposer === humanId || (offer.target === humanId && offer.responses[humanId]?.status === 'pending'));
  const canManage = game.currentPlayer === humanId && game.phase === 'main';
  if (!offers.length) return null;
  return (
    <aside className="trade-offers-rail pointer-events-auto absolute top-16 z-20 w-72 sm:top-[4.5rem]">
      <div className="max-h-[calc(100vh-10rem)] space-y-3 overflow-y-auto px-0.5">
        {offers.map((offer) => offer.target === humanId ? (
          <IncomingOffer key={offer.id} offer={offer} game={game} humanId={humanId} onRespond={(accepted) => dispatch({ type: 'respondTradeOffer', offerId: offer.id, responder: humanId, accepted })} />
        ) : (
          <OutgoingOffer key={offer.id} offer={offer} game={game} canManage={canManage} onChoose={(partner) => dispatch({ type: 'completeTradeOffer', offerId: offer.id, partner })} onCancel={() => dispatch({ type: 'cancelTradeOffer', offerId: offer.id })} />
        ))}
      </div>
    </aside>
  );
}

function IncomingOffer({ offer, game, humanId, onRespond }: { offer: TradeOffer; game: GameState; humanId: number; onRespond: (accepted: boolean) => void }) {
  const [remaining, setRemaining] = useState<number>(game.rules.turnTimer);
  const proposer = game.players[offer.proposer];
  const canAccept = canAfford(game.players[humanId].resources, offer.receive);
  useEffect(() => {
    setRemaining(game.rules.turnTimer);
    const started = Date.now();
    const interval = setInterval(() => {
      const next = Math.max(0, game.rules.turnTimer - Math.floor((Date.now() - started) / 1000));
      setRemaining(next);
      if (next === 0) { clearInterval(interval); onRespond(false); }
    }, 250);
    return () => clearInterval(interval);
  }, [offer.id, game.rules.turnTimer, onRespond]);
  return (
    <section className="rounded-2xl bg-card/95 p-3 text-ink shadow-panel ring-2 backdrop-blur-sm" style={{ borderColor: PLAYER_CSS[proposer.color], boxShadow: `0 8px 24px -8px ${PLAYER_CSS[proposer.color]}88` }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl text-lg" style={{ background: `${PLAYER_CSS[proposer.color]}35` }}>🤖</span>
        <span className="font-display text-sm font-extrabold">{proposer.name} offers</span>
        <span className={`ml-auto rounded-lg px-2 py-1 text-xs font-extrabold ${remaining <= 5 ? 'bg-p-red text-white' : 'bg-card-alt text-ink'}`}>{remaining}s</span>
      </div>
      <div className="flex items-stretch gap-1.5">
        <TradeSide><TradeCards bag={offer.receive} /></TradeSide><span className="flex w-6 items-center justify-center text-ink-faint">→</span><TradeSide><TradeCards bag={offer.give} /></TradeSide>
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-ink/10 pt-2 dark:border-white/10">
        <span className="mr-1 text-[9px] font-extrabold uppercase tracking-wide text-ink-faint">Others</span>
        {Object.entries(offer.responses).filter(([playerId]) => Number(playerId) !== humanId).map(([playerId, response]) => {
          const player = game.players[Number(playerId)]; const color = PLAYER_CSS[player.color];
          return <span key={playerId} title={`${player.name} ${response.status}`} className="relative flex h-8 w-8 items-center justify-center rounded-lg text-xs font-extrabold" style={{ color: response.status === 'accepted' ? 'white' : color, background: response.status === 'accepted' ? `${color}d9` : `${color}25`, boxShadow: `inset 0 0 0 2px ${color}88` }}>{response.status === 'accepted' ? '✓' : '×'}</span>;
        })}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button onClick={() => onRespond(false)} className="rounded-xl bg-card-alt px-3 py-2 text-sm font-extrabold text-p-red transition hover:brightness-95">Decline</button>
        <button disabled={!canAccept} onClick={() => onRespond(true)} className="rounded-xl bg-p-green px-3 py-2 text-sm font-extrabold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-card-alt disabled:text-ink-faint">Accept</button>
      </div>
      <span className="sr-only">You give the cards on the left and receive the cards on the right. Player {humanId} must respond.</span>
    </section>
  );
}

function OutgoingOffer({ offer, game, canManage, onChoose, onCancel }: { offer: TradeOffer; game: GameState; canManage: boolean; onChoose: (partner: number) => void; onCancel: () => void }) {
  return (
    <section className="rounded-2xl bg-card/95 p-2.5 text-ink shadow-panel ring-1 ring-ink/10 backdrop-blur-sm dark:ring-white/15">
      <div className="flex items-stretch gap-1.5"><TradeSide><TradeCards bag={offer.give} /></TradeSide><span className="flex w-6 items-center justify-center text-ink-faint">→</span><TradeSide><TradeCards bag={offer.receive} anyCount={offer.anyCount} /></TradeSide></div>
      <div className="mt-2.5 border-t border-ink/10 pt-2 dark:border-white/10">
        <p className="mb-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-ink-faint">Responses</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(offer.responses).map(([playerId, response]) => {
            const id = Number(playerId); const player = game.players[id]; const color = PLAYER_CSS[player.color];
            return response.status === 'accepted' ? <button key={id} disabled={!canManage} onClick={() => onChoose(id)} title={`${player.name} accepts`} className="relative flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: `${color}d9`, boxShadow: `inset 0 0 0 2px ${color}` }}>✓</button>
              : <span key={id} title={`${player.name} declined`} className="relative flex h-10 w-10 items-center justify-center rounded-xl font-extrabold" style={{ background: `${color}2b`, color, boxShadow: `inset 0 0 0 2px ${color}88` }}>×</span>;
          })}
          {canManage && <button onClick={onCancel} title="Cancel offer" className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl bg-p-red text-lg font-extrabold text-white">×</button>}
        </div>
      </div>
    </section>
  );
}

function TradeSide({ children }: { children: ReactNode }) { return <div className="min-w-0 flex-1 rounded-xl bg-card-alt/80 px-1.5 py-1">{children}</div>; }
function TradeCards({ bag, anyCount = 0 }: { bag: Partial<Record<Resource, number>>; anyCount?: number }) {
  const entries = RESOURCES.filter((resource) => (bag[resource] ?? 0) > 0);
  return <div className="flex min-h-8 items-center gap-1">{entries.map((resource) => <StackedCard key={resource} src={RESOURCE_CARD[resource]} alt={resource} count={bag[resource] ?? 0} direction="left" cardWidth={24} cardHeight={32} overlap={4} />)}{anyCount > 0 && <StackedCard src={CARD_HIDDEN} alt="Any card" count={anyCount} direction="left" cardWidth={24} cardHeight={32} overlap={4} />}</div>;
}
