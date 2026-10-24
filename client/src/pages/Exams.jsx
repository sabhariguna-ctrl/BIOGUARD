import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, HelpCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useAuth } from '../store/auth.js';
import VerifyFlow from '../components/VerifyFlow.jsx';
import { Empty, Page, StatusChip } from '../components/ui.jsx';
import { PHRASE } from '../constants.js';

export default function Exams() {
  const user = useAuth((s) => s.user);
  const nav = useNavigate();
  const [exams, setExams] = useState(null);
  const [verifying, setVerifying] = useState(null);
  const [bio, setBio] = useState(null);
  const staff = user.role !== 'student';

  const load = () => api.get('/exams').then((r) => setExams(r.data)).catch((e) => toast.error(e.friendly));
  useEffect(() => { load(); api.get('/biometric/status').then((r) => setBio(r.data)); }, []);

  const begin = (exam) => {
    if (!bio?.enrolled) return toast.error('Finish biometric enrollment first');
    setVerifying(exam);
  };
  const onPass = async (passToken) => {
    try {
      const { data } = await api.post(`/exams/${verifying._id}/start`, { passToken });
      nav(`/exam/${verifying._id}`, { state: data });
    } catch (e) { toast.error(e.friendly); setVerifying(null); }
  };
  const remove = async (id) => { if (confirm('Delete this exam and all attempts?')) { await api.delete(`/exams/${id}`); load(); } };

  return (
    <Page title="Exams" subtitle={staff ? 'Create exams and tune how strict the identity checks are.' : 'You verify your identity before an exam starts, and again quietly while it runs.'}
      actions={staff && <Link className="btn-primary" to="/exams/new"><Plus size={16} />New exam</Link>}>
      {!staff && bio && !bio.enrolled && (
        <div className="mb-5 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">You have not finished enrollment. <Link to="/enroll" className="font-semibold underline">Enroll now</Link> to unlock exams.</div>
      )}
      {exams === null ? null : exams.length === 0 ? <Empty title="No exams yet" text={staff ? 'Create your first exam to start collecting verified attempts.' : 'Your faculty has not published an exam yet.'} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {exams.map((e) => (
            <article key={e._id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold">{e.title}</h2>
                {e.attempt && <StatusChip status={e.attempt.status} />}
              </div>
              <p className="mt-1 flex-1 text-sm text-mute">{e.description || 'No description'}</p>
              <div className="mt-4 flex items-center gap-4 text-xs text-mute">
                <span className="flex items-center gap-1"><Clock size={14} />{e.durationMin} min</span>
                <span className="flex items-center gap-1"><HelpCircle size={14} />{e.questionCount} questions</span>
                <span>Check every {e.heartbeatSec}s</span>
                {e.startsAt && new Date(e.startsAt) > new Date() && <span className="chip bg-warn/15 text-warn">Opens {new Date(e.startsAt).toLocaleString()}</span>}
                {e.endsAt && <span>Closes {new Date(e.endsAt).toLocaleString()}</span>}
              </div>
              <div className="mt-4 flex items-center gap-2">
                {!staff && (!e.attempt || e.attempt.status === 'active') && <button className="btn-primary" disabled={!!e.startsAt && new Date(e.startsAt) > new Date()} onClick={() => begin(e)}>{e.attempt ? 'Resume exam' : 'Verify and start'}</button>}
                {!staff && e.attempt && e.attempt.status !== 'active' && <Link to="/results" className="btn-ghost">View result</Link>}
                {staff && <><Link className="btn-ghost" to={`/exams/${e._id}/edit`}><Pencil size={14} />Edit</Link><button className="btn-danger" onClick={() => remove(e._id)}><Trash2 size={14} />Delete</button></>}
              </div>
            </article>
          ))}
        </div>
      )}
      {verifying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="card max-h-[92vh] w-full max-w-4xl overflow-y-auto p-6">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{verifying.title}</h2><button className="btn-ghost !px-2" onClick={() => setVerifying(null)} aria-label="Close"><X size={16} /></button></div>
            <VerifyFlow phrase={bio?.phrase || PHRASE} mode="login" onPass={onPass} onCancel={() => setVerifying(null)} />
          </div>
        </div>
      )}
    </Page>
  );
}
