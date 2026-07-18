import { RIBBON_LARGE_FRAME, RIBBON_LONG_FRAME, playerBackgroundFrame } from '../assets';
import type { Player, PlayerColor } from '../engine/types';
import { PLAYER_CSS } from '../render/palette';
import { PackedSprite } from './PackedSprite';

export function PlayerColorBackground({ color, className = '' }: { color: PlayerColor; className?: string }) {
  return <PackedSprite name={playerBackgroundFrame(color)} className={`object-contain ${className}`} />;
}

export function PlayerIcon({ isBot, className = '' }: { isBot: boolean; className?: string }) {
  return <PackedSprite name={isBot ? 'icon_bot' : 'icon_player_loggedin'} className={className} />;
}

/** Compact, consistently coloured identity used whenever a player is named. */
export function PlayerIdentity({ player, className = '' }: { player: Player; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 align-middle font-display font-bold ${className}`}>
      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <PlayerColorBackground color={player.color} className="absolute inset-0 h-full w-full" />
        <PlayerIcon isBot={player.isBot} className="relative z-10 h-2.5 w-2.5" />
      </span>
      <span style={{ color: PLAYER_CSS[player.color] }}>{player.name}</span>
    </span>
  );
}

export function VictoryRibbon({
  kind,
  points,
  className = '',
}: {
  kind: 'large' | 'long';
  points: number;
  className?: string;
}) {
  return (
    <div className={`shrink-0 ${className}`} title={`${points} victory points`}>
      <PackedSprite
        name={kind === 'large' ? RIBBON_LARGE_FRAME : RIBBON_LONG_FRAME}
        className="absolute inset-0 h-full w-full object-contain"
      />
      <span className="ribbon-points absolute inset-0 z-10 flex items-center justify-center font-display text-xs font-extrabold leading-none">
        {points}
      </span>
    </div>
  );
}

/** Shared stacked portrait used by every in-game player list. */
export function PlayerScorePortrait({
  player,
  points,
  ribbon = 'large',
  showName = true,
  showRibbon = true,
  className = '',
}: {
  player: Player;
  points: number;
  ribbon?: 'large' | 'long';
  showName?: boolean;
  showRibbon?: boolean;
  className?: string;
}) {
  return (
    <span className={`relative flex shrink-0 items-center justify-center ${className}`}>
      {showName && <span className="absolute inset-x-0 top-0 z-30 truncate text-center font-display text-xs font-bold leading-none text-ink">{player.name}</span>}
      <PlayerColorBackground color={player.color} className="absolute inset-x-0 top-1/2 mx-auto h-12 w-12 -translate-y-1/2" />
      <span className="absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center leading-none" aria-hidden="true">
        <PlayerIcon isBot={player.isBot} className="h-6 w-6" />
      </span>
      {showRibbon && <VictoryRibbon
        kind={ribbon}
        points={points}
        className={`absolute bottom-0 inset-x-0 z-20 mx-auto h-5 ${ribbon === 'long' ? 'w-16' : 'w-11'}`}
      />}
    </span>
  );
}
