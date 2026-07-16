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

/**
 * Verify an Auth0 access token and extract a stable identity.
 * Throws on any invalid/expired token — the caller rejects the connection.
 */
export async function verifyToken(token: string): Promise<Identity> {
  if (config.devNoAuth) {
    // Dev-only path: the token is literally "userId:displayName".
    const [id, ...rest] = token.split(':');
    if (!id) throw new Error('Missing dev identity');
    return { userId: `dev|${id}`, name: rest.join(':') || id };
  }
  if (!jwks) throw new Error('Auth is not configured (set AUTH0_DOMAIN)');
  const { payload } = await jwtVerify(token, jwks, { issuer, audience: config.auth.audience });
  const userId = String(payload.sub);
  const name = String(payload.name ?? payload.nickname ?? payload.email ?? 'Player');
  return { userId, name };
}
