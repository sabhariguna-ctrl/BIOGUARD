import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotes } from '../store/notes.js';

const DOT = { info: 'bg-face', success: 'bg-good', warn: 'bg-warn', danger: 'bg-bad' };
const ago = (d) => { const s = (Date.now() - new Date(d).getTime()) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(d).toLocaleDateString(); };

export default function NotificationBell() {
  const { items, unread, load, readAll, readOne } = useNotes();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <button className="btn-ghost relative !px-2.5 !py-2" onClick={() => setOpen(!open)} aria-label={`Notifications, ${unread} unread`} aria-expanded={open}>
        <Bell size={17} />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[65]" onClick={() => setOpen(false)} />
          <div className="card fixed left-4 top-16 z-[70] w-[min(22rem,calc(100vw-2rem))] overflow-hidden" role="dialog" aria-label="Notifications">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-bold">Notifications</h2>
              <button className="flex items-center gap-1 text-xs font-semibold text-face disabled:opacity-40" disabled={!unread} onClick={readAll}><CheckCheck size={14} />Mark all read</button>
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n._id}>
                  <button className={`flex w-full gap-3 border-b border-line px-4 py-3 text-left hover:bg-raised ${n.read ? 'opacity-70' : ''}`} onClick={() => { readOne(n._id); setOpen(false); if (n.link) nav(n.link); }}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-line' : DOT[n.type] || 'bg-face'}`} />
                    <span className="min-w-0"><span className="block text-sm font-semibold">{n.title}</span>{n.body && <span className="block truncate text-xs text-mute">{n.body}</span>}<span className="text-[11px] text-mute">{ago(n.createdAt)}</span></span>
                  </button>
                </li>
              ))}
              {items.length === 0 && <li className="px-4 py-10 text-center text-sm text-mute">You are all caught up.</li>}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
