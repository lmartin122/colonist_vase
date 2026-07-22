import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => void>();
const fakeSocket = {
  connected: true,
  off: vi.fn(() => handlers.clear()),
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler)),
};
const findMyRoom = vi.fn();

vi.mock('../src/net/socket', () => ({
  connectSocket: vi.fn(() => fakeSocket),
  disconnectSocket: vi.fn(),
  joinRoom: vi.fn(),
  watchGame: vi.fn(),
  sendChat: vi.fn(),
  findMyRoom: (...args: unknown[]) => findMyRoom(...args),
}));

const LAST_ROOM_CODE_KEY = 'cv-last-room-code';

/** Minimal, stateful sessionStorage fake — the test environment is plain node. */
function fakeSessionStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}

describe('useOnline: rejoin target reconciliation on connect', () => {
  beforeEach(() => {
    handlers.clear();
    findMyRoom.mockReset();
    vi.stubGlobal('sessionStorage', fakeSessionStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('clears a stale rejoin code when the account holds no active room', async () => {
    // A prior session left this in sessionStorage — the room since ended (or was
    // swept) server-side while this tab was never connected to hear about it.
    sessionStorage.setItem(LAST_ROOM_CODE_KEY, 'STALE1');
    findMyRoom.mockResolvedValue({ ok: true, data: null });

    const { useOnline } = await import('../src/state/online');
    expect(useOnline.getState().lastCode).toBe('STALE1');

    useOnline.getState().connect('token');
    handlers.get('connect')!();
    await vi.waitFor(() => expect(findMyRoom).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useOnline.getState().lastCode).toBeNull();
    expect(sessionStorage.getItem(LAST_ROOM_CODE_KEY)).toBeNull();
  });

  it('adopts the server-reported room as the rejoin target', async () => {
    findMyRoom.mockResolvedValue({ ok: true, data: { code: 'LIVE12', phase: 'playing' } });

    const { useOnline } = await import('../src/state/online');
    useOnline.getState().connect('token');
    handlers.get('connect')!();
    await vi.waitFor(() => expect(findMyRoom).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useOnline.getState().lastCode).toBe('LIVE12');
    expect(sessionStorage.getItem(LAST_ROOM_CODE_KEY)).toBe('LIVE12');
  });

  it('leaves a previously-known code untouched when the request itself fails', async () => {
    sessionStorage.setItem(LAST_ROOM_CODE_KEY, 'KEEP01');
    findMyRoom.mockResolvedValue({ ok: false, error: 'offline' });

    const { useOnline } = await import('../src/state/online');
    expect(useOnline.getState().lastCode).toBe('KEEP01');

    useOnline.getState().connect('token');
    handlers.get('connect')!();
    await vi.waitFor(() => expect(findMyRoom).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useOnline.getState().lastCode).toBe('KEEP01');
  });
});
