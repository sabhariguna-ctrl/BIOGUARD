import { create } from 'zustand';
import { api } from '../api/client.js';

export const useNotes = create((set) => ({
  items: [], unread: 0,
  load: async () => { try { const { data } = await api.get('/notifications'); set({ items: data.items, unread: data.unread }); } catch { /* ignore */ } },
  push: (n) => set((s) => ({ items: [n, ...s.items].slice(0, 30), unread: s.unread + 1 })),
  readAll: async () => { await api.post('/notifications/read-all').catch(() => {}); set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })), unread: 0 })); },
  readOne: async (id) => { await api.post(`/notifications/${id}/read`).catch(() => {}); set((s) => ({ items: s.items.map((i) => (i._id === id ? { ...i, read: true } : i)), unread: Math.max(0, s.unread - (s.items.find((i) => i._id === id && !i.read) ? 1 : 0)) })); },
}));
