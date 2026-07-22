/** True when Auth0 env vars are present, enabling the online (multiplayer) flow. */
export const AUTH_CONFIGURED = Boolean(
  import.meta.env.VITE_AUTH0_DOMAIN && import.meta.env.VITE_AUTH0_CLIENT_ID,
);

/**
 * Local dev shortcut: skip Auth0 and log in with just a display name. Pairs with
 * DEV_NO_AUTH=true on the server. NEVER enable in production.
 */
export const DEV_LOGIN = import.meta.env.VITE_DEV_LOGIN === 'true';

/**
 * Sanitize the configured server origin:
 *  - strip a trailing slash, so `${SERVER_URL}/me/games` never becomes a double
 *    slash (Socket.IO tolerates it, but Express 404s on the doubled path);
 *  - prepend `https://` when the scheme is missing. A bare hostname (e.g. pasting
 *    just `myapp.up.railway.app` into Vercel's env var editor) has no `://`, so
 *    `fetch()`/Socket.IO treat it as a path *relative to the current page*
 *    instead of another origin — every request then silently hits the client's
 *    own domain and 404s (or, worse, resolves to its SPA index.html, so a JSON
 *    parse fails with "Unexpected token '<'").
 */
export function sanitizeServerUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const SERVER_URL = sanitizeServerUrl(import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001');
