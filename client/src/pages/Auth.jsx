import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useAuth } from '../store/auth.js';
import TrustRing from '../components/TrustRing.jsx';

const TITLES = {
  login: ['Log in', 'Welcome back.'],
  register: ['Create your account', 'Student accounts only. Faculty join by invitation from an admin.'],
  verify: ['Check your email', 'Enter the 6-digit code to verify your address.'],
  forgot: ['Forgot password', 'We will email you a code to choose a new one.'],
  reset: ['Choose a new password', 'Enter the code from your email and your new password.'],
  codeLogin: ['Log in with an email code', 'Works for students, teachers and admins. We email a one-time code to the address on your account.'],
};

export default function Auth() {
  const { token, setSession } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [view, setView] = useState(params.get('view') === 'register' ? 'register' : 'login');
  const [f, setF] = useState({ name: '', email: '', password: '', rollNo: '', department: '', accountType: 'student', code: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);
  const [remember, setRemember] = useState(true);
  const [demo, setDemo] = useState({ face: 0.93, keys: 0.81 });

  useEffect(() => {
    const states = [{ face: 0.93, keys: 0.81 }, { face: 0.62, keys: 0.88 }, { face: 0.18, keys: 0.27 }];
    let i = 0;
    const t = setInterval(() => setDemo(states[++i % states.length]), 3800);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (cooldown > 0) { const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); } }, [cooldown]);

  if (token) return <Navigate to="/" replace />;
  const fused = 0.55 * demo.face + 0.45 * demo.keys;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = (v) => { setView(v); setDevCode(null); setSent(false); setCooldown(0); setF((s) => ({ ...s, code: '', newPassword: '' })); };

  const guard = async (fn) => { setBusy(true); try { await fn(); } catch (err) { toast.error(err.friendly || err.message); } finally { setBusy(false); } };
  const finish = (data) => { setSession(data.token, data.user, remember); toast.success(`Welcome, ${data.user.name.split(' ')[0]}`); nav('/'); };
  const sendCode = (purpose) => guard(async () => {
    const { data } = await api.post('/auth/send-code', { email: f.email, purpose });
    setDevCode(data.devCode || null); setCooldown(30); setSent(true);
    toast.success('If that email has an account, a code is on its way.');
  });

  const onLogin = (e) => { e.preventDefault(); guard(async () => {
    try {
      const { data } = await api.post('/auth/login', { email: f.email, password: f.password });
      if (data.mfaRequired) { setView('codeLogin'); setSent(true); setDevCode(data.devCode || null); setCooldown(30); setF((s) => ({ ...s, code: '' })); toast('Two-step login: we emailed you a code.'); return; }
      finish(data);
    }
    catch (err) {
      if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') { toast('Please verify your email first.'); setView('verify'); const { data } = await api.post('/auth/send-code', { email: f.email, purpose: 'verify_email' }).catch(() => ({ data: {} })); setDevCode(data.devCode || null); setCooldown(30); return; }
      throw err;
    }
  }); };
  const onRegister = (e) => { e.preventDefault(); guard(async () => {
    const { data } = await api.post('/auth/register', { name: f.name, email: f.email, password: f.password, rollNo: f.rollNo, department: f.department, accountType: f.accountType });
    setView('verify'); setDevCode(data.devCode || null); setCooldown(30);
  }); };
  const onVerify = (e) => { e.preventDefault(); guard(async () => finish((await api.post('/auth/verify-email', { email: f.email, code: f.code })).data)); };
  const onCodeLogin = (e) => { e.preventDefault(); sent ? guard(async () => finish((await api.post('/auth/login-code', { email: f.email, code: f.code })).data)) : sendCode('login'); };
  const onForgot = (e) => { e.preventDefault(); guard(async () => {
    const { data } = await api.post('/auth/send-code', { email: f.email, purpose: 'reset_password' });
    setDevCode(data.devCode || null); setCooldown(30); setView('reset');
  }); };
  const onReset = (e) => { e.preventDefault(); guard(async () => {
    await api.post('/auth/reset-password', { email: f.email, code: f.code, password: f.newPassword });
    toast.success('Password updated. Log in with your new password.'); setF((s) => ({ ...s, password: '', code: '', newPassword: '' })); go('login');
  }); };

  const CodeField = (
    <div>
      <label className="label" htmlFor="code">6-digit code</label>
      <input id="code" className="input text-center text-xl tracking-[0.5em]" inputMode="numeric" maxLength={6} autoComplete="one-time-code" required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} />
      {!devCode && <p className="mt-2 text-xs text-mute">Did not get it? Check your spam folder, then use "Send a new code". It can take up to a minute.</p>}
      {devCode && (
        <div className="mt-2 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm" role="status">
          <span>Email is not set up on this server (dev mode). Your code: <b className="tracking-[0.25em]">{devCode}</b></span>
          <button type="button" className="font-semibold underline" onClick={() => setF({ ...f, code: devCode })}>Fill it in</button>
        </div>
      )}
    </div>
  );
  const Resend = (purpose) => (
    <button type="button" className="text-sm font-semibold text-face hover:underline disabled:opacity-50 disabled:no-underline" disabled={cooldown > 0 || busy} onClick={() => sendCode(purpose)}>
      {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Send a new code'}
    </button>
  );
  const EmailField = (
    <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" className="input" required autoComplete="email" value={f.email} onChange={set('email')} /></div>
  );
  const Remember = (
    <label className="mt-4 flex items-start gap-2 text-sm">
      <input id="remember" type="checkbox" className="mt-0.5 accent-[rgb(var(--face))]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
      <span><b className="font-semibold">Keep me signed in on this device</b><span className="block text-xs text-mute">Untick on shared computers. An unticked session lives only in this tab, so you can test admin, teacher and student side by side in different tabs.</span></span>
    </label>
  );
  const Submit = (text) => <button className="btn-primary mt-6 w-full" disabled={busy}>{busy ? 'Please wait...' : text}</button>;
  const Back = <button type="button" className="mt-4 flex items-center gap-1 text-sm text-mute hover:text-ink" onClick={() => go('login')}><ArrowLeft size={14} />Back to log in</button>;
  const [title, sub] = TITLES[view];

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface p-12 lg:flex">
        <Link to="/welcome" className="flex items-center gap-2.5">
          <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="13" fill="none" stroke="rgb(var(--face))" strokeWidth="3" /><circle cx="16" cy="16" r="6" fill="none" stroke="rgb(var(--keys))" strokeWidth="3" /></svg>
          <span className="font-display text-xl font-bold">BioGuard</span>
        </Link>
        <div>
          <h1 className="max-w-md text-5xl font-bold leading-[1.05]">Your face and your typing rhythm, scored as one.</h1>
          <p className="mt-4 max-w-md text-mute">Online exams stay honest when the person who started is the person who finishes. BioGuard fuses two signals and keeps checking until you submit.</p>
          <div className="mt-10 flex items-center gap-8">
            <TrustRing size={200} face={demo.face} keys={demo.keys} fused={fused} />
            <dl className="space-y-3 text-sm">
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-face" /><dt className="text-mute">Face match</dt><dd className="font-semibold tabular-nums">{Math.round(demo.face * 100)}%</dd></div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-keys" /><dt className="text-mute">Typing rhythm</dt><dd className="font-semibold tabular-nums">{Math.round(demo.keys * 100)}%</dd></div>
              <p className="max-w-[14rem] text-xs text-mute">A weak face frame leans on typing. Two weak signals never pass.</p>
            </dl>
          </div>
        </div>
        <p className="text-xs text-mute">Only mathematical templates are stored. Photos and typed text are never saved.</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {view === 'verify' && <MailCheck className="mb-3 text-face" size={32} />}
          <h2 className="text-3xl font-bold">{title}</h2>
          <p className="mt-1 text-sm text-mute">{view === 'verify' ? `We emailed a code to ${f.email || 'you'}.` : sub}</p>

          {view === 'login' && (
            <form onSubmit={onLogin}>
              <div className="mt-6 space-y-4">
                {EmailField}
                <div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" className="input" required autoComplete="current-password" value={f.password} onChange={set('password')} /></div>
              </div>
              <div className="mt-2 text-right"><button type="button" className="text-sm font-semibold text-face hover:underline" onClick={() => go('forgot')}>Forgot password?</button></div>
              {Remember}
              {Submit('Log in')}
              <button type="button" className="btn-ghost mt-3 w-full" onClick={() => go('codeLogin')}>Email me a login code instead</button>
              <p className="mt-4 text-center text-sm text-mute">New student? <button type="button" className="font-semibold text-face hover:underline" onClick={() => go('register')}>Create an account</button></p>
              <p className="mt-8 border-t border-line pt-4 text-xs text-mute">Students and teachers get a verification code by email when they sign up. The administrator logs in with <b className="text-ink">Email me a login code</b> using the admin email.</p>
            </form>
          )}

          {view === 'register' && (
            <form onSubmit={onRegister}>
              <div className="mt-6 space-y-4">
                <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-2 rounded-xl border border-line p-1">
                  {[['student', 'I am a student'], ['faculty', 'I am a teacher']].map(([v, l]) => (
                    <button type="button" key={v} role="radio" aria-checked={f.accountType === v} onClick={() => setF({ ...f, accountType: v })} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${f.accountType === v ? 'bg-face text-bg' : 'text-mute hover:text-ink'}`}>{l}</button>
                  ))}
                </div>
                {f.accountType === 'faculty' && <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">Teacher accounts start with student access. An administrator reviews your request, and you get a notification when it is approved.</p>}
                <div><label className="label" htmlFor="name">Full name</label><input id="name" className="input" required value={f.name} onChange={set('name')} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label" htmlFor="roll">Roll number</label><input id="roll" className="input" value={f.rollNo} onChange={set('rollNo')} /></div>
                  <div><label className="label" htmlFor="dept">Department</label><input id="dept" className="input" value={f.department} onChange={set('department')} /></div>
                </div>
                {EmailField}
                <div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" className="input" required minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} /><p className="mt-1 text-xs text-mute">At least 8 characters with a letter and a number.</p></div>
              </div>
              {Submit('Create account and send code')}
              <p className="mt-4 text-center text-sm text-mute">Already registered? <button type="button" className="font-semibold text-face hover:underline" onClick={() => go('login')}>Log in</button></p>
            </form>
          )}

          {view === 'verify' && (
            <form onSubmit={onVerify}>
              <div className="mt-6 space-y-4">{CodeField}</div>
              {Submit('Verify and continue')}
              <div className="mt-4 flex items-center justify-between">{Resend('verify_email')}<button type="button" className="text-sm text-mute hover:text-ink" onClick={() => go('register')}>Wrong email?</button></div>
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={onForgot}>
              <div className="mt-6">{EmailField}</div>
              {Submit('Send reset code')}
              {Back}
            </form>
          )}

          {view === 'reset' && (
            <form onSubmit={onReset}>
              <div className="mt-6 space-y-4">
                {CodeField}
                <div><label className="label" htmlFor="np">New password</label><input id="np" type="password" className="input" required minLength={8} autoComplete="new-password" value={f.newPassword} onChange={set('newPassword')} /><p className="mt-1 text-xs text-mute">At least 8 characters with a letter and a number.</p></div>
              </div>
              {Submit('Update password')}
              <div className="mt-4">{Resend('reset_password')}</div>
              {Back}
            </form>
          )}

          {view === 'codeLogin' && (
            <form onSubmit={onCodeLogin}>
              <div className="mt-6 space-y-4">
                {EmailField}
                {sent && CodeField}
                {!sent && <p className="text-xs text-mute">No account yet? <button type="button" className="font-semibold text-face hover:underline" onClick={() => go('register')}>Create one</button>. For safety we never reveal whether an email is registered.</p>}
              </div>
              {sent && Remember}
              {Submit(sent ? 'Log in' : 'Send me a code')}
              {sent && <div className="mt-4">{Resend('login')}</div>}
              {Back}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
