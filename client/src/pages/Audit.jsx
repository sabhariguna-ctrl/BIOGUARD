import { useEffect, useState } from 'react';
import { Link2, ShieldCheck, ShieldX } from 'lucide-react';
import { api } from '../api/client.js';
import { Page } from '../components/ui.jsx';

export default function Audit() {
  const [blocks, setBlocks] = useState([]);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/audit?limit=60').then((r) => setBlocks(r.data));
  useEffect(() => { load(); }, []);
  const verify = async () => { setBusy(true); setRes((await api.get('/audit/verify')).data); setBusy(false); };
  const short = (h) => `${h.slice(0, 8)}...${h.slice(-6)}`;

  return (
    <Page title="Audit chain" subtitle="Every login, enrollment and identity decision is written to a hash-linked ledger. Each block includes the hash of the one before it, so editing history breaks the chain."
      actions={<button className="btn-primary" onClick={verify} disabled={busy}><ShieldCheck size={16} />{busy ? 'Checking...' : 'Verify integrity'}</button>}>
      {res && (
        <div className={`mb-5 flex items-center gap-3 rounded-xl border p-4 text-sm ${res.valid ? 'border-good/40 bg-good/10 text-good' : 'border-bad/40 bg-bad/10 text-bad'}`} role="status">
          {res.valid ? <ShieldCheck /> : <ShieldX />}
          {res.valid ? `Chain is intact. ${res.total} blocks verified.` : `Tampering detected at block ${res.brokenAt}: ${res.reason}.`}
        </div>
      )}
      <ol className="space-y-3">
        {blocks.map((b) => (
          <li key={b.index} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-raised font-display font-bold">{b.index}</span><div><p className="font-semibold">{b.type.replaceAll('_', ' ')}</p><p className="text-xs text-mute">{new Date(b.ts).toLocaleString()}</p></div></div>
              <div className="text-right font-mono text-xs"><p className="text-face">{short(b.hash)}</p><p className="flex items-center justify-end gap-1 text-mute"><Link2 size={11} />{short(b.prevHash)}</p></div>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-bg p-3 text-xs text-mute">{JSON.stringify(b.data)}</pre>
          </li>
        ))}
      </ol>
    </Page>
  );
}
