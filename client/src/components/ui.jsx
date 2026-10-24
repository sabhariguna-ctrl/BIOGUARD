import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';

export const pct = (x) => (x == null ? '--' : `${Math.round(x * 100)}%`);

export function DecisionChip({ decision }) {
  const map = {
    ACCEPT: ['bg-good/15 text-good', CheckCircle2, 'Accepted'],
    STEP_UP: ['bg-warn/15 text-warn', ShieldAlert, 'Extra check'],
    REJECT: ['bg-bad/15 text-bad', XCircle, 'Rejected'],
  };
  const [cls, Icon, text] = map[decision] || ['bg-raised text-mute', ShieldAlert, decision || 'n/a'];
  return <span className={`chip ${cls}`}><Icon size={13} />{text}</span>;
}

export function StatusChip({ status }) {
  const cls = { active: 'bg-face/15 text-face', submitted: 'bg-good/15 text-good', terminated: 'bg-bad/15 text-bad' }[status] || 'bg-raised text-mute';
  return <span className={`chip ${cls}`}>{status}</span>;
}

export function Stat({ icon: Icon, label, value, hint, tone = 'text-face' }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-mute">{label}</span>
        {Icon && <Icon size={18} className={tone} />}
      </div>
      <div className="mt-2 font-display text-3xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-mute">{hint}</div>}
    </div>
  );
}

export function Page({ title, subtitle, actions, children }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-mute">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export const Empty = ({ title, text, action }) => (
  <div className="card flex flex-col items-center px-6 py-14 text-center">
    <h3 className="text-lg font-semibold">{title}</h3>
    <p className="mt-1 max-w-sm text-sm text-mute">{text}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Spinner = () => <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-face" role="status" aria-label="Loading" />;
