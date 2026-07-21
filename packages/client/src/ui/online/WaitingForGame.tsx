import { Link } from 'react-router-dom';

/** Shown at /game/:code before the first authoritative snapshot lands. */
export function WaitingForGame({ code }: { code: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-card-alt">
      <p className="text-ink-soft">Loading the game…</p>
      <Link to={`/room/${code}`} className="rounded-xl bg-ink/10 px-5 py-2.5 font-bold text-ink hover:bg-ink/15">
        ← Back to the lobby
      </Link>
    </div>
  );
}
