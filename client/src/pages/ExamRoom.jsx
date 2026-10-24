import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Megaphone, ShieldAlert, Timer, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useFace } from '../hooks/useFace.js';
import { useKeystroke } from '../hooks/useKeystroke.js';
import { useSocket } from '../hooks/useSocket.js';
import WebcamPanel from '../components/WebcamPanel.jsx';
import TrustRing from '../components/TrustRing.jsx';
import Explain from '../components/Explain.jsx';
import { DecisionChip } from '../components/ui.jsx';
import { seededOrder } from '../utils.js';

const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export default function ExamRoom() {
  const { state } = useLocation();
  const nav = useNavigate();
  const face = useFace();
  const ks = useKeystroke({ max: 80 });
  const exam = state?.exam;
  const attemptId = state?.attempt?._id;
  const order = useMemo(() => (exam ? seededOrder(exam.questions.length, attemptId, exam.shuffle !== false) : []), [exam, attemptId]);
  const [i, setI] = useState(0); // position on screen; order[i] is the real question index
  const [answers, setAnswers] = useState(() => (exam ? exam.questions.map((_, k) => state.attempt.answers?.[k] ?? -1) : []));
  const [left, setLeft] = useState(0);
  const [live, setLive] = useState({ face: null, keys: null, fused: null, trust: state?.attempt?.trust ?? 1, explain: [] });
  const [log, setLog] = useState([]);
  const [status, setStatus] = useState('active');
  const [endedBy, setEndedBy] = useState(null);
  const [warning, setWarning] = useState(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const busy = useRef(false);
  const done = useRef(false);

  useSocket({
    'proctor:warn': (m) => setWarning(m),
    'attempt:terminated': (m) => { done.current = true; setEndedBy(m.by); setStatus('terminated'); face.stop(); },
  });

  const submit = useCallback(async (auto = false) => {
    if (done.current) return;
    done.current = true;
    try {
      const { data } = await api.post(`/attempts/${attemptId}/submit`, { answers: answersRef.current });
      document.fullscreenElement && document.exitFullscreen().catch(() => {});
      face.stop();
      toast.success(`${auto ? 'Time is up. ' : ''}Submitted: ${data.score} of ${data.total} correct`);
      nav('/results', { replace: true });
    } catch (e) { done.current = false; toast.error(e.friendly); }
  }, [attemptId]); // eslint-disable-line

  const flag = useCallback((type) => { if (!done.current) api.post(`/attempts/${attemptId}/flag`, { type }).then((r) => setLive((l) => ({ ...l, trust: r.data.trust }))).catch(() => {}); }, [attemptId]);

  // camera + fullscreen + tab-switch monitoring
  useEffect(() => {
    if (!exam) return;
    face.start();
    document.documentElement.requestFullscreen?.().catch(() => {});
    const vis = () => document.hidden && flag('tab_switch');
    const fs = () => !document.fullscreenElement && flag('fullscreen_exit');
    document.addEventListener('visibilitychange', vis);
    document.addEventListener('fullscreenchange', fs);
    return () => { document.removeEventListener('visibilitychange', vis); document.removeEventListener('fullscreenchange', fs); };
  }, []); // eslint-disable-line

  // countdown + auto-submit
  useEffect(() => {
    if (!state?.deadline) return;
    const end = new Date(state.deadline).getTime();
    const t = setInterval(() => { const l = end - Date.now(); setLeft(l); if (l <= 0) { clearInterval(t); submit(true); } }, 500);
    return () => clearInterval(t);
  }, [state?.deadline, submit]);

  // continuous authentication heartbeat
  useEffect(() => {
    if (!exam || face.state !== 'ready') return;
    const beat = async () => {
      if (busy.current || done.current) return;
      busy.current = true;
      try {
        const r = await face.detect(true);
        const events = ks.take();
        const body = r ? { descriptor: r.descriptor, quality: r.quality } : { noFace: true };
        if (events.length >= 8) body.keystroke = { events };
        const { data } = await api.post(`/attempts/${attemptId}/verify`, body);
        setLive({ face: data.faceScore, keys: data.keyScore, fused: data.fused, trust: data.trust, explain: data.explain || [] });
        setLog((l) => [{ t: new Date(), d: data.decision, f: data.fused }, ...l].slice(0, 6));
        if (data.status === 'terminated') { done.current = true; setStatus('terminated'); face.stop(); }
      } catch (e) { /* transient errors are ignored; the server keeps its own record */ } finally { busy.current = false; }
    };
    const first = setTimeout(beat, 4000);
    const t = setInterval(beat, (exam.heartbeatSec || 45) * 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [face.state]); // eslint-disable-line

  if (!exam) return <Navigate to="/exams" replace />;
  const qi = order[i];
  const q = exam.questions[qi];
  const choose = (k) => setAnswers((a) => { const n = [...a]; n[qi] = k; return n; });

  return (
    <div className="flex min-h-full flex-col bg-bg">
      {warning && (
        <div className="flex items-start gap-3 border-b border-warn/40 bg-warn/15 px-4 py-3 text-sm text-warn" role="alert">
          <Megaphone size={18} className="mt-0.5 shrink-0" />
          <p className="flex-1"><b>Message from {warning.by}:</b> {warning.message}</p>
          <button onClick={() => setWarning(null)} aria-label="Dismiss message"><X size={16} /></button>
        </div>
      )}
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <div><h1 className="text-lg font-bold">{exam.title}</h1><p className="text-xs text-mute">Identity is checked in the background. Stay in the frame and keep this tab open.</p></div>
        <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-display text-lg font-bold tabular-nums ${left < 120000 ? 'bg-bad/15 text-bad' : 'bg-raised'}`}><Timer size={18} />{mmss(left)}</div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-4 lg:grid-cols-[1fr_20rem]">
        <main className="space-y-4">
          <div className="card p-6">
            <p className="text-sm text-mute">Question {i + 1} of {exam.questions.length}</p>
            <h2 className="mt-1 text-xl font-bold">{q.text}</h2>
            <div className="mt-5 space-y-2.5" role="radiogroup" aria-label="Answer options">
              {q.options.map((o, k) => (
                <button key={k} role="radio" aria-checked={answers[qi] === k} onClick={() => choose(k)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${answers[qi] === k ? 'border-face bg-face/10' : 'border-line hover:bg-raised'}`}>
                  <span className={`grid h-6 w-6 place-items-center rounded-full border text-xs font-bold ${answers[qi] === k ? 'border-face bg-face text-bg' : 'border-line text-mute'}`}>{String.fromCharCode(65 + k)}</span>{o}
                </button>
              ))}
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button className="btn-ghost" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft size={16} />Previous</button>
              <div className="hidden gap-1.5 sm:flex">{order.map((real, k) => <button key={k} onClick={() => setI(k)} aria-label={`Go to question ${k + 1}`} className={`h-8 w-8 rounded-lg text-xs font-semibold ${k === i ? 'bg-face text-bg' : answers[real] >= 0 ? 'bg-face/20 text-face' : 'bg-raised text-mute'}`}>{k + 1}</button>)}</div>
              {i < exam.questions.length - 1 ? <button className="btn-primary" onClick={() => setI(i + 1)}>Next<ChevronRight size={16} /></button> : <button className="btn-primary" onClick={() => confirm('Submit your exam now?') && submit()}>Submit exam</button>}
            </div>
          </div>
          <div className="card p-5">
            <label className="label" htmlFor="rough">Rough work</label>
            <textarea id="rough" rows={4} className="input" placeholder="Type your working here. Your typing rhythm helps confirm it is still you." onKeyDown={ks.onKeyDown} onKeyUp={ks.onKeyUp} onPaste={() => flag('paste')} />
          </div>
        </main>

        <aside className="space-y-4">
          <WebcamPanel face={face} />
          <div className="card flex flex-col items-center p-5">
            <TrustRing size={170} face={live.face} keys={live.keys} fused={live.fused} label="latest check" />
            <p className="mt-3 text-sm text-mute">Session trust <span className="font-semibold text-ink">{Math.round(live.trust * 100)}%</span></p>
            <Explain items={live.explain} title="Last check" />
          </div>
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-semibold">Recent checks</h3>
            {log.length === 0 ? <p className="text-xs text-mute">First check runs in a few seconds.</p> : (
              <ul className="space-y-1.5">{log.map((l, k) => <li key={k} className="flex items-center justify-between text-xs"><span className="text-mute">{l.t.toLocaleTimeString()}</span><DecisionChip decision={l.d} /></li>)}</ul>
            )}
          </div>
        </aside>
      </div>

      {status === 'terminated' && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6">
          <div className="card max-w-md p-8 text-center">
            <ShieldAlert className="mx-auto text-bad" size={40} />
            <h2 className="mt-3 text-2xl font-bold">Exam ended</h2>
            <p className="mt-2 text-sm text-mute">{endedBy ? `${endedBy} ended this attempt.` : 'Several identity checks in a row did not match, so this attempt was closed and flagged for your faculty to review.'}</p>
            <button className="btn-primary mt-5" onClick={() => nav('/results', { replace: true })}>Back to attempts</button>
          </div>
        </div>
      )}
    </div>
  );
}
