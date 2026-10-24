import { useEffect, useState } from 'react';
import { Activity, Gauge, ShieldCheck, Users } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client.js';
import { Page, Stat, pct } from '../components/ui.jsx';

const tip = { contentStyle: { background: 'rgb(var(--raised))', border: '1px solid rgb(var(--line))', borderRadius: 8 } };
const ax = { stroke: 'rgb(var(--mute))', fontSize: 12 };
const col = { ACCEPT: 'rgb(var(--good))', STEP_UP: 'rgb(var(--warn))', REJECT: 'rgb(var(--bad))' };

export default function Analytics() {
  const [ov, setOv] = useState(null);
  const [perf, setPerf] = useState(null);
  const [t, setT] = useState(0.7);
  const [risk, setRisk] = useState(null);
  const [exams, setExams] = useState([]);
  const [qs, setQs] = useState(null);
  useEffect(() => { api.get('/analytics/overview').then((r) => setOv(r.data)); api.get('/analytics/performance').then((r) => setPerf(r.data)); api.get('/analytics/risk').then((r) => setRisk(r.data)); api.get('/exams').then((r) => setExams(r.data)); }, []);
  const loadQs = (id) => (id ? api.get(`/analytics/exam/${id}`).then((r) => setQs(r.data)) : setQs(null));
  const at = perf?.points.find((p) => p.t === +t.toFixed(2));
  const modality = perf && [
    { name: 'Face only', eer: perf.eerByModality.face }, { name: 'Typing only', eer: perf.eerByModality.keystroke }, { name: 'Fusion', eer: perf.eerByModality.fusion },
  ].filter((m) => m.eer != null).map((m) => ({ ...m, eer: +(m.eer * 100).toFixed(2) }));

  return (
    <Page title="Analytics" subtitle="Operational numbers on top, biometric accuracy (FAR, FRR, EER) below. Accuracy uses labelled genuine and impostor samples, including seeded demo data.">
      {ov && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Users} label="Users" value={ov.users} />
          <Stat icon={Activity} label="Attempts" value={ov.attempts} hint={`${ov.active} active`} />
          <Stat icon={ShieldCheck} label="Identity checks" value={ov.events} tone="text-keys" />
          <Stat icon={Gauge} label="Average fused score" value={pct(ov.avgFused)} tone="text-good" />
        </div>
      )}
      {ov && (
        <div className="mb-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="card p-5"><h2 className="mb-3 font-bold">Decisions per day (last 14 days)</h2>
            <div className="h-64"><ResponsiveContainer><AreaChart data={ov.daily}><CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" /><XAxis dataKey="day" {...ax} tickFormatter={(d) => d.slice(5)} /><YAxis {...ax} allowDecimals={false} /><Tooltip {...tip} /><Legend />
              {['ACCEPT', 'STEP_UP', 'REJECT'].map((k) => <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={col[k]} fill={col[k]} fillOpacity={0.35} />)}</AreaChart></ResponsiveContainer></div></div>
          <div className="card p-5"><h2 className="mb-3 font-bold">Outcome mix</h2>
            <div className="h-64"><ResponsiveContainer><PieChart><Pie data={ov.decisions} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>{ov.decisions.map((d) => <Cell key={d.name} fill={col[d.name]} />)}</Pie><Tooltip {...tip} /><Legend /></PieChart></ResponsiveContainer></div></div>
        </div>
      )}

      {perf && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card p-5 lg:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><h2 className="font-bold">FAR and FRR by threshold</h2><p className="text-sm text-mute">{perf.nGenuine} genuine and {perf.nImpostor} impostor samples. Drag to explore the trade-off.</p></div>
              <div className="text-right"><p className="text-xs text-mute">Equal error rate</p><p className="font-display text-3xl font-bold text-face">{(perf.eer.value * 100).toFixed(2)}%</p><p className="text-xs text-mute">at threshold {perf.eer.threshold}</p></div>
            </div>
            <div className="mt-4 h-72"><ResponsiveContainer><LineChart data={perf.points}><CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" /><XAxis dataKey="t" {...ax} /><YAxis {...ax} tickFormatter={(v) => `${Math.round(v * 100)}%`} /><Tooltip {...tip} formatter={(v) => `${(v * 100).toFixed(1)}%`} /><Legend />
              <Line dataKey="far" name="FAR (impostors let in)" stroke="rgb(var(--bad))" strokeWidth={2.5} dot={false} /><Line dataKey="frr" name="FRR (genuine users blocked)" stroke="rgb(var(--keys))" strokeWidth={2.5} dot={false} /><ReferenceLine x={+t.toFixed(2)} stroke="rgb(var(--ink))" strokeDasharray="4 4" /></LineChart></ResponsiveContainer></div>
            <div className="mt-3 flex flex-wrap items-center gap-6">
              <input type="range" min={0} max={1} step={0.02} value={t} onChange={(e) => setT(+e.target.value)} className="w-64 accent-[rgb(var(--face))]" aria-label="Threshold" />
              <p className="text-sm">Threshold <b className="tabular-nums">{t.toFixed(2)}</b> gives FAR <b className="tabular-nums text-bad">{at ? (at.far * 100).toFixed(1) : '--'}%</b> and FRR <b className="tabular-nums text-keys">{at ? (at.frr * 100).toFixed(1) : '--'}%</b></p>
            </div>
          </div>
          <div className="card p-5"><h2 className="font-bold">Score distribution</h2><p className="mb-2 text-sm text-mute">Little overlap means a reliable decision boundary.</p>
            <div className="h-60"><ResponsiveContainer><BarChart data={perf.hist}><CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" /><XAxis dataKey="bin" {...ax} /><YAxis {...ax} /><Tooltip {...tip} /><Legend /><Bar dataKey="genuine" fill="rgb(var(--good))" /><Bar dataKey="impostor" fill="rgb(var(--bad))" /></BarChart></ResponsiveContainer></div></div>
          <div className="card p-5"><h2 className="font-bold">Why fuse? EER by modality</h2><p className="mb-2 text-sm text-mute">Lower is better. Fusion should beat either signal alone.</p>
            <div className="h-60"><ResponsiveContainer><BarChart data={modality} layout="vertical"><CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" /><XAxis type="number" {...ax} unit="%" /><YAxis type="category" dataKey="name" {...ax} width={90} /><Tooltip {...tip} formatter={(v) => `${v}%`} /><Bar dataKey="eer" radius={[0, 6, 6, 0]}>{modality.map((m, k) => <Cell key={k} fill={m.name === 'Fusion' ? 'rgb(var(--face))' : 'rgb(var(--keys))'} />)}</Bar></BarChart></ResponsiveContainer></div></div>
        </div>
      )}
      {risk && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="font-bold">Risk watchlist</h2>
            <p className="mb-3 text-sm text-mute">Students with flags, terminated attempts or low average trust.</p>
            {risk.top.length === 0 ? <p className="py-8 text-center text-sm text-mute">Nobody needs attention right now.</p> : (
              <table className="w-full text-sm"><thead><tr><th className="th !px-2">Student</th><th className="th !px-2">Attempts</th><th className="th !px-2">Flags</th><th className="th !px-2">Avg trust</th></tr></thead>
                <tbody className="divide-y divide-line">{risk.top.map((r) => <tr key={r._id}><td className="px-2 py-2">{r.name}<span className="block text-xs text-mute">{r.rollNo}</span></td><td className="px-2 tabular-nums">{r.attempts}</td><td className="px-2 tabular-nums text-bad">{r.flags}</td><td className="px-2 tabular-nums">{pct(r.avgTrust)}</td></tr>)}</tbody></table>
            )}
          </div>
          <div className="card p-5">
            <h2 className="font-bold">Checks by hour of day (UTC)</h2>
            <p className="mb-2 text-sm text-mute">Spot times when rejections cluster, for example late-night sessions.</p>
            <div className="h-56"><ResponsiveContainer><BarChart data={risk.byHour}><CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" /><XAxis dataKey="hour" {...ax} /><YAxis {...ax} allowDecimals={false} /><Tooltip {...tip} /><Legend />
              {['ACCEPT', 'STEP_UP', 'REJECT'].map((k) => <Bar key={k} dataKey={k} stackId="h" fill={col[k]} />)}</BarChart></ResponsiveContainer></div>
          </div>
        </div>
      )}

      <div className="card mt-6 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-bold">Question difficulty</h2><p className="text-sm text-mute">Percent of submitted attempts that answered each question correctly.</p></div>
          <select className="input !w-auto" aria-label="Choose exam" defaultValue="" onChange={(e) => loadQs(e.target.value)}><option value="">Choose an exam</option>{exams.map((e) => <option key={e._id} value={e._id}>{e.title}</option>)}</select>
        </div>
        {qs && (qs.attempts === 0 ? <p className="py-8 text-center text-sm text-mute">No submitted attempts for this exam yet.</p> : (
          <>
            <p className="mt-3 text-sm text-mute">{qs.attempts} submissions, average score <b className="text-ink">{qs.avgScore.toFixed(1)}</b>, average trust <b className="text-ink">{pct(qs.avgTrust)}</b></p>
            <div className="mt-3 h-64"><ResponsiveContainer><BarChart data={qs.questions} layout="vertical"><CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} {...ax} unit="%" /><YAxis type="category" dataKey="n" {...ax} width={30} tickFormatter={(n) => `Q${n}`} /><Tooltip {...tip} formatter={(v) => `${v}%`} labelFormatter={(n) => `Question ${n}`} /><Bar dataKey="pct" name="Correct" radius={[0, 6, 6, 0]}>{qs.questions.map((q) => <Cell key={q.n} fill={q.pct >= 70 ? 'rgb(var(--good))' : q.pct >= 40 ? 'rgb(var(--warn))' : 'rgb(var(--bad))'} />)}</Bar></BarChart></ResponsiveContainer></div>
          </>
        ))}
      </div>
    </Page>
  );
}
