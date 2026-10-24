import { useEffect, useState } from 'react';
import { Eye, Keyboard, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useFace } from '../hooks/useFace.js';
import WebcamPanel from './WebcamPanel.jsx';
import TypingChallenge from './TypingChallenge.jsx';
import TrustRing from './TrustRing.jsx';
import { DecisionChip, pct } from './ui.jsx';
import Explain from './Explain.jsx';

const CHALLENGE_TEXT = {
  blink: 'Blink twice slowly',
  turn_left: 'Turn your head to your left',
  turn_right: 'Turn your head to your right',
};

/**
 * Full multimodal verification: liveness challenge -> face capture -> typing phrase -> fused decision.
 * mode 'login' (needs liveness, returns passToken) or 'test' (labelled evaluation run).
 */
export default function VerifyFlow({ phrase, mode = 'login', label, onPass, onResult, onCancel }) {
  const face = useFace();
  const [step, setStep] = useState('intro'); // intro | liveness | face | typing | sending | result | otp
  const [chal, setChal] = useState(null);
  const [live, setLive] = useState(null);
  const [captured, setCaptured] = useState(null);
  const [result, setResult] = useState(null);
  const [otp, setOtp] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { if (face.state === 'idle') face.start(); }, []); // eslint-disable-line

  const begin = async () => {
    setMsg('');
    if (mode === 'test') { setStep('face'); return capture(null); }
    try {
      const { data } = await api.get('/biometric/challenge');
      setChal(data); setStep('liveness');
      const ok = await face.runChallenge(data.type, null, 12000);
      if (!ok) { setMsg('Liveness check failed. Make sure your face is well lit and try again.'); setStep('intro'); return; }
      setLive({ nonce: data.nonce, type: data.type, passed: true });
      await capture({ nonce: data.nonce, type: data.type, passed: true });
    } catch (e) { toast.error(e.friendly || e.message); setStep('intro'); }
  };

  const capture = async (liveness) => {
    setStep('face'); setMsg('Look straight at the camera');
    const r = await face.captureFrontal();
    if (!r) { setMsg('No face found. Move closer and add light.'); setStep('intro'); return; }
    setCaptured(r); setLive(liveness); setMsg(''); setStep('typing');
  };

  const submit = async (events) => {
    setStep('sending');
    try {
      const { data } = await api.post('/biometric/verify', {
        mode, label, descriptor: captured.descriptor, quality: captured.quality, liveness: live,
        keystroke: { phrase, events },
      });
      setResult(data); setStep('result'); onResult?.(data);
      if (data.decision === 'ACCEPT' && data.passToken) onPass?.(data.passToken);
    } catch (e) { toast.error(e.friendly); setStep('typing'); }
  };

  const submitOtp = async () => {
    try {
      const { data } = await api.post('/biometric/step-up', { otp });
      toast.success('Identity confirmed'); onPass?.(data.passToken);
    } catch (e) { toast.error(e.friendly); }
  };

  const reset = () => { setResult(null); setCaptured(null); setLive(null); setOtp(''); setStep('intro'); };

  const overlay = step === 'liveness' && chal ? CHALLENGE_TEXT[chal.type] : step === 'face' ? msg || 'Hold still...' : null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <WebcamPanel face={face} overlay={overlay} />
      <div className="flex flex-col justify-center">
        {step === 'intro' && (
          <>
            <h3 className="text-xl font-bold">Confirm it is you</h3>
            <p className="mt-1 text-sm text-mute">
              {mode === 'login' ? 'We will ask for one quick head movement, then a short typing phrase.' : 'This run is recorded as a labelled test sample.'}
            </p>
            {msg && <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn" role="alert">{msg}</p>}
            <div className="mt-5 flex gap-2">
              <button className="btn-primary" disabled={face.state !== 'ready'} onClick={begin}><Eye size={16} />Start verification</button>
              {onCancel && <button className="btn-ghost" onClick={onCancel}>Cancel</button>}
            </div>
          </>
        )}
        {(step === 'liveness' || step === 'face') && (
          <div>
            <p className="text-sm text-mute">{step === 'liveness' ? 'Liveness check' : 'Capturing face'}</p>
            <p className="mt-1 font-display text-2xl font-bold">{step === 'liveness' && chal ? CHALLENGE_TEXT[chal.type] : msg || 'Hold still'}</p>
          </div>
        )}
        {step === 'typing' && (
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm text-mute"><Keyboard size={16} />Face captured. Now type this phrase at your normal speed.</p>
            <TypingChallenge phrase={phrase} onComplete={submit} autoFocus />
          </div>
        )}
        {step === 'sending' && <p className="text-sm text-mute">Fusing face and typing scores...</p>}
        {step === 'result' && result && (
          <div className="text-center md:text-left">
            <div className="flex flex-col items-center gap-4 md:flex-row">
              <TrustRing size={150} face={result.faceScore} keys={result.keyScore} fused={result.fused} accept={result.thresholds.accept} stepUp={result.thresholds.stepUp} />
              <div className="space-y-1.5 text-sm">
                <DecisionChip decision={result.decision} />
                <p><span className="text-face">Face</span> {pct(result.faceScore)} (weight {pct(result.wFace)})</p>
                <p><span className="text-keys">Typing</span> {pct(result.keyScore)} (weight {pct(result.wKey)})</p>
              </div>
            </div>
            <Explain items={result.explain} />
            {result.adapted && <p className="mt-2 text-xs text-mute">Strong match: your templates were quietly refreshed to follow small changes over time.</p>}
            {result.decision === 'STEP_UP' && (
              <div className="mt-4">
                {result.otpError ? (
                  <p className="mb-2 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">The code could not be emailed: {result.otpError}</p>
                ) : (
                  <p className="mb-2 text-sm text-warn">{result.newDevice ? 'New device detected.' : 'Scores were borderline.'} {result.devCode ? 'Email is not set up on this server yet, so your code is shown below.' : 'Enter the 6-digit code we just emailed you.'}</p>
                )}
                {result.devCode && (
                  <div className="mb-2 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
                    <span>Dev code: <b className="tracking-[0.3em]">{result.devCode}</b></span>
                    <button className="font-semibold underline" onClick={() => setOtp(result.devCode)}>Fill it in</button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input className="input max-w-[10rem] tracking-[0.4em]" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} aria-label="One-time code" />
                  <button className="btn-primary" disabled={otp.length !== 6} onClick={submitOtp}>Confirm</button>
                </div>
              </div>
            )}
            {result.decision !== 'ACCEPT' && <button className="btn-ghost mt-4" onClick={reset}><RotateCcw size={15} />Try again</button>}
            {mode === 'test' && <button className="btn-ghost mt-4" onClick={reset}><RotateCcw size={15} />Run another sample</button>}
          </div>
        )}
      </div>
    </div>
  );
}
