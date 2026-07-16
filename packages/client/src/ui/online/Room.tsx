import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { BotDifficulty } from '@colonist/shared';
import { PLAYER_CSS } from '../../render/palette';
import { useIdentity } from '../../auth/identity';
import { addBot, joinRoom, leaveRoom, removeSeat, setReady, startGame } from '../../net/socket';
import { useOnline } from '../../state/online';

export function Room() {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const { sub } = useIdentity();
  const room = useOnline((s) => s.room);
  const setCode = useOnline((s) => s.setCode);
  const [error, setError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('medium');

  // Direct link / refresh: make sure we've joined the room named in the URL.
  useEffect(() => {
    if (code && (!room || room.code !== code)) {
      setCode(code);
      void joinRoom(code).then((res) => {
        if (!res.ok) setError(res.error);
      });
    }
  }, [code, room, setCode]);

  // When the host starts, everyone jumps into the game.
  useEffect(() => {
    if (room?.phase === 'playing') navigate('/game');
  }, [room?.phase, navigate]);

  if (!room) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-card-alt">
        <p className="text-ink-soft">{error ?? 'Entrando a la sala…'}</p>
      </div>
    );
  }

  const mySeat = room.seats.find((s) => s.userId === sub);
  const isHost = mySeat?.isHost ?? false;
  const inviteLink = `${window.location.origin}/room/${room.code}`;

  async function guard(p: Promise<{ ok: boolean; error?: string }>) {
    const res = await p;
    if (!res.ok) setError(res.error ?? 'Error');
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-card-alt p-6">
      <div className="w-full max-w-lg rounded-2xl bg-card p-8 shadow-panel ring-1 ring-black/5 dark:ring-white/10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold text-ink">Sala {room.code}</h2>
          <button
            onClick={() => navigator.clipboard?.writeText(inviteLink)}
            className="rounded-lg bg-ink/10 px-3 py-1.5 text-sm font-bold text-ink hover:bg-ink/15"
            title={inviteLink}
          >
            📋 Copiar invitación
          </button>
        </div>

        <ul className="mt-6 space-y-2">
          {room.seats.map((seat) => (
            <li
              key={seat.seat}
              className="flex items-center gap-3 rounded-xl bg-card-alt px-3 py-2 ring-1 ring-black/5 dark:ring-white/10"
            >
              <span className="h-4 w-4 rounded-full" style={{ background: PLAYER_CSS[seat.color] }} />
              <span className="flex-1 font-display font-bold text-ink">
                {seat.name}
                {seat.isHost && <span className="ml-2 text-xs text-ink-faint">host</span>}
                {seat.isBot && <span className="ml-2 text-xs text-ink-faint">bot · {seat.botDifficulty}</span>}
              </span>
              {!seat.isBot && (
                <span className={`text-xs font-bold ${seat.connected ? 'text-p-green' : 'text-ink-faint'}`}>
                  {seat.connected ? (seat.ready || seat.isHost ? 'listo' : 'esperando') : 'desconectado'}
                </span>
              )}
              {isHost && !seat.isHost && (
                <button
                  onClick={() => void guard(removeSeat(seat.seat))}
                  className="text-ink-faint hover:text-p-red"
                  title="Quitar"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>

        {isHost && room.seats.length < room.maxPlayers && (
          <div className="mt-4 flex items-center gap-2">
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as BotDifficulty)}
              className="rounded-lg bg-card-alt px-3 py-2 text-sm font-bold text-ink ring-1 ring-black/5 dark:ring-white/10"
            >
              <option value="easy">Fácil</option>
              <option value="medium">Medio</option>
              <option value="hard">Difícil</option>
            </select>
            <button
              onClick={() => void guard(addBot(difficulty))}
              className="rounded-lg bg-ink/10 px-3 py-2 text-sm font-bold text-ink hover:bg-ink/15"
            >
              + Agregar bot
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-p-red">{error}</p>}

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => {
              void leaveRoom();
              setCode(null);
              navigate('/lobby');
            }}
            className="text-sm text-ink-soft hover:text-ink"
          >
            ← Salir
          </button>

          {isHost ? (
            <button
              onClick={() => void guard(startGame())}
              disabled={room.seats.length < 2}
              className="rounded-xl bg-p-green px-6 py-3 font-display font-extrabold text-white shadow-soft transition hover:brightness-105 disabled:opacity-60"
            >
              Comenzar partida
            </button>
          ) : (
            <button
              onClick={() => void guard(setReady(!(mySeat?.ready ?? false)))}
              className="rounded-xl bg-p-blue px-6 py-3 font-display font-extrabold text-white shadow-soft hover:brightness-105"
            >
              {mySeat?.ready ? 'No estoy listo' : 'Estoy listo'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
