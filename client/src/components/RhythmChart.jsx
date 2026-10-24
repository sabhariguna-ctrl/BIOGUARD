import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Visualises one typing sample: how long each key was held (bars) and the gap before the next key (line). */
export default function RhythmChart({ events }) {
  const data = events.map((e, i) => ({ k: e.k === ' ' ? '_' : e.k, hold: e.u - e.d, gap: i < events.length - 1 ? events[i + 1].d - e.u : null }));
  return (
    <div className="h-40" aria-label="Typing rhythm chart">
      <ResponsiveContainer>
        <ComposedChart data={data}>
          <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" />
          <XAxis dataKey="k" stroke="rgb(var(--mute))" fontSize={11} interval={0} />
          <YAxis stroke="rgb(var(--mute))" fontSize={11} width={34} />
          <Tooltip contentStyle={{ background: 'rgb(var(--raised))', border: '1px solid rgb(var(--line))', borderRadius: 8 }} />
          <Bar dataKey="hold" name="Key held (ms)" fill="rgb(var(--keys))" radius={[3, 3, 0, 0]} />
          <Line dataKey="gap" name="Gap to next key (ms)" stroke="rgb(var(--face))" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
