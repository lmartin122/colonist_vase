import { useEffect, useState, type ReactNode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Link } from 'react-router-dom';
import { AUTH_CONFIGURED, DEV_LOGIN } from '../../auth/config';
import { useDevAuth } from '../../auth/devIdentity';
import { useOnline } from '../../state/online';

/** Centered card used by all the online-flow gates/screens. */
function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-card-alt p-6">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center shadow-panel ring-1 ring-black/5 dark:ring-white/10">
        {children}
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <Card>
      <h2 className="font-display text-2xl font-extrabold text-ink">Online unavailable</h2>
      <p className="mt-2 text-ink-soft">Configure Auth0 to enable multiplayer.</p>
      <Link to="/" className="mt-6 inline-block rounded-xl bg-ink/10 px-5 py-2.5 font-bold text-ink hover:bg-ink/15">
        ← Back
      </Link>
    </Card>
  );
}

/** Ensures the user is authenticated and the socket is connected before
 *  rendering online screens. Never calls useAuth0 when Auth0 isn't configured. */
export function OnlineGate({ children }: { children: ReactNode }) {
  if (DEV_LOGIN) return <DevGate>{children}</DevGate>;
  if (!AUTH_CONFIGURED) return <NotConfigured />;
  return <AuthedGate>{children}</AuthedGate>;
}

/** Local dev gate: enter a name, connect with a DEV_NO_AUTH token, no Auth0. */
function DevGate({ children }: { children: ReactNode }) {
  const { id, name, setName } = useDevAuth();
  const connect = useOnline((s) => s.connect);
  const status = useOnline((s) => s.status);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (name) connect(`${id}:${name}`);
  }, [id, name, connect]);

  if (!name) {
    return (
      <Card>
        <h2 className="font-display text-2xl font-extrabold text-ink">Log in (dev)</h2>
        <p className="mt-2 text-ink-soft">Pick a name to play online locally.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) setName(draft.trim());
          }}
          className="mt-6 flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your name"
            className="flex-1 rounded-xl bg-card-alt px-4 py-3 text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-p-blue dark:ring-white/10"
          />
          <button type="submit" className="rounded-xl bg-p-blue px-5 font-display font-extrabold text-white shadow-soft hover:brightness-105">
            Enter
          </button>
        </form>
      </Card>
    );
  }

  if (status !== 'connected') return <Connecting />;

  return <>{children}</>;
}

/** Shared "connecting" state that surfaces connection errors instead of hanging. */
function Connecting() {
  const status = useOnline((s) => s.status);
  const error = useOnline((s) => s.error);
  return (
    <Card>
      <p className="text-ink-soft">Connecting to the server…</p>
      {status === 'error' && (
        <p className="mt-3 text-sm text-p-red">{error ?? 'Could not connect. Is the server running?'}</p>
      )}
    </Card>
  );
}

function AuthedGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, loginWithRedirect, getAccessTokenSilently } = useAuth0();
  const connect = useOnline((s) => s.connect);
  const status = useOnline((s) => s.status);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getAccessTokenSilently()
      .then((token) => {
        if (!cancelled) connect(token);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getAccessTokenSilently, connect]);

  if (isLoading) return <Card><p className="text-ink-soft">Loading…</p></Card>;

  if (!isAuthenticated) {
    return (
      <Card>
        <h2 className="font-display text-2xl font-extrabold text-ink">Log in</h2>
        <p className="mt-2 text-ink-soft">Sign in with your account to play online.</p>
        <button
          onClick={() => void loginWithRedirect()}
          className="mt-6 rounded-xl bg-p-blue px-6 py-3 font-display font-extrabold text-white shadow-soft hover:brightness-105"
        >
          Sign in
        </button>
      </Card>
    );
  }

  if (status !== 'connected') return <Connecting />;

  return <>{children}</>;
}
