import { z } from 'zod';
import { User } from '../models/User.js';
import { Exam } from '../models/Exam.js';
import { Attempt } from '../models/Attempt.js';
import { AuthEvent } from '../models/AuthEvent.js';
import { AuditBlock } from '../models/AuditBlock.js';
import { BiometricTemplate } from '../models/BiometricTemplate.js';
import { asyncHandler, httpError } from '../utils/httpError.js';
import { verifyChain, appendAudit } from '../services/auditChain.js';
import { adminEmail } from '../services/bootstrap.js';

export const listUsers = asyncHandler(async (_req, res) => res.json(await User.find().sort({ createdAt: -1 })));

export const setRole = asyncHandler(async (req, res) => {
  const { role } = z.object({ role: z.enum(['faculty', 'student'], { errorMap: () => ({ message: 'Only faculty or student roles can be assigned. The administrator is fixed by ADMIN_EMAIL.' }) }) }).parse(req.body);
  if (req.params.id === req.user._id.toString()) throw httpError(400, 'You cannot change your own role');
  const target = await User.findById(req.params.id);
  if (!target) throw httpError(404, 'User not found');
  if (target.email === adminEmail()) throw httpError(400, 'The administrator role cannot be changed');
  await User.updateOne({ _id: req.params.id }, { role });
  const u = await User.findById(req.params.id);
  appendAudit('ROLE_CHANGED', { user: req.params.id, role, by: req.user._id }).catch(() => {});
  res.json(u);
});

export const deleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user._id.toString()) throw httpError(400, 'You cannot delete your own account');
  if ((await User.findById(req.params.id))?.email === adminEmail()) throw httpError(400, 'The administrator account cannot be deleted');
  await User.deleteOne({ _id: req.params.id });
  await BiometricTemplate.deleteOne({ user: req.params.id });
  appendAudit('USER_DELETED', { user: req.params.id, by: req.user._id }).catch(() => {});
  res.json({ ok: true });
});

export const overview = asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - 14 * 86400_000);
  const [users, exams, attempts, active, events, byDecision, daily, avg] = await Promise.all([
    User.countDocuments(), Exam.countDocuments(), Attempt.countDocuments(), Attempt.countDocuments({ status: 'active' }),
    AuthEvent.countDocuments({ synthetic: { $ne: true } }),
    AuthEvent.aggregate([{ $match: { synthetic: { $ne: true } } }, { $group: { _id: '$decision', n: { $sum: 1 } } }]),
    AuthEvent.aggregate([
      { $match: { createdAt: { $gte: since }, synthetic: { $ne: true } } },
      { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, d: '$decision' }, n: { $sum: 1 } } },
    ]),
    AuthEvent.aggregate([{ $match: { synthetic: { $ne: true } } }, { $group: { _id: null, avg: { $avg: '$fused' } } }]),
  ]);
  const days = {};
  daily.forEach(({ _id, n }) => { (days[_id.day] ||= { day: _id.day, ACCEPT: 0, STEP_UP: 0, REJECT: 0 })[_id.d] = n; });
  res.json({
    users, exams, attempts, active, events, avgFused: avg[0]?.avg ?? null,
    decisions: byDecision.map((d) => ({ name: d._id, value: d.n })),
    daily: Object.values(days).sort((a, b) => a.day.localeCompare(b.day)),
  });
});

/** FAR / FRR / EER from labelled genuine vs impostor fused scores. */
export const performance = asyncHandler(async (_req, res) => {
  const ev = await AuthEvent.find({ label: { $in: ['genuine', 'impostor'] }, fused: { $ne: null } }).select('label fused synthetic faceScore keyScore').lean();
  const gen = ev.filter((e) => e.label === 'genuine').map((e) => e.fused);
  const imp = ev.filter((e) => e.label === 'impostor').map((e) => e.fused);
  const points = [];
  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    points.push({
      t: +t.toFixed(2),
      far: imp.length ? imp.filter((s) => s >= t).length / imp.length : 0,
      frr: gen.length ? gen.filter((s) => s < t).length / gen.length : 0,
    });
  }
  const eerPt = points.reduce((b, p) => (Math.abs(p.far - p.frr) < Math.abs(b.far - b.frr) ? p : b), points[0]);
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const unimodal = (field) => {
    const g = ev.filter((e) => e.label === 'genuine' && e[field] != null).map((e) => e[field]);
    const im = ev.filter((e) => e.label === 'impostor' && e[field] != null).map((e) => e[field]);
    let best = { gap: 2, t: 0.5, v: 0 };
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      const far = im.length ? im.filter((s) => s >= t).length / im.length : 0;
      const frr = g.length ? g.filter((s) => s < t).length / g.length : 0;
      if (Math.abs(far - frr) < best.gap) best = { gap: Math.abs(far - frr), t, v: (far + frr) / 2 };
    }
    return g.length && im.length ? +best.v.toFixed(4) : null;
  };
  res.json({
    points, nGenuine: gen.length, nImpostor: imp.length,
    eer: { threshold: eerPt.t, value: +((eerPt.far + eerPt.frr) / 2).toFixed(4) },
    eerByModality: { fusion: +((eerPt.far + eerPt.frr) / 2).toFixed(4), face: unimodal('faceScore'), keystroke: unimodal('keyScore') },
    meanGenuine: avg(gen), meanImpostor: avg(imp),
    hist: Array.from({ length: 20 }, (_, i) => ({
      bin: +(i / 20).toFixed(2),
      genuine: gen.filter((s) => s >= i / 20 && s < (i + 1) / 20).length,
      impostor: imp.filter((s) => s >= i / 20 && s < (i + 1) / 20).length,
    })),
  });
});

export const recentEvents = asyncHandler(async (_req, res) => {
  res.json(await AuthEvent.find({ synthetic: { $ne: true } }).sort({ createdAt: -1 }).limit(40).populate('user', 'name'));
});

export const auditList = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const blocks = await AuditBlock.find().sort({ index: -1 }).limit(limit).lean();
  res.json(blocks.map((b) => ({ index: b.index, hash: b.hash, prevHash: b.prevHash, ...JSON.parse(b.payload) })));
});
export const auditVerify = asyncHandler(async (_req, res) => res.json(await verifyChain()));
