import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CARD_HIDDEN, RESOURCE_CARD_FRAME } from '../assets';
import type { GameState, Player, Resource, TradeOffer } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { canAfford } from '../engine/helpers';
import { isConcurrentPhase } from '../engine/modes';
import { PLAYER_CSS } from '../render/palette';
import { useGame } from '../state/store';
import { StackedCard } from './StackedCard';
import { PlayerScorePortrait } from './PlayerDecorations';

export function TradeOffersPanel({ game }: { game: GameState }) {
  const humanId = useGame((state) => state.humanId);
  const dispatch = useGame((state) => state.dispatch);
  const offers = game.tradeOffers.filter((offer) => offer.proposer === humanId || (offer.target === humanId && offer.responses[humanId]?.status === 'pending'));
  const canManage = isConcurrentPhase(game) ? !game.pending.passed[humanId] : game.currentPlayer === humanId && game.phase === 'main';
  const canRespond = game.phase === 'main' || isConcurrentPhase(game);
  const respondToOffer = useCallback((offerId: number, accepted: boolean) => {
    dispatch({ type: 'respondTradeOffer', offerId, responder: humanId, accepted });
  }, [dispatch, humanId]);
  if (!offers.length) return null;
  return (
    <aside className="trade-offers-rail pointer-events-auto absolute top-16 z-20 w-72 sm:top-[4.5rem] xl:top-3">
      <div className="max-h-[calc(100vh-10rem)] space-y-3 overflow-y-auto px-0.5 xl:max-h-[calc(100vh-1.5rem)]">
        {offers.map((offer) => offer.target === humanId ? (
          <IncomingOffer key={offer.id} offer={offer} game={game} humanId={humanId} canRespond={canRespond} onRespond={respondToOffer} />
        ) : (
          <OutgoingOffer key={offer.id} offer={offer} game={game} canManage={canManage} onChoose={(partner) => dispatch({ type: 'completeTradeOffer', offerId: offer.id, partner, player: humanId })} onCancel={() => dispatch({ type: 'cancelTradeOffer', offerId: offer.id, player: humanId })} />
        ))}
      </div>
    </aside>
  );
}

function IncomingOffer({ offer, game, humanId, canRespond, onRespond }: { offer: TradeOffer; game: GameState; humanId: number; canRespond: boolean; onRespond: (offerId: number, accepted: boolean) => void }) {
  const [remaining, setRemaining] = useState<number>(game.rules.turnTimer);
  const proposer = game.players[offer.proposer];
  const canAccept = canAfford(game.players[humanId].resources, offer.receive);
  useEffect(() => {
    if (!canRespond) return;
    setRemaining(game.rules.turnTimer);
    const started = Date.now();
    const interval = setInterval(() => {
      const next = Math.max(0, game.rules.turnTimer - Math.floor((Date.now() - started) / 1000));
      setRemaining(next);
      if (next === 0) { clearInterval(interval); onRespond(offer.id, false); }
    }, 1000);
    return () => clearInterval(interval);
  }, [offer.id, game.rules.turnTimer, canRespond, onRespond]);
  return (
    <section className="rounded-2xl bg-card p-3 text-ink shadow-panel ring-2" style={{ borderColor: PLAYER_CSS[proposer.color], boxShadow: `0 8px 24px -8px ${PLAYER_CSS[proposer.color]}88` }}>
      <div className="mb-2 flex items-center gap-2">
        <PlayerScorePortrait player={proposer} points={0} showName={false} showRibbon={false} className="h-12 w-12" />
        <span className="font-display text-sm font-extrabold">Trade offer</span>
        <span className={`ml-auto rounded-lg px-2 py-1 text-xs font-extrabold ${remaining <= 5 ? 'bg-p-red text-white' : 'bg-card-alt text-ink'}`}>{remaining}s</span>
      </div>
      <div className="flex items-stretch gap-1.5">
        <TradeSide><TradeCards bag={offer.receive} /></TradeSide><span className="flex w-6 items-center justify-center text-ink-faint">→</span><TradeSide><TradeCards bag={offer.give} /></TradeSide>
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-ink/10 pt-2 dark:border-white/10">
        <span className="mr-1 text-[9px] font-extrabold uppercase tracking-wide text-ink-faint">Others</span>
        {Object.entries(offer.responses).filter(([playerId]) => Number(playerId) !== humanId).map(([playerId, response]) => {
          const player = game.players[Number(playerId)];
          return <span key={playerId} aria-label={`${response.status} response`} className="flex min-h-12 min-w-12 items-center justify-center"><TradeResponseDecoration player={player} status={response.status} /></span>;
        })}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button disabled={!canRespond} onClick={() => onRespond(offer.id, false)} className="rounded-xl bg-card-alt px-3 py-2 text-sm font-extrabold text-p-red transition hover:brightness-95 disabled:cursor-not-allowed disabled:text-ink-faint">Decline</button>
        <button disabled={!canRespond || !canAccept} onClick={() => onRespond(offer.id, true)} className="rounded-xl bg-p-green px-3 py-2 text-sm font-extrabold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-card-alt disabled:text-ink-faint">Accept</button>
      </div>
      <span className="sr-only">You give the cards on the left and receive the cards on the right. Player {humanId} must respond.</span>
    </section>
  );
}

function OutgoingOffer({ offer, game, canManage, onChoose, onCancel }: { offer: TradeOffer; game: GameState; canManage: boolean; onChoose: (partner: number) => void; onCancel: () => void }) {
  return (
    <section className="rounded-2xl bg-card p-2.5 text-ink shadow-panel ring-1 ring-ink/10 dark:ring-white/15">
      <div className="flex items-stretch gap-1.5"><TradeSide><TradeCards bag={offer.give} /></TradeSide><span className="flex w-6 items-center justify-center text-ink-faint">→</span><TradeSide><TradeCards bag={offer.receive} anyCount={offer.anyCount} /></TradeSide></div>
      <div className="mt-2.5 border-t border-ink/10 pt-2 dark:border-white/10">
        <p className="mb-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-ink-faint">Responses</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(offer.responses).map(([playerId, response]) => {
            const id = Number(playerId); const player = game.players[id];
            return response.status === 'accepted' ? <button key={id} disabled={!canManage} onClick={() => onChoose(id)} aria-label="Choose accepted trade" className="flex h-12 w-12 items-center justify-center rounded-xl"><TradeResponseDecoration player={player} status={response.status} /></button>
              : <span key={id} aria-label={`${response.status} trade`} className="flex h-12 w-12 items-center justify-center"><TradeResponseDecoration player={player} status={response.status} /></span>;
          })}
          {canManage && <button onClick={onCancel} title="Cancel offer" className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl bg-p-red text-lg font-extrabold text-white">×</button>}
        </div>
      </div>
    </section>
  );
}

function TradeSide({ children }: { children: ReactNode }) { return <div className="min-w-0 flex-1 rounded-xl bg-card-alt/80 px-1.5 py-1">{children}</div>; }

function TradeResponseDecoration({ player, status }: { player: Player; status: 'pending' | 'accepted' | 'declined' }) {
  return (
    <span className="relative block h-12 w-12">
      <PlayerScorePortrait player={player} points={0} showName={false} showRibbon={false} className="h-12 w-12" />
      {status !== 'pending' && (
        <span className={`absolute inset-1 z-40 flex items-center justify-center rounded-full text-2xl font-black ring-2 ${status === 'accepted' ? 'bg-p-green/20 text-p-green ring-p-green/60' : 'bg-p-red/20 text-p-red ring-p-red/60'}`} aria-hidden="true">
          {status === 'accepted' ? '✓' : '×'}
        </span>
      )}
    </span>
  );
}

function TradeCards({ bag, anyCount = 0 }: { bag: Partial<Record<Resource, number>>; anyCount?: number }) {
  const entries = RESOURCES.filter((resource) => (bag[resource] ?? 0) > 0);
  return <div className="flex min-h-8 items-center gap-1">{entries.map((resource) => <StackedCard key={resource} sprite={RESOURCE_CARD_FRAME[resource]} alt={resource} count={bag[resource] ?? 0} direction="left" cardWidth={24} cardHeight={32} overlap={4} />)}{anyCount > 0 && <StackedCard src={CARD_HIDDEN} alt="Any card" count={anyCount} direction="left" cardWidth={24} cardHeight={32} overlap={4} />}</div>;
}
