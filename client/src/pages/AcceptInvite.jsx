import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useAuth } from '../store/auth.js';

export default function AcceptInvite() {
  const [p] = useSearchParams();
  const nav = useNavigate();
  const setSession = useAuth((s) => s.setSession);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const token = p.get('token'), email = p.get('email');

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const { data } = await api.post('/auth/accept-invite', { email, token, password }); setSession(data.token, data.user); toast.success(`Welcome to BioGuard, ${data.user.name.split(' ')[0]}`); nav('/'); }
    catch (err) { toast.error(err.friendly); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="card w-full max-w-md p-8">
        <ShieldCheck className="mb-3 text-face" size={34} />
        <h1 className="text-2xl font-bold">Join BioGuard</h1>
        {!token || !email ? (
          <p className="mt-3 text-sm text-mute">This invitation link is incomplete. Open the link from your invitation email, or ask your admin to send a new one. <Link to="/login" className="font-semibold text-face underline">Go to log in</Link></p>
        ) : (
          <form onSubmit={submit}>
            <p className="mt-1 text-sm text-mute">Choose a password for <b className="text-ink">{email}</b> to activate your account.</p>
            <label className="label mt-5" htmlFor="pw">Password</label>
            <input id="pw" type="password" className="input" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="mt-1 text-xs text-mute">At least 8 characters with a letter and a number.</p>
            <button className="btn-primary mt-6 w-full" disabled={busy}>{busy ? 'Please wait...' : 'Activate account'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
