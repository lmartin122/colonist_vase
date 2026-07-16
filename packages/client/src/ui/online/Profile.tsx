import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIdentity } from '../../auth/identity';
import { SERVER_URL } from '../../auth/config';

interface GameRow {
  id: string;
  seed: number;
  layout: string;
  endedAt: string;
  won: boolean;
  finalVp: number;
  players: { seat: number; name: string; isBot: boolean; finalVp: number }[];
}

export function Profile() {
  const navigate = useNavigate();
  const { name, getToken } = useIdentity();
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${SERVER_URL}/me/games`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as GameRow[];
        if (!cancelled) setGames(data);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const wins = games?.filter((g) => g.won).length ?? 0;

  return (
    <div className="flex h-full w-full items-center justify-center bg-card-alt p-6">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-card p-8 shadow-panel ring-1 ring-black/5 dark:ring-white/10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold text-ink">{name}</h2>
          <button onClick={() => navigate('/')} className="text-sm text-ink-soft hover:text-ink">← Inicio</button>
        </div>

        {games && (
          <p className="mt-1 text-ink-soft">
            {games.length} partidas · {wins} victorias
          </p>
        )}

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
          {error && <p className="text-sm text-p-red">No se pudo cargar el historial ({error}).</p>}
          {!error && !games && <p className="text-ink-soft">Cargando…</p>}
          {games && games.length === 0 && <p className="text-ink-soft">Todavía no jugaste ninguna partida online.</p>}
          {games && games.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead className="text-ink-faint">
                <tr>
                  <th className="py-1">Fecha</th>
                  <th>Resultado</th>
                  <th>Tus PV</th>
                  <th>Jugadores</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                {games.map((g) => (
                  <tr key={g.id} className="border-t border-ink/10">
                    <td className="py-2">{new Date(g.endedAt).toLocaleDateString()}</td>
                    <td className={g.won ? 'font-bold text-p-green' : 'text-ink-soft'}>{g.won ? 'Victoria' : 'Derrota'}</td>
                    <td>{g.finalVp}</td>
                    <td className="text-ink-soft">{g.players.map((p) => p.name).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
