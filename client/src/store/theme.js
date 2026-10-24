import { create } from 'zustand';
const initial = localStorage.getItem('bg_theme') || 'dark';
document.documentElement.classList.toggle('dark', initial === 'dark');
export const useTheme = create((set, get) => ({
  theme: initial,
  toggle: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('bg_theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    set({ theme: next });
  },
}));
