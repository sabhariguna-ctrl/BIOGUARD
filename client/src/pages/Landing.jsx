import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Bell, FileClock, Fingerprint, Gauge, KeyRound, Laptop, Megaphone, Radio, ScanFace, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../store/auth.js';
import { useTheme } from '../store/theme.js';
import TrustRing from '../components/TrustRing.jsx';

const STEPS = [
  ['Enroll once', 'Capture five face poses and type a short phrase six times. Only numeric templates are stored, never photos or text.', Fingerprint],
  ['Verify to start', 'A random blink or head-turn proves a live person. Face and typing rhythm are fused into one trust score.', ScanFace],
  ['Stay verified', 'During the exam the system quietly re-checks. Repeated mismatches end the attempt and alert your faculty.', Radio],
];
const FEATURES = [
  [SlidersHorizontal, 'Quality-aware fusion', 'Dim camera? Typing counts for more. Two weak signals never pass.'],
  [ScanFace, 'Active liveness', 'Server-issued one-time blink and head-turn challenges stop photo and replay attacks.'],
  [Gauge, 'Explainable decisions', 'Every check says why it passed or needed an extra step, in plain language.'],
  [Laptop, 'Trusted devices', 'A sign-in from a new browser needs an emailed code, even with a matching face.'],
  [KeyRound, 'Flexible login', 'Password, emailed login code, forgot-password and email-verified sign-up.'],
  [Megaphone, 'Live proctoring', 'Warn a student or end an attempt in real time from the proctor dashboard.'],
  [FileClock, 'Tamper-evident audit', 'A SHA-256 hash chain records every decision. Verify integrity in one click.'],
  [Bell, 'Instant notifications', 'In-app alerts for new exams, warnings, new devices and security events.'],
];

export default function Landing() {
  const token = useAuth((s) => s.token);
  const { theme, toggle } = useTheme();
  const [demo, setDemo] = useState({ face: 0.93, keys: 0.81 });
  useEffect(() => {
    const states = [{ face: 0.93, keys: 0.81 }, { face: 0.62, keys: 0.88 }, { face: 0.78, keys: 0.3 }, { face: 0.18, keys: 0.27 }];
    let i = 0;
    const t = setInterval(() => setDemo(states[++i % states.length]), 3500);
    return () => clearInterval(t);
  }, []);
  if (token) return <Navigate to="/" replace />;

  return (
    <div className="min-h-full overflow-y-auto bg-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="13" fill="none" stroke="rgb(var(--face))" strokeWidth="3" /><circle cx="16" cy="16" r="6" fill="none" stroke="rgb(var(--keys))" strokeWidth="3" /></svg>
          <span className="font-display text-xl font-bold">BioGuard</span>
        </div>
        <nav className="flex items-center gap-2">
          <button className="btn-ghost" onClick={toggle} aria-label="Toggle theme">{theme === 'dark' ? 'Light' : 'Dark'}</button>
          <Link to="/login" className="btn-ghost">Log in</Link>
          <Link to="/login?view=register" className="btn-primary">Get started</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="chip bg-face/15 text-face"><ShieldCheck size={13} />Multimodal biometric authentication</p>
          <h1 className="mt-4 text-4xl font-bold leading-[1.05] sm:text-6xl">Prove it is really you. Twice.</h1>
          <p className="mt-5 max-w-xl text-lg text-mute">BioGuard fuses your face with your typing rhythm to keep online exams honest from the first question to the last, with liveness checks, continuous verification and a tamper-evident audit trail.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login?view=register" className="btn-primary !px-6 !py-3">Create a student account</Link>
            <Link to="/login" className="btn-ghost !px-6 !py-3">Log in</Link>
          </div>
        </div>
        <div className="card flex flex-col items-center p-8">
          <TrustRing size={240} face={demo.face} keys={demo.keys} fused={0.55 * demo.face + 0.45 * demo.keys} />
          <div className="mt-5 flex gap-6 text-sm"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-face" />Face {Math.round(demo.face * 100)}%</span><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-keys" />Typing {Math.round(demo.keys * 100)}%</span></div>
          <p className="mt-3 text-center text-xs text-mute">Live preview of how fusion reacts to different situations.</p>
        </div>
      </section>

      <section className="border-y border-line bg-surface py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-3xl font-bold">How it works</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {STEPS.map(([t, d, Icon], i) => (
              <div key={t} className="panel p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-face/15 text-face"><Icon size={20} /></span><span className="font-display text-sm text-mute">Step {i + 1}</span></div><h3 className="mt-4 text-xl font-bold">{t}</h3><p className="mt-2 text-sm text-mute">{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-3xl font-bold">Built for real exams</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([Icon, t, d]) => (
            <div key={t} className="card p-5"><Icon className="text-keys" size={22} /><h3 className="mt-3 font-bold">{t}</h3><p className="mt-1 text-sm text-mute">{d}</p></div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-mute">Built with React, Tailwind CSS, Node.js, Express, MongoDB, Socket.io and face-api.js.</p>
      </section>
    </div>
  );
}
