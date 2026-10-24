import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useAuth } from '../store/auth.js';
import { useFace } from '../hooks/useFace.js';
import WebcamPanel from '../components/WebcamPanel.jsx';
import TypingChallenge from '../components/TypingChallenge.jsx';
import RhythmChart from '../components/RhythmChart.jsx';
import { Page } from '../components/ui.jsx';
import { PHRASE } from '../constants.js';

const POSES = ['Look straight at the camera', 'Tilt your head slightly left', 'Tilt your head slightly right', 'Look straight and smile', 'Look straight, relaxed'];
const SAMPLES = 6;

function guideFor(r) {
  if (!r) return { ok: false, text: 'No face found. Sit in front of the camera.' };
  const q = r.quality;
  if (q.brightness < 0.22) return { ok: false, text: 'Too dark. Face a window or turn on a light.' };
  if (q.brightness > 0.8) return { ok: false, text: 'Too bright. Move away from the strong light behind or in front of you.' };
  if (q.faceRatio < 0.18) return { ok: false, text: 'Move closer to the camera.' };
  if (q.faceRatio > 0.6) return { ok: false, text: 'Move back a little.' };
  return { ok: true, text: 'Good lighting and distance. Hold still and capture.' };
}

export default function Enroll() {
  const refresh = useAuth((s) => s.refresh);
  const face = useFace();
  const [descs, setDescs] = useState([]);
  const [typed, setTyped] = useState([]);
  const [lastSample, setLastSample] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [guide, setGuide] = useState(null);
  const busyRef = useRef(false);
  busyRef.current = busy;

  const load = () => api.get('/biometric/status').then((r) => setStatus(r.data));
  useEffect(() => { load(); }, []);

  // live capture guide: tells the user what to fix before pressing capture
  useEffect(() => {
    if (face.state !== 'ready' || descs.length >= 5) return;
    let alive = true;
    const t = setInterval(async () => {
      if (!alive || busyRef.current) return;
      const r = await face.detect(false).catch(() => null);
      if (alive && !busyRef.current) setGuide(guideFor(r));
    }, 700);
    return () => { alive = false; clearInterval(t); };
  }, [face.state, descs.length]); // eslint-disable-line

  const grab = async () => {
    setBusy(true);
    const r = await face.captureFrontal(4000);
    setBusy(false);
    if (!r) return toast.error('No face found. Move closer and add light.');
    setDescs((d) => [...d, r.descriptor]);
  };
  const saveFace = async () => {
    try { await api.post('/biometric/enroll/face', { descriptors: descs }); toast.success('Face template saved'); setDescs([]); face.stop(); await load(); refresh(); }
    catch (e) { toast.error(e.friendly); }
  };
  const saveKeys = async (samples) => {
    try { await api.post('/biometric/enroll/keystroke', { phrase: PHRASE, samples }); toast.success('Typing template saved'); setTyped([]); await load(); refresh(); }
    catch (e) { toast.error(e.friendly); setTyped([]); }
  };
  const addSample = (ev) => { setLastSample(ev); const next = [...typed, ev]; setTyped(next); if (next.length >= SAMPLES) saveKeys(next); };
  const erase = async () => {
    if (!confirm('Delete your stored biometric templates? You will need to enroll again before taking exams.')) return;
    await api.delete('/biometric'); toast.success('Templates erased'); load(); refresh();
  };

  return (
    <Page title="Biometric enrollment" subtitle="We store two compact number templates, never your photos or what you type. You can erase them at any time." actions={status && (status.faceSamples || status.keystrokeSamples) ? <button className="btn-danger" onClick={erase}><Trash2 size={15} />Erase my templates</button> : null}>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">1. Face</h2>
            {status?.faceSamples >= 3 && <span className="chip bg-good/15 text-good"><CheckCircle2 size={13} />{status.faceSamples} samples saved</span>}
          </div>
          <WebcamPanel face={face} overlay={descs.length < 5 ? POSES[descs.length] : 'All poses captured'} />
          {face.state === 'ready' && descs.length < 5 && guide && (
            <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${guide.ok ? 'bg-good/10 text-good' : 'bg-warn/10 text-warn'}`} aria-live="polite">{guide.text}</p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <button className="btn-primary" disabled={face.state !== 'ready' || busy || descs.length >= 5} onClick={grab}><Camera size={16} />{busy ? 'Capturing...' : `Capture pose ${Math.min(descs.length + 1, 5)} of 5`}</button>
            <button className="btn-ghost" disabled={descs.length < 3} onClick={saveFace}>Save face template</button>
          </div>
          <div className="mt-3 flex gap-1.5" aria-label="Capture progress">{Array.from({ length: 5 }).map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < descs.length ? 'bg-face' : 'bg-line'}`} />)}</div>
        </section>

        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">2. Typing rhythm</h2>
            {status?.keystrokeSamples >= 5 && <span className="chip bg-good/15 text-good"><CheckCircle2 size={13} />{status.keystrokeSamples} samples saved</span>}
          </div>
          <p className="mb-4 text-sm text-mute">Type the phrase {SAMPLES} times at your natural pace. If you make a mistake, it restarts automatically.</p>
          <TypingChallenge phrase={PHRASE} onComplete={addSample} />
          <div className="mt-1 flex items-center justify-between text-sm"><span className="text-mute">Sample {Math.min(typed.length + 1, SAMPLES)} of {SAMPLES}</span></div>
          <div className="mt-2 flex gap-1.5">{Array.from({ length: SAMPLES }).map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < typed.length ? 'bg-keys' : 'bg-line'}`} />)}</div>
          {lastSample && (
            <div className="mt-5">
              <p className="mb-1 text-sm font-semibold">Your rhythm fingerprint</p>
              <p className="mb-2 text-xs text-mute">Bars show how long you held each key. The line shows the pause before the next key. This pattern is what we compare later.</p>
              <RhythmChart events={lastSample} />
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}
