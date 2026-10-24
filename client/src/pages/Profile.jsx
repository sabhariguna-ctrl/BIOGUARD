import { useEffect, useState } from 'react';
import { Download, Laptop, LogOut, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useAuth } from '../store/auth.js';
import { DecisionChip, Page, Stat, pct } from '../components/ui.jsx';
import { downloadBlob } from '../utils.js';

export default function Profile() {
  const user = useAuth((s) => s.user);
  const refresh = useAuth((s) => s.refresh);
  const [d, setD] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const load = () => api.get('/me/security').then((r) => setD(r.data));
  useEffect(() => { load(); }, []);

  const revoke = async (hash) => { await api.delete(`/me/devices/${hash}`); toast.success('Device removed'); load(); };
  const exportData = async () => { const r = await api.get('/me/export'); downloadBlob('my-bioguard-data.json', JSON.stringify(r.data, null, 2), 'application/json'); toast.success('Your data was downloaded'); };
  const erase = async () => { if (!confirm('Erase your biometric templates? You will need to enroll again.')) return; await api.delete('/biometric'); toast.success('Templates erased'); load(); refresh(); };
  const changePw = async (e) => { e.preventDefault(); try { const { data } = await api.post('/auth/change-password', pw); useAuth.getState().setSession(data.token, useAuth.getState().user); toast.success('Password updated. Other devices were signed out.'); setPw({ current: '', next: '' }); } catch (err) { toast.error(err.friendly); } };
  const toggle2fa = async () => { try { const { data } = await api.post('/auth/two-factor', { enabled: !user.twoFactorEmail }); useAuth.getState().setSession(useAuth.getState().token, data.user); toast.success(data.user.twoFactorEmail ? 'Email two-step login is on' : 'Email two-step login is off'); } catch (err) { toast.error(err.friendly); } };
  const signOutOthers = async () => { try { const { data } = await api.post('/auth/logout-others'); useAuth.getState().setSession(data.token, useAuth.getState().user); toast.success('All other devices were signed out'); } catch (err) { toast.error(err.friendly); } };

  return (
    <Page title="My security" subtitle={`Everything BioGuard knows about ${user.name.split(' ')[0]}, and the controls to manage it.`}>
      {d && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Identity checks" value={d.stats.checks} />
            <Stat label="Accepted first time" value={pct(d.stats.acceptRate)} tone="text-good" />
            <Stat label="Average fused score" value={pct(d.stats.avgFused)} tone="text-keys" />
            <Stat label="Template refreshes" value={d.template.adaptations} hint="After strong matches, your template follows slow changes in how you type and look" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card p-6">
              <h2 className="text-lg font-bold">Enrollment health</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex justify-between"><span className="text-mute">Face templates</span><span>{d.template.faceSamples} {d.template.faceSamples >= 5 ? '(strong)' : d.template.faceSamples >= 3 ? '(ok)' : '(add more)'}</span></li>
                <li className="flex justify-between"><span className="text-mute">Typing samples</span><span>{d.template.typingSamples}</span></li>
                <li className="flex justify-between"><span className="text-mute">Last updated</span><span>{d.template.updatedAt ? new Date(d.template.updatedAt).toLocaleString() : 'never'}</span></li>
              </ul>
              <p className="mt-3 text-xs text-mute">Only numeric templates are stored. Photos and typed text never leave your browser.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-ghost" onClick={exportData}><Download size={15} />Download my data</button>
                <button className="btn-danger" onClick={erase}><Trash2 size={15} />Erase templates</button>
              </div>
            </section>

            <section className="card p-6">
              <h2 className="text-lg font-bold">Trusted devices</h2>
              <p className="mb-3 text-sm text-mute">A login from a new browser or device needs an extra email code, even if your face and typing match.</p>
              <ul className="space-y-2">
                {d.devices.map((v) => (
                  <li key={v.hash} className="panel flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="flex items-center gap-2"><Laptop size={16} className="text-mute" /><span>{v.label}<span className="block text-xs text-mute">Last used {new Date(v.lastSeen).toLocaleDateString()}</span></span></span>
                    <button className="btn-ghost !py-1" onClick={() => revoke(v.hash)}>Remove</button>
                  </li>
                ))}
                {d.devices.length === 0 && <li className="py-4 text-center text-sm text-mute">Your first verified login will be trusted automatically.</li>}
              </ul>
            </section>

            <section className="card p-6">
              <h2 className="text-lg font-bold">Recent checks</h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {d.recent.map((e) => <li key={e._id} className="flex items-center justify-between rounded-lg bg-raised px-3 py-2"><span className="text-mute">{new Date(e.createdAt).toLocaleString()} <span className="ml-1 capitalize">{e.mode}</span></span><span className="flex items-center gap-3"><span className="tabular-nums">{pct(e.fused)}</span><DecisionChip decision={e.decision} /></span></li>)}
                {d.recent.length === 0 && <li className="py-4 text-center text-mute">No checks yet.</li>}
              </ul>
            </section>

            <section className="card p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck size={18} />Login security</h2>
              <div className="mt-4 flex items-start justify-between gap-4">
                <div><p className="text-sm font-semibold">Email two-step login</p><p className="text-xs text-mute">After your password, we email a 6-digit code. Recommended for teachers and admins.{user.role !== 'student' ? '' : ''}</p></div>
                <button type="button" role="switch" aria-checked={!!user.twoFactorEmail} onClick={toggle2fa} className={`relative h-6 w-11 shrink-0 rounded-full transition ${user.twoFactorEmail ? 'bg-face' : 'bg-line'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${user.twoFactorEmail ? 'left-[22px]' : 'left-0.5'}`} /><span className="sr-only">Toggle email two-step login</span></button>
              </div>
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-sm font-semibold">Sessions</p>
                <p className="mb-3 text-xs text-mute">Lost a laptop or used a shared computer? Sign out everywhere except this device.</p>
                <button className="btn-ghost" onClick={signOutOthers}><LogOut size={15} />Sign out other devices</button>
              </div>
            </section>

            <form onSubmit={changePw} className="card h-fit space-y-4 p-6">
              <h2 className="text-lg font-bold">Change password</h2>
              <div><label className="label" htmlFor="cp">Current password</label><input id="cp" type="password" className="input" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
              <div><label className="label" htmlFor="np">New password</label><input id="np" type="password" minLength={8} className="input" required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
              <button className="btn-primary"><RefreshCw size={15} />Update password</button>
            </form>
          </div>
        </>
      )}
    </Page>
  );
}
