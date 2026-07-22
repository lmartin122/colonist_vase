import { describe, expect, it } from 'vitest';
import { sanitizeServerUrl } from '../src/auth/config';

describe('sanitizeServerUrl', () => {
  it('prepends https:// to a bare hostname', () => {
    // The exact failure mode this guards against: a Vercel env var pasted
    // without a scheme resolves as a path on the CLIENT's own origin instead of
    // another host, silently 404ing (or hitting the SPA fallback) every request.
    expect(sanitizeServerUrl('myapp.up.railway.app')).toBe('https://myapp.up.railway.app');
  });

  it('leaves an explicit https:// origin untouched', () => {
    expect(sanitizeServerUrl('https://myapp.up.railway.app')).toBe('https://myapp.up.railway.app');
  });

  it('leaves an explicit http:// origin untouched (local dev)', () => {
    expect(sanitizeServerUrl('http://localhost:3001')).toBe('http://localhost:3001');
  });

  it('strips a trailing slash', () => {
    expect(sanitizeServerUrl('https://myapp.up.railway.app/')).toBe('https://myapp.up.railway.app');
    expect(sanitizeServerUrl('myapp.up.railway.app/')).toBe('https://myapp.up.railway.app');
  });

  it('strips multiple trailing slashes', () => {
    expect(sanitizeServerUrl('https://myapp.up.railway.app///')).toBe('https://myapp.up.railway.app');
  });
});
