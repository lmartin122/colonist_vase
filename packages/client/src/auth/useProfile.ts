import { useCallback, useEffect, useState } from 'react';
import { SERVER_URL } from './config';

export interface Profile {
  userId: string;
  /** Auth0 profile name — the email for database connections. */
  name: string;
  /** Chosen display name, or null while the account has not picked one. */
  username: string | null;
}

/**
 * The player's server-side profile. The username is what everyone else sees, so
 * online play waits for it: `needsUsername` gates the start screen until it is
 * set. Returns `loading` while unknown, so we never flash the picker at someone
 * who already has a name.
 */
export function useProfile(getToken?: () => Promise<string>) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getToken()
      .then((token) => fetch(`${SERVER_URL}/me/profile`, { headers: { Authorization: `Bearer ${token}` } }))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Could not load your profile'))))
      .then((data: Profile) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  /** Claim a username. Resolves with an error message, or null on success. */
  const saveUsername = useCallback(
    async (username: string): Promise<string | null> => {
      if (!getToken) return 'Online play is not configured';
      try {
        const token = await getToken();
        const response = await fetch(`${SERVER_URL}/me/username`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return data?.error ?? 'Could not save your username';
        setProfile((current) => (current ? { ...current, username: data.username } : current));
        return null;
      } catch {
        return 'Could not reach the server';
      }
    },
    [getToken],
  );

  return {
    profile,
    loading,
    error,
    /** True once we know the account exists but has no username yet. */
    needsUsername: Boolean(getToken) && !loading && !error && profile?.username == null,
    saveUsername,
  };
}
