import { Link } from 'react-router-dom';
import { useOnline } from '../../state/online';

/** Shown at /game in online mode before the first authoritative snapshot lands. */
export function WaitingForGame() {
  const code = useOnline((s) => s.code);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-card-alt">
      <p className="text-ink-soft">{code ? 'Cargando la partida…' : 'No estás en ninguna partida.'}</p>
      <Link to={code ? `/room/${code}` : '/lobby'} className="rounded-xl bg-ink/10 px-5 py-2.5 font-bold text-ink hover:bg-ink/15">
        {code ? '← Volver a la sala' : 'Ir a salas'}
      </Link>
    </div>
  );
}
