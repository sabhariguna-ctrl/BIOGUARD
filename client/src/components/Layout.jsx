import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Activity, BarChart3, BookOpenCheck, Command, Fingerprint, FlaskConical, GraduationCap, Settings as SettingsIcon, LayoutDashboard, LogOut, Menu, Moon, Radio, ScrollText, ShieldCheck, SlidersHorizontal, Sun, UserPlus, Users, X } from 'lucide-react';
import { useAuth } from '../store/auth.js';
import { useTheme } from '../store/theme.js';
import { useSocket } from '../hooks/useSocket.js';
import CommandPalette from './CommandPalette.jsx';
import NotificationBell from './NotificationBell.jsx';
import { useNotes } from '../store/notes.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'faculty', 'student'], end: true },
  { to: '/enroll', label: 'Biometric enrollment', icon: Fingerprint, roles: ['student', 'faculty', 'admin'] },
  { to: '/exams', label: 'Exams', icon: BookOpenCheck, roles: ['admin', 'faculty', 'student'] },
  { to: '/results', label: 'Attempts', icon: Activity, roles: ['admin', 'faculty', 'student'] },
  { to: '/students', label: 'Students', icon: GraduationCap, roles: ['admin', 'faculty'] },
  { to: '/proctor', label: 'Live proctoring', icon: Radio, roles: ['admin', 'faculty'] },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'faculty'] },
  { to: '/lab', label: 'Fusion lab', icon: SlidersHorizontal, roles: ['admin', 'faculty', 'student'] },
  { to: '/evaluate', label: 'Impostor test lab', icon: FlaskConical, roles: ['admin', 'faculty', 'student'] },
  { to: '/profile', label: 'My security', icon: ShieldCheck, roles: ['admin', 'faculty', 'student'] },
  { to: '/audit', label: 'Audit chain', icon: ScrollText, roles: ['admin'] },
  { to: '/invite', label: 'Invite people', icon: UserPlus, roles: ['admin', 'faculty'] },
  { to: '/users', label: 'Users', icon: Users, roles: ['admin'] },
  { to: '/settings', label: 'Email setup', icon: SettingsIcon, roles: ['admin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const staff = user.role !== 'student';
  const out = () => { logout(); nav('/login'); };

  // staff get an instant toast whenever a real identity check is rejected
  useSocket({
    notify: (n) => { if (/Teacher access (approved|declined)/.test(n.title)) useAuth.getState().refresh(); useNotes.getState().push(n); toast(`${n.title}${n.body ? `: ${n.body}` : ''}`, { id: String(n._id), icon: n.type === 'danger' ? '\u26A0\uFE0F' : n.type === 'warn' ? '\uD83D\uDD14' : '\u2705' }); },
    ...(staff ? { 'auth:event': (e) => { if (e.decision === 'REJECT' && e.mode !== 'test') toast.error(`Identity check rejected: ${e.user?.name}${e.reason ? ` (${e.reason.replaceAll('_', ' ')})` : ''}`, { id: String(e.id) }); } } : {}),
  });

  const Side = (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-4">
      <div className="mb-5 flex items-center justify-between gap-2.5 px-2">
        <div className="flex items-center gap-2.5">
          <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="13" fill="none" stroke="rgb(var(--face))" strokeWidth="3" /><circle cx="16" cy="16" r="6" fill="none" stroke="rgb(var(--keys))" strokeWidth="3" /></svg>
          <span className="font-display text-xl font-bold">BioGuard</span>
        </div>
        <NotificationBell />
      </div>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-face/15 text-face' : 'text-mute hover:bg-raised hover:text-ink'}`}>
          <Icon size={18} />{label}
        </NavLink>
      ))}
      <div className="mt-auto space-y-2 border-t border-line pt-4">
        <p className="flex items-center gap-1.5 px-2 text-xs text-mute"><Command size={12} />Press Ctrl+K to jump anywhere</p>
        <div className="px-2">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="text-xs capitalize text-mute">{user.role}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={toggle} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className="btn-ghost flex-1" onClick={out} aria-label="Log out"><LogOut size={16} /></button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full">
      <CommandPalette items={items} onToggleTheme={toggle} onLogout={out} />
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface lg:block">{Side}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-lift">{Side}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
          <span className="font-display text-lg font-bold">BioGuard</span>
          <button className="btn-ghost px-2.5" onClick={() => setOpen(!open)} aria-label="Open menu">{open ? <X size={18} /> : <Menu size={18} />}</button>
        </header>
        <main className="flex-1 overflow-y-auto"><Outlet /></main>
      </div>
    </div>
  );
}
