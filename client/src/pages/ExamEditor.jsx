import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { Page } from '../components/ui.jsx';
import { toLocalInput } from '../utils.js';

const blankQ = () => ({ text: '', options: ['', '', '', ''], answerIndex: 0 });

export default function ExamEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [e, setE] = useState({ title: '', description: '', durationMin: 30, heartbeatSec: 45, acceptThreshold: 0.75, stepUpThreshold: 0.55, published: true, shuffle: true, startsAt: '', endsAt: '', questions: [blankQ()] });
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (id) api.get(`/exams/${id}`).then((r) => setE({ ...r.data, startsAt: toLocalInput(r.data.startsAt), endsAt: toLocalInput(r.data.endsAt) })); }, [id]);
  const set = (k, v) => setE((s) => ({ ...s, [k]: v }));
  const setQ = (i, patch) => setE((s) => ({ ...s, questions: s.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));

  const save = async (ev) => {
    ev.preventDefault(); setBusy(true);
    const body = { ...e, startsAt: e.startsAt ? new Date(e.startsAt).toISOString() : null, endsAt: e.endsAt ? new Date(e.endsAt).toISOString() : null, durationMin: +e.durationMin, heartbeatSec: +e.heartbeatSec, acceptThreshold: +e.acceptThreshold, stepUpThreshold: +e.stepUpThreshold,
      questions: e.questions.map(({ text, options, answerIndex }) => ({ text, options: options.filter((o) => o.trim()), answerIndex })) };
    try {
      id ? await api.put(`/exams/${id}`, body) : await api.post('/exams', body);
      toast.success('Exam saved'); nav('/exams');
    } catch (err) { toast.error(err.friendly); } finally { setBusy(false); }
  };

  return (
    <Page title={id ? 'Edit exam' : 'New exam'}>
      <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <div className="card space-y-4 p-5">
            <div><label className="label" htmlFor="t">Title</label><input id="t" className="input" required value={e.title} onChange={(x) => set('title', x.target.value)} /></div>
            <div><label className="label" htmlFor="d">Description</label><textarea id="d" className="input" rows={2} value={e.description} onChange={(x) => set('description', x.target.value)} /></div>
          </div>
          {e.questions.map((q, i) => (
            <div key={i} className="card space-y-3 p-5">
              <div className="flex items-center justify-between"><h3 className="font-semibold">Question {i + 1}</h3>
                {e.questions.length > 1 && <button type="button" className="btn-danger !py-1" onClick={() => set('questions', e.questions.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}</div>
              <input className="input" required placeholder="Question text" value={q.text} onChange={(x) => setQ(i, { text: x.target.value })} aria-label={`Question ${i + 1} text`} />
              {q.options.map((o, k) => (
                <div key={k} className="flex items-center gap-2">
                  <input type="radio" name={`c${i}`} checked={q.answerIndex === k} onChange={() => setQ(i, { answerIndex: k })} aria-label={`Option ${k + 1} is correct`} className="accent-[rgb(var(--face))]" />
                  <input className="input" placeholder={`Option ${k + 1}`} value={o} onChange={(x) => setQ(i, { options: q.options.map((oo, kk) => (kk === k ? x.target.value : oo)) })} />
                </div>
              ))}
              <p className="text-xs text-mute">Select the radio button next to the correct option.</p>
            </div>
          ))}
          <button type="button" className="btn-ghost" onClick={() => set('questions', [...e.questions, blankQ()])}><Plus size={16} />Add question</button>
        </div>
        <aside className="card h-fit space-y-4 p-5">
          <h3 className="font-bold">Exam and security settings</h3>
          {[['durationMin', 'Duration (minutes)', 1, 300, 1], ['heartbeatSec', 'Identity check every (seconds)', 15, 300, 5], ['acceptThreshold', 'Accept at fused score of', 0.4, 0.99, 0.01], ['stepUpThreshold', 'Ask for extra proof below', 0.2, 0.9, 0.01]].map(([k, l, min, max, step]) => (
            <div key={k}><label className="label" htmlFor={k}>{l}</label><input id={k} type="number" className="input" min={min} max={max} step={step} value={e[k]} onChange={(x) => set(k, x.target.value)} /></div>
          ))}
          <p className="text-xs text-mute">Below the extra-proof score the attempt counts as a failed check. Three failed checks in a row end the exam.</p>
          <div><label className="label" htmlFor="sa">Opens at (optional)</label><input id="sa" type="datetime-local" className="input" value={e.startsAt || ''} onChange={(x) => set('startsAt', x.target.value)} /></div>
          <div><label className="label" htmlFor="ea">Closes at (optional)</label><input id="ea" type="datetime-local" className="input" value={e.endsAt || ''} onChange={(x) => set('endsAt', x.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={e.shuffle !== false} onChange={(x) => set('shuffle', x.target.checked)} className="accent-[rgb(var(--face))]" />Shuffle question order per student</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={e.published} onChange={(x) => set('published', x.target.checked)} className="accent-[rgb(var(--face))]" />Visible to students</label>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving...' : 'Save exam'}</button>
        </aside>
      </form>
    </Page>
  );
}
