import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import VerifyFlow from '../components/VerifyFlow.jsx';
import { Page } from '../components/ui.jsx';
import { PHRASE } from '../constants.js';

export default function Evaluate() {
  const [label, setLabel] = useState('genuine');
  const [bio, setBio] = useState(null);
  const [count, setCount] = useState({ genuine: 0, impostor: 0 });
  useEffect(() => { api.get('/biometric/status').then((r) => setBio(r.data)); }, []);

  return (
    <Page title="Impostor test lab" subtitle="Generate real accuracy data. Run samples as yourself (genuine), then have a friend sit at the keyboard as you (impostor). Results feed the FAR / FRR / EER charts.">
      {bio && !bio.enrolled ? (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">Enroll first. <Link className="font-semibold underline" to="/enroll">Go to enrollment</Link></div>
      ) : bio && (
        <div className="card p-6">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div role="radiogroup" aria-label="Sample type" className="inline-flex rounded-lg border border-line p-1">
              {['genuine', 'impostor'].map((l) => (
                <button key={l} role="radio" aria-checked={label === l} onClick={() => setLabel(l)} className={`rounded-md px-4 py-1.5 text-sm font-semibold capitalize ${label === l ? (l === 'genuine' ? 'bg-good text-bg' : 'bg-bad text-bg') : 'text-mute'}`}>{l}</button>
              ))}
            </div>
            <p className="text-sm text-mute">Recorded this session: {count.genuine} genuine, {count.impostor} impostor</p>
          </div>
          <VerifyFlow key={label} phrase={bio.phrase || PHRASE} mode="test" label={label} onResult={() => setCount((c) => ({ ...c, [label]: c[label] + 1 }))} />
        </div>
      )}
    </Page>
  );
}
