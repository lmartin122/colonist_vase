import 'dotenv/config';

const devNoAuth = process.env.DEV_NO_AUTH === 'true';
const rawOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

/**
 * CORS origin(s) allowed to reach the server.
 * - dev (DEV_NO_AUTH): reflect any origin, so a shifting Vite port (5173/5174/…)
 *   never blocks you locally.
 * - prod: an explicit allowlist (CLIENT_ORIGIN may be a comma-separated list).
 */
const corsOrigin: boolean | string[] = devNoAuth
  ? true
  : rawOrigin.split(',').map((s) => s.trim());

/** Central runtime configuration, read once from the environment. */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  clientOrigin: rawOrigin,
  corsOrigin,
  auth: {
    domain: process.env.AUTH0_DOMAIN ?? '',
    audience: process.env.AUTH0_AUDIENCE ?? '',
    /**
     * Namespaced claim carrying the display name on the ACCESS token. Auth0 does
     * not put `name`/`email` on access tokens; add them with a Login Action to
     * make the name authoritative instead of client-supplied.
     */
    nameClaim: process.env.AUTH0_NAME_CLAIM ?? 'https://colonist-vase/name',
  },
  databaseUrl: process.env.DATABASE_URL ?? '',
  /** DEV ONLY: bypass Auth0 and accept a "userId:name" token. Never in prod. */
  devNoAuth,
  /** Delay between server-driven bot actions, so games feel paced to watchers. */
  botDelayMs: Number(process.env.BOT_DELAY_MS ?? 500),
};
