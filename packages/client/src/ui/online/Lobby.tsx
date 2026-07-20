import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAME_MODES, type GameModeId } from '@colonist/shared';
import { useIdentity } from '../../auth/identity';
import { createRoom, joinRoom } from '../../net/socket';
import { useOnline } from '../../state/online';

export function Lobby() {
  const navigate = useNavigate();
  const { name, logout } = useIdentity();
  const setCode = useOnline((s) => s.setCode);
  const [code, setLocalCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<GameModeId>('classic');
  const [layout, setLayout] = useState<'random' | 'classic'>('random');

  async function onCreate() {
    setBusy(true);
    setError(null);
    const res = await createRoom({ rules: { mode }, layout });
    setBusy(false);
    if (res.ok) {
      setCode(res.data.code);
      navigate(`/room/${res.data.code}`);
    } else setError(res.error);
  }

  async function onJoin() {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const res = await joinRoom(code.trim().toUpperCase());
    setBusy(false);
    if (res.ok) {
      setCode(res.data.code);
      navigate(`/room/${res.data.code}`);
    } else setError(res.error);
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-card-alt p-6">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-panel ring-1 ring-black/5 dark:ring-white/10">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold text-ink">Salas</h2>
          <span className="text-sm text-ink-soft">{name}</span>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-ink-soft">
            Modo
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as GameModeId)}
              className="mt-1 w-full rounded-lg bg-card-alt px-3 py-2 text-sm font-bold text-ink ring-1 ring-black/5 dark:ring-white/10"
            >
              {Object.values(GAME_MODES).map((gameMode) => (
                <option key={gameMode.id} value={gameMode.id}>{gameMode.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-ink-soft">
            Tablero
            <select
              value={layout}
              onChange={(event) => setLayout(event.target.value as 'random' | 'classic')}
              className="mt-1 w-full rounded-lg bg-card-alt px-3 py-2 text-sm font-bold text-ink ring-1 ring-black/5 dark:ring-white/10"
            >
              <option value="random">Aleatorio</option>
              <option value="classic">Clásico</option>
            </select>
          </label>
        </div>

        <p className="mb-4 rounded-lg bg-card-alt px-3 py-2 text-xs text-ink-soft">
          {GAME_MODES[mode].description}
        </p>

        <button
          onClick={onCreate}
          disabled={busy}
          className="w-full rounded-xl bg-p-green px-5 py-3 font-display font-extrabold text-white shadow-soft transition hover:brightness-105 disabled:opacity-60"
        >
          Crear una sala
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
          <span className="h-px flex-1 bg-ink/10" /> o unirte <span className="h-px flex-1 bg-ink/10" />
        </div>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setLocalCode(e.target.value)}
            placeholder="CÓDIGO"
            maxLength={6}
            className="flex-1 rounded-xl bg-card-alt px-4 py-3 text-center font-mono text-lg font-bold uppercase tracking-widest text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-p-blue dark:ring-white/10"
          />
          <button
            onClick={onJoin}
            disabled={busy || !code.trim()}
            className="rounded-xl bg-p-blue px-5 font-display font-extrabold text-white shadow-soft transition hover:brightness-105 disabled:opacity-60"
          >
            Unirse
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-p-red">{error}</p>}

        <div className="mt-8 flex justify-between text-sm">
          <button onClick={() => navigate('/')} className="text-ink-soft hover:text-ink">← Inicio</button>
          <button onClick={() => logout()} className="text-ink-soft hover:text-ink">
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
