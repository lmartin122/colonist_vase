import { useAuth0 } from '@auth0/auth0-react';
import { DEV_LOGIN } from './config';
import { useDevAuth } from './devIdentity';

/** Uniform identity used by the online screens, regardless of Auth0 vs dev-login. */
export interface Identity {
  name: string;
  /** Stable user id; matches the seat.userId the server assigns. */
  sub: string;
  ready: boolean;
  logout: () => void;
  /** Token the socket/REST layer sends (Auth0 JWT, or "id:name" in dev mode). */
  getToken: () => Promise<string>;
}

function useDevIdentity(): Identity {
  const { id, name, clear } = useDevAuth();
  return {
    name: name ?? 'Player',
    sub: `dev|${id}`, // the server prefixes dev identities with "dev|"
    ready: Boolean(name),
    logout: clear,
    getToken: async () => `${id}:${name ?? 'Player'}`,
  };
}

function useAuth0Identity(): Identity {
  const { user, isAuthenticated, logout, getAccessTokenSilently } = useAuth0();
  return {
    name: user?.name ?? 'Player',
    sub: user?.sub ?? '',
    ready: isAuthenticated,
    logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
    getToken: getAccessTokenSilently,
  };
}

// DEV_LOGIN is a build-time constant, so this binding is stable across renders
// (no conditional-hook hazard).
export const useIdentity = DEV_LOGIN ? useDevIdentity : useAuth0Identity;
