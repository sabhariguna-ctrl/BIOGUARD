import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client.js';
import { useAuth } from '../store/auth.js';
import { DecisionChip, Empty, Page, StatusChip, pct } from '../components/ui.jsx';
import { downloadBlob } from '../utils.js';

export default function Results() {
  const user = useAuth((s) => s.user);
  const [items, setItems] = useState(null);
  const [sel, setSel] = useState(null);
  const staff = user.role !== 'student';
  useEffect(() => { api.get('/attempts').then((r) => setItems(r.data)); }, []);
  const exportCsv = async () => { const r = await api.get('/attempts/export', { responseType: 'text' }); downloadBlob('bioguard-attempts.csv', r.data, 'text/csv'); };
  const open = async (id) => setSel((await api.get(`/attempts/${id}/timeline`)).data);

  const chart = sel?.events.map((e, k) => ({ n: k + 1, fused: +(e.fused * 100).toFixed(0), face: e.faceScore == null ? null : +(e.faceScore * 100).toFixed(0), keys: e.keyScore == null ? null : +(e.keyScore * 100).toFixed(0) }));
  return (
    <Page actions={staff && <button className="btn-ghost" onClick={exportCsv}><Download size={15} />Export CSV</button>} title="Attempts" subtitle={staff ? 'Every attempt with its trust score. Open one to see each identity check.' : 'Your exam results and how confident the system was that it was you.'}>
      {items === null ? null : items.length === 0 ? <Empty title="No attempts yet" text="Attempts appear here once an exam is started." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-line"><tr>{staff && <th className="th">Student</th>}<th className="th">Exam</th><th className="th">Score</th><th className="th">Trust</th><th className="th">Flags</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">
              {items.map((a) => (
                <tr key={a._id}>
                  {staff && <td className="td">{a.student?.name}<div className="text-xs text-mute">{a.student?.rollNo}</div></td>}
                  <td className="td">{a.exam?.title}</td>
                  <td className="td tabular-nums">{a.score != null ? `${a.score}/${a.total}` : '--'}</td>
                  <td className={`td font-semibold tabular-nums ${a.trust >= 0.75 ? 'text-good' : a.trust >= 0.55 ? 'text-warn' : 'text-bad'}`}>{pct(a.trust)}</td>
                  <td className="td tabular-nums">{a.flags?.length || 0}</td>
                  <td className="td"><StatusChip status={a.status} /></td>
                  <td className="td text-right"><button className="btn-ghost !py-1" onClick={() => open(a._id)}>Details</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setSel(null)}>
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-surface p-6 shadow-lift" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">{sel.attempt.exam.title}</h2><p className="text-sm text-mute">{sel.attempt.student.name}</p></div><button className="btn-ghost !px-2" onClick={() => setSel(null)} aria-label="Close"><X size={16} /></button></div>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Scores across identity checks</h3>
            {chart.length === 0 ? <p className="text-sm text-mute">No checks were recorded.</p> : (
              <div className="h-60"><ResponsiveContainer><LineChart data={chart}><CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" /><XAxis dataKey="n" stroke="rgb(var(--mute))" fontSize={12} /><YAxis domain={[0, 100]} stroke="rgb(var(--mute))" fontSize={12} /><Tooltip contentStyle={{ background: 'rgb(var(--raised))', border: '1px solid rgb(var(--line))', borderRadius: 8 }} /><Legend />
                <Line type="monotone" dataKey="fused" stroke="rgb(var(--ink))" strokeWidth={2.5} dot={false} name="Fused" /><Line type="monotone" dataKey="face" stroke="rgb(var(--face))" dot={false} name="Face" connectNulls /><Line type="monotone" dataKey="keys" stroke="rgb(var(--keys))" dot={false} name="Typing" connectNulls /></LineChart></ResponsiveContainer></div>
            )}
            <h3 className="mb-2 mt-6 text-sm font-semibold">Checks</h3>
            <ul className="space-y-1.5 text-sm">{sel.events.map((e, k) => <li key={k} className="flex items-center justify-between rounded-lg bg-raised px-3 py-2"><span className="text-mute">{new Date(e.createdAt).toLocaleTimeString()}</span><span className="tabular-nums">{pct(e.fused)}</span><DecisionChip decision={e.decision} /></li>)}</ul>
            {sel.attempt.flags.length > 0 && (<><h3 className="mb-2 mt-6 text-sm font-semibold">Flags</h3><ul className="space-y-1.5 text-sm">{sel.attempt.flags.map((f, k) => <li key={k} className="flex justify-between rounded-lg bg-bad/10 px-3 py-2"><span className="font-medium text-bad">{f.type.replaceAll('_', ' ')}</span><span className="text-mute">{new Date(f.at).toLocaleTimeString()}</span></li>)}</ul></>)}
          </aside>
        </div>
      )}
    </Page>
  );
}
