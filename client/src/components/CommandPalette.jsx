import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

/** Ctrl+K quick navigation. */
export default function CommandPalette({ items, onToggleTheme, onLogout }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const nav = useNavigate();
  const input = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); setQ(''); setIdx(0); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); }, [open]);

  const cmds = useMemo(() => [
    ...items.map((i) => ({ label: `Go to ${i.label}`, run: () => nav(i.to) })),
    { label: 'Toggle dark or light theme', run: onToggleTheme },
    { label: 'Log out', run: onLogout },
  ], [items, nav, onToggleTheme, onLogout]);
  const list = cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  const run = (c) => { setOpen(false); c?.run(); };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="card w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-mute" />
          <input ref={input} className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-mute" placeholder="Jump to a page or run a command" value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter') run(list[idx]);
            }} />
        </div>
        <ul className="max-h-72 overflow-y-auto p-2">
          {list.map((c, i) => <li key={c.label}><button className={`w-full rounded-lg px-3 py-2 text-left text-sm ${i === idx ? 'bg-face/15 text-face' : 'hover:bg-raised'}`} onMouseEnter={() => setIdx(i)} onClick={() => run(c)}>{c.label}</button></li>)}
          {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-mute">Nothing matches "{q}"</li>}
        </ul>
      </div>
    </div>
  );
}
