import { useEffect, useState } from 'react';
import { Megaphone, OctagonX, Radio } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useSocket } from '../hooks/useSocket.js';
import TrustRing from '../components/TrustRing.jsx';
import { DecisionChip, Empty, Page, pct } from '../components/ui.jsx';

export default function Proctor() {
  const [attempts, setAttempts] = useState({});
  const [feed, setFeed] = useState([]);

  useEffect(() => {
    api.get('/attempts?status=active').then((r) => setAttempts(Object.fromEntries(r.data.map((a) => [a._id, { id: a._id, exam: a.exam, student: a.student, status: a.status, trust: a.trust, flags: a.flags.length }]))));
    api.get('/analytics/events').then((r) => setFeed(r.data.map((e) => ({ id: e._id, user: { name: e.user?.name }, decision: e.decision, fused: e.fused, mode: e.mode, at: e.createdAt }))));
  }, []);

  const { connected } = useSocket({
    'attempt:update': (a) => setAttempts((s) => ({ ...s, [a.id]: { ...s[a.id], ...a } })),
    'auth:event': (e) => setFeed((f) => [e, ...f].slice(0, 40)),
  });
  const list = Object.values(attempts).filter((a) => a.status === 'active' || a.status === 'terminated');

  const warn = async (a) => {
    const message = prompt(`Message to ${a.student?.name} (shown on their screen):`, 'Please keep your face inside the frame.');
    if (!message) return;
    try { await api.post(`/attempts/${a.id}/warn`, { message }); toast.success('Warning sent'); } catch (e) { toast.error(e.friendly); }
  };
  const end = async (a) => {
    if (!confirm(`End ${a.student?.name}'s attempt now? This cannot be undone.`)) return;
    try { await api.post(`/attempts/${a.id}/terminate`); toast.success('Attempt ended'); } catch (e) { toast.error(e.friendly); }
  };

  return (
    <Page title="Live proctoring" subtitle="Students in exams right now. Trust updates the moment an identity check completes, and you can message or end an attempt."
      actions={<span className={`chip ${connected ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}><Radio size={13} />{connected ? 'Live' : 'Reconnecting'}</span>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section>
          {list.length === 0 ? <Empty title="No one is in an exam" text="When a student starts an exam, their trust score appears here in real time." /> : (
            <div className="grid gap-4 sm:grid-cols-2">
              {list.map((a) => (
                <div key={a.id} className={`card p-4 ${a.status === 'terminated' ? 'border-bad/50' : ''}`}>
                  <div className="flex items-center gap-4">
                    <TrustRing size={90} fused={a.trust} face={a.trust} keys={a.trust} label="trust" />
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-semibold">{a.student?.name}</p>
                      <p className="truncate text-xs text-mute">{a.exam?.title}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">{a.lastDecision && <DecisionChip decision={a.lastDecision} />}{a.flags > 0 && <span className="chip bg-bad/15 text-bad">{a.flags} flags</span>}</div>
                      {a.status === 'terminated' && <p className="mt-1 text-xs font-semibold text-bad">Attempt ended</p>}
                    </div>
                  </div>
                  {a.status === 'active' && (
                    <div className="mt-3 flex gap-2 border-t border-line pt-3">
                      <button className="btn-ghost flex-1 !py-1.5" onClick={() => warn(a)}><Megaphone size={14} />Warn</button>
                      <button className="btn-danger flex-1 !py-1.5" onClick={() => end(a)}><OctagonX size={14} />End attempt</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="card h-fit p-4">
          <h2 className="mb-3 font-bold">Identity check feed</h2>
          <ul className="max-h-[32rem] space-y-2 overflow-y-auto text-sm">
            {feed.map((e) => (
              <li key={e.id + e.at} className="flex items-center justify-between gap-2 rounded-lg bg-raised px-3 py-2">
                <div className="min-w-0"><p className="truncate font-medium">{e.user?.name}</p><p className="text-xs text-mute">{e.mode} at {new Date(e.at).toLocaleTimeString()}</p></div>
                <div className="flex items-center gap-2"><span className="tabular-nums text-mute">{pct(e.fused)}</span><DecisionChip decision={e.decision} /></div>
              </li>
            ))}
            {feed.length === 0 && <li className="py-6 text-center text-mute">No checks yet.</li>}
          </ul>
        </aside>
      </div>
    </Page>
  );
}
