import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

const ICON = { good: [CheckCircle2, 'text-good'], warn: [AlertTriangle, 'text-warn'], bad: [XCircle, 'text-bad'] };

/** "Why this decision": plain-language reasons returned by the server. */
export default function Explain({ items = [], title = 'Why this decision' }) {
  if (!items.length) return null;
  return (
    <div className="panel mt-4 p-3 text-left">
      <p className="mb-2 text-xs font-semibold text-mute">{title}</p>
      <ul className="space-y-1.5 text-sm">
        {items.map((x, i) => { const [Icon, cls] = ICON[x.tone] || ICON.warn; return <li key={i} className="flex gap-2"><Icon size={15} className={`mt-0.5 shrink-0 ${cls}`} />{x.text}</li>; })}
      </ul>
    </div>
  );
}
