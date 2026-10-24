import { useState } from 'react';
import { Send, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';

const SAMPLE = 'name,email,rollNo\nAarav Kumar,aarav@college.edu,21CS001\nMeera S,meera@college.edu,21CS002';

/** Parse "name,email,rollNo,department" lines (comma or tab). A header row is skipped automatically. */
export function parseRows(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length && /email/i.test(lines[0]) && /name/i.test(lines[0])) lines.shift();
  return lines.map((l) => { const [name, email, rollNo, department] = l.split(/[,\t]/).map((x) => x.trim()); return { name, email, rollNo, department }; });
}

export default function BulkInvite({ roles = ['student'] }) {
  const [text, setText] = useState('');
  const [role, setRole] = useState('student');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const rows = parseRows(text);

  const onFile = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setText(String(r.result)); r.readAsText(f); e.target.value = ''; };
  const send = async () => {
    setBusy(true); setRes(null);
    try { const { data } = await api.post('/users/bulk-invite', { role, rows }); setRes(data); if (data.sent) toast.success(`${data.sent} invitation${data.sent > 1 ? 's' : ''} sent`); }
    catch (err) { toast.error(err.friendly); } finally { setBusy(false); }
  };

  return (
    <section className="card p-6">
      <h2 className="text-lg font-bold">Invite many people from a list</h2>
      <p className="mt-1 text-sm text-mute">One person per line: <code>name, email, roll number</code>. Each person gets an email with a secure link to set their own password. Up to 100 at a time, and your email provider may have a daily sending limit.</p>
      <textarea className="input mt-4 font-mono text-xs" rows={7} placeholder={SAMPLE} value={text} onChange={(e) => setText(e.target.value)} aria-label="People to invite" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="btn-ghost cursor-pointer"><Upload size={15} />Upload CSV<input type="file" accept=".csv,.txt" className="sr-only" onChange={onFile} /></label>
        {roles.length > 1 && <select className="input !w-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role for invited people">{roles.map((r) => <option key={r}>{r}</option>)}</select>}
        <button className="btn-primary" disabled={busy || rows.length === 0 || rows.length > 100} onClick={send}><Send size={15} />{busy ? 'Sending...' : `Send ${rows.length || ''} invitation${rows.length === 1 ? '' : 's'}`}</button>
        {rows.length > 100 && <span className="text-sm text-bad">Too many rows ({rows.length}). Maximum is 100.</span>}
      </div>
      {res && (
        <div className="mt-5 space-y-2 text-sm" role="status">
          <p className="rounded-lg bg-good/10 px-3 py-2 text-good">{res.sent} invitation{res.sent === 1 ? '' : 's'} sent.</p>
          {res.skipped.length > 0 && <div className="rounded-lg bg-warn/10 px-3 py-2 text-warn"><b>Skipped ({res.skipped.length}):</b> {res.skipped.map((s) => `${s.email} (${s.reason})`).join(', ')}</div>}
          {res.failed.length > 0 && <div className="rounded-lg bg-bad/10 px-3 py-2 text-bad"><b>Failed ({res.failed.length}):</b> {res.failed.map((s) => `${s.email}: ${s.error}`).join(' | ')}</div>}
          {res.stopped && <p className="text-bad">Sending stopped because the email service rejected a message. Check the Email setup page.</p>}
        </div>
      )}
    </section>
  );
}
