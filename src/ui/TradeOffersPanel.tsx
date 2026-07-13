import { CARD_HIDDEN, RESOURCE_CARD } from '../assets';
import type { ReactNode } from 'react';
import type { GameState, Resource, TradeOffer } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { PLAYER_CSS } from '../render/palette';
import { useGame } from '../state/store';
import { StackedCard } from './StackedCard';

/** Active player-trade offers, visible only to the human proposer during their turn. */
export function TradeOffersPanel({ game }: { game: GameState }) {
  const humanId = useGame((s) => s.humanId);
  const dispatch = useGame((s) => s.dispatch);
  const offers = game.tradeOffers.filter((offer) => offer.proposer === humanId);
  const canManage = game.currentPlayer === humanId && game.phase === 'main';
  if (!offers.length) return null;

  return (
    <aside className="trade-offers-rail pointer-events-auto absolute top-16 z-20 w-72 sm:top-[4.5rem]">
      <div className="max-h-[calc(100vh-10rem)] space-y-3 overflow-y-auto px-0.5">
        {offers.map((offer) => (
          <Offer
            key={offer.id}
            offer={offer}
            game={game}
            canManage={canManage}
            onChoose={(partner) => dispatch({ type: 'completeTradeOffer', offerId: offer.id, partner })}
            onCancel={() => dispatch({ type: 'cancelTradeOffer', offerId: offer.id })}
          />
        ))}
      </div>
    </aside>
  );
}

function Offer({ offer, game, canManage, onChoose, onCancel }: { offer: TradeOffer; game: GameState; canManage: boolean; onChoose: (partner: number) => void; onCancel: () => void }) {
  return (
    <section className="rounded-2xl bg-card/95 p-2.5 text-ink shadow-panel ring-1 ring-ink/10 backdrop-blur-sm dark:ring-white/15">
      <div className="flex items-stretch gap-1.5">
        <TradeSide><TradeCards bag={offer.give} /></TradeSide>
        <span className="flex w-6 shrink-0 items-center justify-center text-sm font-extrabold text-ink-faint" aria-label="for">→</span>
        <TradeSide><TradeCards bag={offer.receive} anyCount={offer.anyCount} /></TradeSide>
      </div>

      <div className="mt-2.5 border-t border-ink/10 pt-2 dark:border-white/10">
        <p className="mb-1.5 px-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-ink-faint">Responses</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(offer.responses).map(([playerId, response]) => {
            const id = Number(playerId);
            const player = game.players[id];
            const color = PLAYER_CSS[player.color];
            return response.accepted ? (
              <button key={id} type="button" disabled={!canManage} onClick={() => onChoose(id)} title={`${player.name} accepts — choose this trade`} className="relative flex h-10 min-w-10 items-center justify-center rounded-xl px-1.5 text-base transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-default" style={{ background: `${color}30`, boxShadow: `inset 0 0 0 2px ${color}` }}>
                <span>{player.isBot ? '🤖' : '🎩'}</span>
                <span className="absolute inset-0 flex items-center justify-center rounded-xl text-sm font-extrabold text-white" style={{ background: `${color}d9` }}>✓</span>
              </button>
            ) : (
              <span key={id} title={`${player.name} declined`} className="relative flex h-10 w-10 items-center justify-center rounded-xl text-base" style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 2px ${color}88` }}>
                <span className="opacity-30 grayscale">{player.isBot ? '🤖' : '🎩'}</span>
                <span className="absolute inset-0 flex items-center justify-center rounded-xl text-sm font-extrabold" style={{ background: `${color}2b`, color }}>×</span>
              </span>
            );
          })}
          {canManage && <button type="button" onClick={onCancel} title="Cancel offer" aria-label="Cancel offer" className="relative ml-auto flex h-10 w-10 items-center justify-center rounded-xl bg-p-red text-lg font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 hover:brightness-110">×</button>}
        </div>
      </div>
    </section>
  );
}

function TradeSide({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-card-alt/80 px-1.5 py-1">
      {children}
    </div>
  );
}

function TradeCards({ bag, anyCount = 0 }: { bag: Partial<Record<Resource, number>>; anyCount?: number }) {
  const entries = RESOURCES.filter((resource) => (bag[resource] ?? 0) > 0);
  return <div className="flex min-h-8 items-center gap-1">{entries.map((resource) => <StackedCard key={resource} src={RESOURCE_CARD[resource]} alt={resource} count={bag[resource] ?? 0} direction="left" cardWidth={24} cardHeight={32} overlap={4} />)}{anyCount > 0 && <StackedCard src={CARD_HIDDEN} alt="Any card" count={anyCount} direction="left" cardWidth={24} cardHeight={32} overlap={4} />}</div>;
}
