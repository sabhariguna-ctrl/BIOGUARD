import { useEffect, useState } from 'react';
import { Check, Copy, Mail, RefreshCw, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useAuth } from '../store/auth.js';
import { Page } from '../components/ui.jsx';

export default function Users() {
  const me = useAuth((s) => s.user);
  const [users, setUsers] = useState([]);
  const [f, setF] = useState({ name: '', email: '', role: 'faculty' });
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);
  const load = () => api.get('/users').then((r) => setUsers(r.data));
  useEffect(() => { load(); }, []);

  const invite = async (e) => {
    e.preventDefault(); setBusy(true); setLink(null);
    try { const { data } = await api.post('/users/invite', f); toast.success(data.devLink ? 'Invite created (dev mode)' : `Invitation emailed to ${f.email}`); setLink(data.devLink || null); setF({ name: '', email: '', role: 'faculty' }); load(); }
    catch (err) { toast.error(err.friendly); } finally { setBusy(false); }
  };
  const resend = async (u) => { try { const { data } = await api.post(`/users/${u._id}/resend-invite`); toast.success('Invitation sent again'); setLink(data.devLink || null); } catch (err) { toast.error(err.friendly); } };
  const role = async (id, r) => { try { await api.patch(`/users/${id}/role`, { role: r }); load(); } catch (err) { toast.error(err.friendly); } };
  const decide = async (u, action) => { try { await api.post(`/users/${u._id}/${action}`); toast.success(action === 'approve' ? `${u.name} is now faculty` : 'Request declined'); load(); } catch (err) { toast.error(err.friendly); } };
  const pending = users.filter((u) => u.approval === 'pending' && u.emailVerified !== false);
  const del = async (id) => { if (!confirm('Delete this user and their biometric templates?')) return; try { await api.delete(`/users/${id}`); load(); } catch (err) { toast.error(err.friendly); } };
  const state = (u) => (u.emailVerified === false ? (u.inviteExpires ? ['Invited', 'bg-warn/15 text-warn'] : ['Unverified', 'bg-raised text-mute']) : u.approval === 'pending' ? ['Teacher request', 'bg-keys/15 text-keys'] : u.enrolled?.face && u.enrolled?.keystroke ? ['Enrolled', 'bg-good/15 text-good'] : ['Active', 'bg-face/15 text-face']);

  return (
    <Page title="Users" subtitle="Students and teachers sign up with their own email. Invite teachers here, approve teacher requests, and manage roles. The administrator is the single ADMIN_EMAIL account.">
      {pending.length > 0 && (
        <section className="card mb-4 border-keys/40 p-5">
          <h2 className="text-lg font-bold">Teacher access requests ({pending.length})</h2>
          <ul className="mt-3 divide-y divide-line">
            {pending.map((u) => (
              <li key={u._id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span><b>{u.name}</b> <span className="text-mute">{u.email}{u.department ? `, ${u.department}` : ''}</span></span>
                <span className="flex gap-2"><button className="btn-primary !py-1.5" onClick={() => decide(u, 'approve')}><Check size={14} />Approve</button><button className="btn-danger !py-1.5" onClick={() => decide(u, 'reject')}><X size={14} />Decline</button></span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-mute">Only approve people you recognise. Faculty can create exams, see every attempt, and use live proctoring.</p>
        </section>
      )}
      <form onSubmit={invite} className="card mb-4 grid items-end gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div><label className="label" htmlFor="un">Name</label><input id="un" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label" htmlFor="ue">Email</label><input id="ue" type="email" className="input" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label className="label" htmlFor="ur">Role</label><select id="ur" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option>faculty</option><option>student</option></select></div>
        <button className="btn-primary" disabled={busy}><Mail size={16} />{busy ? 'Sending...' : 'Send invitation'}</button>
      </form>
      {link && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm" role="status">
          <span className="min-w-0"><b>Dev mode:</b> email is not configured, so share this link yourself: <span className="block truncate font-mono text-xs">{link}</span></span>
          <button className="btn-ghost shrink-0" onClick={() => { navigator.clipboard.writeText(link); toast.success('Link copied'); }}><Copy size={14} />Copy</button>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-line"><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Status</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => { const [label, cls] = state(u); return (
              <tr key={u._id}>
                <td className="td font-medium">{u.name}</td><td className="td text-mute">{u.email}</td>
                <td className="td">{u.role === 'admin' ? <span className="chip bg-keys/15 text-keys">administrator</span> : <select className="input !w-auto !py-1" value={u.role} onChange={(e) => role(u._id, e.target.value)} aria-label={`Role for ${u.name}`}><option>student</option><option>faculty</option></select>}</td>
                <td className="td"><span className={`chip ${cls}`}>{label}</span></td>
                <td className="td text-right"><span className="inline-flex gap-2">
                  {label === 'Invited' && <button className="btn-ghost !py-1" onClick={() => resend(u)} aria-label={`Resend invitation to ${u.name}`}><RefreshCw size={14} /></button>}
                  {u._id !== me._id && <button className="btn-danger !py-1" onClick={() => del(u._id)} aria-label={`Delete ${u.name}`}><Trash2 size={14} /></button>}
                </span></td>
              </tr>); })}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
