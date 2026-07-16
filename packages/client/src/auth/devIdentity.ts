import { create } from 'zustand';

// A per-TAB dev identity. We deliberately use sessionStorage (not localStorage)
// so two tabs/windows of the SAME browser are two DISTINCT players — which is
// exactly what you want for local multiplayer testing. sessionStorage survives a
// refresh of the same tab (so reconnection keeps your seat) but is isolated per
// tab, unlike localStorage which is shared across tabs/incognito windows.
const KEY_ID = 'cv-dev-id';
const KEY_NAME = 'cv-dev-name';

const store = typeof sessionStorage === 'undefined' ? null : sessionStorage;

function loadId(): string {
  if (!store) return 'u000000';
  let id = store.getItem(KEY_ID);
  if (!id) {
    id = 'u' + Math.random().toString(36).slice(2, 8);
    store.setItem(KEY_ID, id);
  }
  return id;
}

interface DevAuthState {
  id: string;
  name: string | null;
  setName: (name: string) => void;
  clear: () => void;
}

export const useDevAuth = create<DevAuthState>((set) => ({
  id: loadId(),
  name: store?.getItem(KEY_NAME) ?? null,
  setName(name) {
    store?.setItem(KEY_NAME, name);
    set({ name });
  },
  clear() {
    store?.removeItem(KEY_NAME);
    set({ name: null });
  },
}));
