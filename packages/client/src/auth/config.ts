/** True when Auth0 env vars are present, enabling the online (multiplayer) flow. */
export const AUTH_CONFIGURED = Boolean(
  import.meta.env.VITE_AUTH0_DOMAIN && import.meta.env.VITE_AUTH0_CLIENT_ID,
);

/**
 * Local dev shortcut: skip Auth0 and log in with just a display name. Pairs with
 * DEV_NO_AUTH=true on the server. NEVER enable in production.
 */
export const DEV_LOGIN = import.meta.env.VITE_DEV_LOGIN === 'true';

export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';
