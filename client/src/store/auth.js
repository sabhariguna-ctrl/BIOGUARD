import { create } from 'zustand';
import { api } from '../api/client.js';

const KEY = 'bg_auth';
const read = (store) => { try { const v = JSON.parse(store?.getItem(KEY)); return v?.token ? v : null; } catch { return null; } };
const ss = typeof sessionStorage === 'undefined' ? null : sessionStorage;
const ls = typeof localStorage === 'undefined' ? null : localStorage;

// "Keep me signed in" = localStorage (shared by every tab of this browser).
// Unticked = sessionStorage (this tab only, ends when the tab closes, never touches other tabs).
const tabSession = read(ss);
const saved = tabSession || read(ls) || {};

export const useAuth = create((set, get) => ({
  token: saved.token || null,
  user: saved.user || null,
  persist: !tabSession,
  setSession: (token, user, persist) => {
    const keep = persist ?? get().persist;
    const payload = JSON.stringify({ token, user });
    try {
      if (keep) { ls?.setItem(KEY, payload); ss?.removeItem(KEY); }
      else ss?.setItem(KEY, payload);
    } catch { /* storage unavailable */ }
    set({ token, user, persist: keep });
  },
  logout: () => {
    try { ss?.removeItem(KEY); if (get().persist) ls?.removeItem(KEY); } catch { /* ignore */ }
    set({ token: null, user: null });
  },
  refresh: async () => {
    if (!get().token) return;
    try { const { data } = await api.get('/auth/me'); get().setSession(get().token, data.user); } catch { /* handled by interceptor */ }
  },
}));
