import { motion } from 'framer-motion';

/**
 * Signature visual: two concentric arcs (outer = face, inner = keystrokes) that merge into
 * the fused trust score at the centre. Colour of the centre follows the decision band.
 */
export default function TrustRing({ face, keys, fused, size = 220, label = 'fused trust', accept = 0.75, stepUp = 0.55 }) {
  const c = size / 2, stroke = size * 0.07;
  const r1 = c - stroke, r2 = c - stroke * 2.7;
  const arc = (r, v) => ({ len: 2 * Math.PI * r, off: 2 * Math.PI * r * (1 - Math.max(0, Math.min(1, v ?? 0))) });
  const a1 = arc(r1, face), a2 = arc(r2, keys);
  const tone = fused == null ? 'text-mute' : fused >= accept ? 'text-good' : fused >= stepUp ? 'text-warn' : 'text-bad';
  const Ring = ({ r, a, color, delay }) => (
    <>
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={stroke} />
      <motion.circle
        cx={c} cy={c} r={r} fill="none" stroke={`rgb(var(--${color}))`} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={a.len} initial={{ strokeDashoffset: a.len }} animate={{ strokeDashoffset: a.off }}
        transition={{ duration: 0.9, delay, ease: 'easeOut' }} transform={`rotate(-90 ${c} ${c})`}
      />
    </>
  );
  return (
    <div className="relative inline-block" style={{ width: size, height: size }} role="img" aria-label={`Fused trust ${fused == null ? 'unknown' : Math.round(fused * 100) + ' percent'}`}>
      <svg width={size} height={size}>
        <Ring r={r1} a={a1} color="face" delay={0} />
        <Ring r={r2} a={a2} color="keys" delay={0.15} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-display text-4xl font-bold tabular-nums ${tone}`}>{fused == null ? '--' : Math.round(fused * 100)}</span>
        <span className="text-xs text-mute">{label}</span>
      </div>
    </div>
  );
}
