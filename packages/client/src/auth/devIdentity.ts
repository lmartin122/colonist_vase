import { create } from 'zustand';

// A stable per-browser dev identity, persisted so reconnection keeps your seat.
const KEY_ID = 'cv-dev-id';
const KEY_NAME = 'cv-dev-name';

function loadId(): string {
  if (typeof localStorage === 'undefined') return 'u000000';
  let id = localStorage.getItem(KEY_ID);
  if (!id) {
    id = 'u' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(KEY_ID, id);
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
  name: typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY_NAME),
  setName(name) {
    localStorage.setItem(KEY_NAME, name);
    set({ name });
  },
  clear() {
    localStorage.removeItem(KEY_NAME);
    set({ name: null });
  },
}));
