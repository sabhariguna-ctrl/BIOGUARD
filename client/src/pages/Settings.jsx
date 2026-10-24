import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Mail, Send } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../store/auth.js';
import { Page } from '../components/ui.jsx';

const PROVIDER = { brevo: 'Brevo (HTTPS API)', resend: 'Resend (HTTPS API)', smtp: 'SMTP', none: 'None (dev mode)' };

export default function Settings() {
  const me = useAuth((s) => s.user);
  const [st, setSt] = useState(null);
  const [logs, setLogs] = useState([]);
  const [to, setTo] = useState(me.email);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const loadLogs = () => api.get('/admin/mail-logs').then((r) => setLogs(r.data)).catch(() => {});
  useEffect(() => { api.get('/admin/mail-status').then((r) => setSt(r.data)); loadLogs(); }, []);

  const send = async (e) => {
    e.preventDefault(); setBusy(true); setResult(null);
    try { const { data } = await api.post('/admin/test-email', { to }); setResult({ ok: true, dev: data.dev, to: data.to }); }
    catch (err) { setResult({ ok: false, message: err.friendly }); } finally { setBusy(false); loadLogs(); }
  };

  return (
    <Page title="Email setup" subtitle="Verification codes, login codes, invitations and security alerts all go out by email. Make sure delivery works before you share the app.">
      {st && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-6">
            <div className="flex items-center gap-2">{st.configured ? <CheckCircle2 className="text-good" /> : <AlertTriangle className="text-warn" />}<h2 className="text-lg font-bold">{st.configured ? `Sending with ${PROVIDER[st.provider]}` : 'Dev mode: no email provider'}</h2></div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-mute">Provider</dt><dd>{PROVIDER[st.provider]}</dd></div>
              {st.provider === 'smtp' && <><div className="flex justify-between"><dt className="text-mute">SMTP host</dt><dd>{st.host}:{st.port}</dd></div><div className="flex justify-between"><dt className="text-mute">Login user</dt><dd>{st.user || 'not set'}</dd></div></>}
              {st.apiKey && <div className="flex justify-between"><dt className="text-mute">API key</dt><dd className="font-mono">{st.apiKey}</dd></div>}
              <div className="flex justify-between"><dt className="text-mute">Administrator email</dt><dd>{st.adminEmail}</dd></div>
              <div className="flex justify-between"><dt className="text-mute">Sender</dt><dd className="truncate pl-4">{st.from || 'not set'}</dd></div>
              <div className="flex justify-between"><dt className="text-mute">Mode</dt><dd>{st.production ? 'Production (codes are never shown on screen)' : 'Development'}</dd></div>
              <div className="flex justify-between"><dt className="text-mute">Staff must use email 2-step</dt><dd>{st.staff2fa ? 'Yes' : 'No (set STAFF_2FA=true)'}</dd></div>
            </dl>
            {st.warnings.map((w) => <p key={w} className="mt-3 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad" role="alert">{w}</p>)}
            {st.devMode && <p className="mt-3 rounded-lg bg-warn/10 p-3 text-sm text-warn">DEV CODES are on (ALLOW_DEV_CODES=true): codes are shown on screen instead of being emailed. Turn this off and configure email before real students sign up.</p>}
          </section>

          <section className="card p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold"><Mail size={18} />Send a test email</h2>
            <form onSubmit={send} className="mt-4">
              <label className="label" htmlFor="to">Send to</label>
              <input id="to" type="email" className="input" required value={to} onChange={(e) => setTo(e.target.value)} />
              <button className="btn-primary mt-4" disabled={busy}><Send size={15} />{busy ? 'Sending...' : 'Send test email'}</button>
            </form>
            {result?.ok && <p className="mt-4 rounded-lg bg-good/10 p-3 text-sm text-good" role="status">{result.dev ? 'Dev mode: the email was printed in the server console (nothing was sent).' : `Sent to ${result.to}. Check the inbox and the spam folder.`}</p>}
            {result && !result.ok && <p className="mt-4 rounded-lg bg-bad/10 p-3 text-sm text-bad" role="alert">{result.message}</p>}
          </section>

          <section className="card p-6 lg:col-span-2">
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Recent deliveries</h2><button className="btn-ghost !py-1" onClick={loadLogs}>Refresh</button></div>
            {logs.length === 0 ? <p className="py-6 text-center text-sm text-mute">No emails yet.</p> : (
              <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr><th className="th !px-2">Time</th><th className="th !px-2">To</th><th className="th !px-2">Subject</th><th className="th !px-2">Result</th></tr></thead>
                <tbody className="divide-y divide-line">{logs.map((l) => (
                  <tr key={l._id}><td className="px-2 py-2 text-mute">{new Date(l.createdAt).toLocaleString()}</td><td className="px-2">{l.to}</td><td className="px-2">{l.subject}</td>
                    <td className="px-2"><span className={`chip ${l.status === 'sent' ? 'bg-good/15 text-good' : l.status === 'failed' ? 'bg-bad/15 text-bad' : 'bg-raised text-mute'}`}>{l.status}</span>{l.error && <span className="mt-1 block max-w-md truncate text-xs text-bad" title={l.error}>{l.error}</span>}</td></tr>))}</tbody></table></div>
            )}
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-bold">Hosting online? Use Brevo</h2>
            <p className="mt-1 text-sm text-mute">Free hosts such as Render block SMTP, so Gmail will not work there. Brevo sends over HTTPS, is free for 300 emails a day, and can email anyone.</p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-mute">
              <li>Create a free account at brevo.com.</li>
              <li>Senders, Domains and Dedicated IPs &gt; <b className="text-ink">Senders</b> &gt; add your email and click the verification link.</li>
              <li>SMTP and API &gt; <b className="text-ink">API Keys</b> &gt; generate a key.</li>
              <li>Set <code>BREVO_API_KEY</code> and <code>MAIL_FROM=BioGuard &lt;your verified sender&gt;</code> on your server, then redeploy.</li>
            </ol>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-bold">Running locally? Gmail works</h2>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-mute">
              <li>Turn on <b className="text-ink">2-Step Verification</b> in your Google Account.</li>
              <li>Security &gt; <b className="text-ink">App passwords</b>, create one (16 letters).</li>
              <li>In <code>server/.env</code>: <code>SMTP_HOST=smtp.gmail.com</code>, <code>SMTP_PORT=587</code>, <code>SMTP_USER</code> = full Gmail address, <code>SMTP_PASS</code> = the 16 letters, <code>MAIL_FROM=BioGuard &lt;same address&gt;</code>.</li>
              <li>Restart the server and send a test email.</li>
            </ol>
          </section>
        </div>
      )}
    </Page>
  );
}
