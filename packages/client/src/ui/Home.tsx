import { Link } from 'react-router-dom';
import { AUTH_CONFIGURED, DEV_LOGIN } from '../auth/config';

/** Landing screen: choose local (vs bots) or online play. */
export function Home() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-card-alt p-6">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center shadow-panel ring-1 ring-black/5 dark:ring-white/10">
        <h1 className="font-display text-4xl font-extrabold text-ink">Colonist Vase</h1>
        <p className="mt-2 text-ink-soft">Settle, build and trade.</p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            to="/local"
            className="rounded-xl bg-p-green px-5 py-3 font-display font-extrabold text-white shadow-soft transition hover:brightness-105"
          >
            🤖 Jugar vs Bots
          </Link>
          <Link
            to="/lobby"
            className="rounded-xl bg-p-blue px-5 py-3 font-display font-extrabold text-white shadow-soft transition hover:brightness-105"
          >
            🌐 Jugar Online
          </Link>
          <Link
            to="/profile"
            className="rounded-xl bg-ink/10 px-5 py-3 font-display font-bold text-ink transition hover:bg-ink/15"
          >
            👤 Mi Perfil
          </Link>
        </div>

        {DEV_LOGIN && <p className="mt-6 text-xs text-ink-faint">Modo dev-login activo (sin Auth0).</p>}
        {!AUTH_CONFIGURED && !DEV_LOGIN && (
          <p className="mt-6 text-xs text-ink-faint">
            El modo online requiere configurar Auth0 (variables <code>VITE_AUTH0_*</code>).
          </p>
        )}
      </div>
    </div>
  );
}
