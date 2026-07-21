import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config';

export interface Identity {
  userId: string;
  name: string;
}

const issuer = config.auth.domain ? `https://${config.auth.domain}/` : '';
const jwks = config.auth.domain
  ? createRemoteJWKSet(new URL(`https://${config.auth.domain}/.well-known/jwks.json`))
  : null;

/** Display names are cosmetic, but still bounded and free of control characters. */
const MAX_NAME_LENGTH = 32;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\u0000-\u001f\u007f]', 'g');

function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, '').trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * Verify an Auth0 access token and extract a stable identity.
 * Throws on any invalid/expired token — the caller rejects the connection.
 *
 * `userId` always comes from the cryptographically verified `sub`; only the
 * cosmetic display name may fall back to `suppliedName` (sent by the client at
 * handshake). Auth0 access tokens carry no profile claims by default — `name`,
 * `nickname` and `email` live on the ID token — so without a Login Action
 * adding `config.auth.nameClaim`, every player would otherwise show as "Player".
 */
export async function verifyToken(token: string, suppliedName = ''): Promise<Identity> {
  if (config.devNoAuth) {
    // Dev-only path: the token is literally "userId:displayName".
    const [id, ...rest] = token.split(':');
    if (!id) throw new Error('Missing dev identity');
    return { userId: `dev|${id}`, name: cleanName(rest.join(':')) || id };
  }
  if (!jwks) throw new Error('Auth is not configured (set AUTH0_DOMAIN)');
  const { payload } = await jwtVerify(token, jwks, { issuer, audience: config.auth.audience });
  const userId = String(payload.sub);
  const verified =
    cleanName(payload[config.auth.nameClaim]) ||
    cleanName(payload.name) ||
    cleanName(payload.nickname) ||
    cleanName(payload.email);
  const name = verified || cleanName(suppliedName) || 'Player';
  return { userId, name };
}
