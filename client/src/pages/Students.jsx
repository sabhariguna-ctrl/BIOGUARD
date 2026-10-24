import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '../api/client.js';
import { Empty, Page, StatusChip, pct } from '../components/ui.jsx';

export default function Students() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState(null);
  const [attempts, setAttempts] = useState([]);
  useEffect(() => { api.get('/students').then((r) => setRows(r.data)); }, []);

  const list = useMemo(() => (rows || []).filter((s) => {
    const hit = `${s.name} ${s.email} ${s.rollNo || ''} ${s.department || ''}`.toLowerCase().includes(q.toLowerCase());
    const done = s.enrolled.face && s.enrolled.keystroke;
    return hit && (filter === 'all' || (filter === 'enrolled' ? done : !done));
  }), [rows, q, filter]);

  const open = async (s) => { setSel(s); setAttempts((await api.get(`/attempts?student=${s._id}`)).data); };
  const enrolled = (s) => (s.enrolled.face && s.enrolled.keystroke ? ['Enrolled', 'bg-good/15 text-good'] : s.enrolled.face || s.enrolled.keystroke ? ['Partly enrolled', 'bg-warn/15 text-warn'] : ['Not enrolled', 'bg-raised text-mute']);

  return (
    <Page title="Students" subtitle="Everyone who signed up or was invited as a student, with biometric enrollment and exam history. Open a student to see their attempts.">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1"><Search size={15} className="absolute left-3 top-3 text-mute" /><input className="input !pl-9" placeholder="Search name, email, roll number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" /></div>
        <div role="radiogroup" aria-label="Filter" className="inline-flex rounded-lg border border-line p-1">
          {[['all', 'All'], ['enrolled', 'Enrolled'], ['pending', 'Not enrolled']].map(([v, l]) => <button key={v} role="radio" aria-checked={filter === v} onClick={() => setFilter(v)} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${filter === v ? 'bg-face text-bg' : 'text-mute'}`}>{l}</button>)}
        </div>
        {rows && <span className="text-sm text-mute">{list.length} of {rows.length}</span>}
      </div>
      {rows === null ? null : rows.length === 0 ? <Empty title="No students yet" text="Students appear here after they sign up with their own email, or after you invite them from Invite people." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-line"><tr><th className="th">Student</th><th className="th">Enrollment</th><th className="th">Attempts</th><th className="th">Avg trust</th><th className="th">Flags</th><th className="th">Last login</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((s) => { const [label, cls] = enrolled(s); return (
                <tr key={s._id}>
                  <td className="td"><span className="font-medium">{s.name}</span><span className="block text-xs text-mute">{s.email}{s.rollNo ? ` | ${s.rollNo}` : ''}</span></td>
                  <td className="td"><span className={`chip ${cls}`}>{label}</span></td>
                  <td className="td tabular-nums">{s.attempts}{s.terminated > 0 && <span className="ml-1 text-xs text-bad">({s.terminated} ended)</span>}</td>
                  <td className={`td font-semibold tabular-nums ${s.avgTrust == null ? 'text-mute' : s.avgTrust >= 0.75 ? 'text-good' : s.avgTrust >= 0.55 ? 'text-warn' : 'text-bad'}`}>{pct(s.avgTrust)}</td>
                  <td className="td tabular-nums">{s.flags}</td>
                  <td className="td text-mute">{s.lastLogin ? new Date(s.lastLogin).toLocaleDateString() : 'never'}</td>
                  <td className="td text-right"><button className="btn-ghost !py-1" onClick={() => open(s)}>Details</button></td>
                </tr>); })}
            </tbody>
          </table>
          {list.length === 0 && <p className="py-8 text-center text-sm text-mute">No student matches your search.</p>}
        </div>
      )}
      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setSel(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-surface p-6 shadow-lift" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">{sel.name}</h2><p className="text-sm text-mute">{sel.email}</p>{sel.department && <p className="text-xs text-mute">{sel.department}</p>}</div><button className="btn-ghost !px-2" onClick={() => setSel(null)} aria-label="Close"><X size={16} /></button></div>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Exam attempts</h3>
            {attempts.length === 0 ? <p className="text-sm text-mute">No attempts yet.</p> : (
              <ul className="space-y-2">{attempts.map((a) => (
                <li key={a._id} className="panel flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium">{a.exam?.title}</span><span className="text-xs text-mute">{a.score != null ? `Score ${a.score}/${a.total}` : 'In progress'} | Trust {pct(a.trust)} | {a.flags?.length || 0} flags</span></span>
                  <StatusChip status={a.status} />
                </li>))}</ul>
            )}
          </aside>
        </div>
      )}
    </Page>
  );
}
