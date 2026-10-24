import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BookOpenCheck, CheckCircle2, Circle, Fingerprint, ShieldCheck, Users } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../store/auth.js';
import { Page, Stat, StatusChip, pct } from '../components/ui.jsx';

export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const [bio, setBio] = useState(null);
  const [ov, setOv] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [exams, setExams] = useState([]);
  const staff = user.role !== 'student';

  useEffect(() => {
    api.get('/biometric/status').then((r) => setBio(r.data)).catch(() => {});
    api.get('/attempts').then((r) => setAttempts(r.data.slice(0, 6))).catch(() => {});
    api.get('/exams').then((r) => setExams(r.data)).catch(() => {});
    if (staff) api.get('/analytics/overview').then((r) => setOv(r.data)).catch(() => {});
  }, [staff]);

  const open = exams.filter((e) => !e.attempt || e.attempt.status === 'active');
  return (
    <Page title={`Hello, ${user.name.split(' ')[0]}`} subtitle={staff ? 'Here is how identity checks are performing across your exams.' : 'Finish enrollment once, then start any exam in under a minute.'}>
      {user.approval === 'pending' && <div className="mb-5 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn" role="status">Your teacher access request is waiting for an administrator. Until then you have student access. You will get a notification when it is approved.</div>}
      {user.approval === 'rejected' && <div className="mb-5 rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad" role="status">Your teacher access request was declined. Contact your administrator if this is a mistake.</div>}
      {staff && ov && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Users} label="Users" value={ov.users} />
          <Stat icon={BookOpenCheck} label="Exams" value={ov.exams} hint={`${ov.active} in progress now`} />
          <Stat icon={ShieldCheck} label="Identity checks" value={ov.events} hint="Real checks, excluding demo data" tone="text-keys" />
          <Stat icon={Activity} label="Average fused trust" value={pct(ov.avgFused)} tone="text-good" />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {!staff && (
          <div className="card p-6">
            <h2 className="text-lg font-bold">Enrollment</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {[['Face samples', bio ? bio.faceSamples >= 3 : false, bio ? `${bio.faceSamples} captured` : '...'], ['Typing samples', bio ? bio.keystrokeSamples >= 5 : false, bio ? `${bio.keystrokeSamples} captured` : '...']].map(([n, ok, t]) => (
                <li key={n} className="flex items-center gap-3">{ok ? <CheckCircle2 className="text-good" size={18} /> : <Circle className="text-mute" size={18} />}<span className="flex-1">{n}</span><span className="text-mute">{t}</span></li>
              ))}
            </ul>
            <Link to="/enroll" className="btn-primary mt-5"><Fingerprint size={16} />{bio?.enrolled ? 'Re-enroll' : 'Start enrollment'}</Link>
          </div>
        )}
        <div className="card p-6">
          <h2 className="text-lg font-bold">{staff ? 'Recent attempts' : 'Open exams'}</h2>
          <ul className="mt-4 divide-y divide-line text-sm">
            {(staff ? attempts : open).slice(0, 5).map((x) => staff ? (
              <li key={x._id} className="flex items-center justify-between py-2.5"><span>{x.student?.name} <span className="text-mute">in {x.exam?.title}</span></span><span className="flex items-center gap-3"><span className="tabular-nums text-mute">{pct(x.trust)}</span><StatusChip status={x.status} /></span></li>
            ) : (
              <li key={x._id} className="flex items-center justify-between py-2.5"><span>{x.title}</span><Link to="/exams" className="font-semibold text-face hover:underline">{x.attempt ? 'Resume' : 'Open'}</Link></li>
            ))}
            {(staff ? attempts : open).length === 0 && <li className="py-6 text-center text-mute">{staff ? 'No attempts yet.' : 'No exams are open right now.'}</li>}
          </ul>
        </div>
      </div>
    </Page>
  );
}
