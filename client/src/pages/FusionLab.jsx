import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import TrustRing from '../components/TrustRing.jsx';
import { DecisionChip, Page, pct } from '../components/ui.jsx';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const weightFor = (q) => clamp(0.5 * q + 0.2, 0.2, 0.7);
// same rule as server/src/services/fusion.js
function fuse({ face, keys, quality, live, accept, stepUp }) {
  let fused = 0, wFace = 0, wKey = 0;
  if (face != null && keys != null) { wFace = weightFor(quality); wKey = 1 - wFace; fused = wFace * face + wKey * keys; }
  else if (face != null) { wFace = 1; fused = face * 0.9; }
  else if (keys != null) { wKey = 1; fused = keys * 0.8; }
  fused = clamp(fused);
  const decision = !live ? 'REJECT' : fused >= accept ? 'ACCEPT' : fused >= stepUp ? 'STEP_UP' : 'REJECT';
  return { fused, wFace, wKey, decision };
}

const PRESETS = [
  { name: 'Genuine student', s: { face: 0.94, keys: 0.86, quality: 0.9, live: true }, note: 'Both signals agree, so the score is high.' },
  { name: 'Genuine, dim room', s: { face: 0.62, keys: 0.88, quality: 0.25, live: true }, note: 'Poor camera quality lowers the face weight, so typing keeps the genuine student in.' },
  { name: 'Photo held to camera', s: { face: 0.88, keys: 0.12, quality: 0.8, live: false }, note: 'The face matches, but the liveness action fails and typing is wrong. Rejected.' },
  { name: 'Look-alike or twin', s: { face: 0.78, keys: 0.3, quality: 0.85, live: true }, note: 'Face is close, typing is not. Borderline, so an extra check is required.' },
  { name: 'Someone else typing', s: { face: 0.2, keys: 0.7, quality: 0.8, live: true }, note: 'Copying typing speed is not enough when the face does not match.' },
];

const Slider = ({ label, value, onChange, off, onToggle, max = 1, step = 0.01 }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-sm"><label className="font-medium">{label}</label>
      <span className="flex items-center gap-3"><span className="tabular-nums text-mute">{off ? 'not available' : pct(value)}</span>
        {onToggle && <label className="flex items-center gap-1 text-xs text-mute"><input type="checkbox" checked={!off} onChange={(e) => onToggle(!e.target.checked)} className="accent-[rgb(var(--face))]" />use</label>}</span></div>
    <input type="range" min={0} max={max} step={step} value={value} disabled={off} onChange={(e) => onChange(+e.target.value)} className="w-full accent-[rgb(var(--face))] disabled:opacity-40" aria-label={label} />
  </div>
);

export default function FusionLab() {
  const [s, setS] = useState(PRESETS[0].s);
  const [noFace, setNoFace] = useState(false);
  const [noKeys, setNoKeys] = useState(false);
  const [accept, setAccept] = useState(0.75);
  const [stepUp, setStepUp] = useState(0.55);
  const [note, setNote] = useState(PRESETS[0].note);
  const r = fuse({ face: noFace ? null : s.face, keys: noKeys ? null : s.keys, quality: s.quality, live: s.live, accept, stepUp });
  const curve = Array.from({ length: 21 }, (_, i) => ({ q: i / 20, face: weightFor(i / 20), keys: 1 - weightFor(i / 20) }));

  return (
    <Page title="Fusion lab" subtitle="Play with the exact rule the server uses. Move the sliders or load a scenario and watch how the decision changes.">
      <div className="mb-5 flex flex-wrap gap-2">
        {PRESETS.map((p) => <button key={p.name} className="btn-ghost" onClick={() => { setS(p.s); setNoFace(false); setNoKeys(false); setNote(p.note); }}>{p.name}</button>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="card space-y-5 p-6">
          <Slider label="Face match score" value={s.face} onChange={(v) => setS({ ...s, face: v })} off={noFace} onToggle={setNoFace} />
          <Slider label="Typing rhythm score" value={s.keys} onChange={(v) => setS({ ...s, keys: v })} off={noKeys} onToggle={setNoKeys} />
          <Slider label="Camera quality (light, size, sharpness)" value={s.quality} onChange={(v) => setS({ ...s, quality: v })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.live} onChange={(e) => setS({ ...s, live: e.target.checked })} className="accent-[rgb(var(--face))]" />Liveness action completed (blink or head turn)</label>
          <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
            <Slider label="Accept threshold" value={accept} onChange={(v) => setAccept(Math.max(v, stepUp + 0.02))} />
            <Slider label="Extra-check threshold" value={stepUp} onChange={(v) => setStepUp(Math.min(v, accept - 0.02))} />
          </div>
          <p className="rounded-lg bg-raised p-3 text-sm text-mute"><b className="text-ink">Rule:</b> fused = wFace x face + wKey x typing, with wFace = clamp(0.5 x quality + 0.2, 0.2, 0.7). Missing a signal applies a penalty. Failed liveness always rejects.</p>
        </section>
        <aside className="card flex flex-col items-center p-6 text-center">
          <TrustRing size={200} face={noFace ? 0 : s.face} keys={noKeys ? 0 : s.keys} fused={r.fused} accept={accept} stepUp={stepUp} />
          <div className="mt-4"><DecisionChip decision={r.decision} /></div>
          <p className="mt-3 text-sm"><span className="text-face">Face weight</span> {pct(r.wFace)} <span className="mx-1 text-mute">|</span> <span className="text-keys">Typing weight</span> {pct(r.wKey)}</p>
          <p className="mt-3 text-sm text-mute">{note}</p>
        </aside>
        <section className="card p-6 lg:col-span-2">
          <h2 className="font-bold">How camera quality shifts the weights</h2>
          <p className="mb-3 text-sm text-mute">The dot marks your current quality. Better frames let the face count more; poor frames hand trust to typing.</p>
          <div className="h-56"><ResponsiveContainer><LineChart data={curve}><CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" /><XAxis dataKey="q" stroke="rgb(var(--mute))" fontSize={12} tickFormatter={(v) => `${Math.round(v * 100)}%`} /><YAxis stroke="rgb(var(--mute))" fontSize={12} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} />
            <Tooltip contentStyle={{ background: 'rgb(var(--raised))', border: '1px solid rgb(var(--line))', borderRadius: 8 }} formatter={(v) => pct(v)} labelFormatter={(v) => `Quality ${pct(v)}`} /><Legend />
            <Line dataKey="face" name="Face weight" stroke="rgb(var(--face))" strokeWidth={2.5} dot={false} /><Line dataKey="keys" name="Typing weight" stroke="rgb(var(--keys))" strokeWidth={2.5} dot={false} />
            <ReferenceDot x={Math.round(s.quality * 20) / 20} y={weightFor(Math.round(s.quality * 20) / 20)} r={6} fill="rgb(var(--ink))" stroke="none" /></LineChart></ResponsiveContainer></div>
        </section>
      </div>
    </Page>
  );
}
