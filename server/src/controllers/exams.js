import { z } from 'zod';
import { Exam } from '../models/Exam.js';
import { Attempt } from '../models/Attempt.js';
import { AuthEvent } from '../models/AuthEvent.js';
import { asyncHandler, httpError } from '../utils/httpError.js';
import { assertPass } from './biometric.js';
import { runVerification } from '../services/verification.js';
import { appendAudit } from '../services/auditChain.js';
import { notify } from '../services/notify.js';
import { User } from '../models/User.js';
import { emitProctors, emitUser } from '../utils/realtime.js';

const examSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(500).optional(),
  durationMin: z.number().int().min(1).max(300),
  heartbeatSec: z.number().int().min(15).max(300).default(45),
  acceptThreshold: z.number().min(0.4).max(0.99).default(0.75),
  stepUpThreshold: z.number().min(0.2).max(0.9).default(0.55),
  published: z.boolean().default(true),
  shuffle: z.boolean().default(true),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  questions: z.array(z.object({
    text: z.string().min(3),
    options: z.array(z.string().min(1)).min(2).max(6),
    answerIndex: z.number().int().min(0),
  })).min(1),
});

const publicExam = (e) => {
  const o = e.toObject();
  o.questions = o.questions.map(({ answerIndex, ...q }) => q);
  return o;
};

export const listExams = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'student' ? { published: true } : {};
  const exams = await Exam.find(filter).sort({ createdAt: -1 });
  const mine = req.user.role === 'student' ? await Attempt.find({ student: req.user._id }) : [];
  res.json(exams.map((e) => ({
    ...(req.user.role === 'student' ? publicExam(e) : e.toObject()),
    attempt: mine.find((a) => a.exam.equals(e._id)) || null,
    questionCount: e.questions.length,
  })));
});

export const getExam = asyncHandler(async (req, res) => {
  const e = await Exam.findById(req.params.id);
  if (!e) throw httpError(404, 'Exam not found');
  res.json(req.user.role === 'student' ? publicExam(e) : e);
});

export const createExam = asyncHandler(async (req, res) => {
  const data = examSchema.parse(req.body);
  data.questions.forEach((q) => { if (q.answerIndex >= q.options.length) throw httpError(400, 'Correct answer must be one of the options'); });
  if (data.stepUpThreshold >= data.acceptThreshold) throw httpError(400, 'Step-up threshold must be lower than accept threshold');
  const exam = await Exam.create({ ...data, createdBy: req.user._id });
  appendAudit('EXAM_CREATED', { exam: exam._id, by: req.user._id }).catch(() => {});
  if (exam.published) User.find({ role: 'student' }).select('_id').then((us) => us.forEach((u) => notify(u._id, { title: 'New exam available', body: exam.title, type: 'info', link: '/exams' }))).catch(() => {});
  res.status(201).json(exam);
});

export const updateExam = asyncHandler(async (req, res) => {
  const data = examSchema.parse(req.body);
  if (data.stepUpThreshold >= data.acceptThreshold) throw httpError(400, 'Step-up threshold must be lower than accept threshold');
  const exam = await Exam.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!exam) throw httpError(404, 'Exam not found');
  res.json(exam);
});

export const deleteExam = asyncHandler(async (req, res) => {
  await Exam.findByIdAndDelete(req.params.id);
  await Attempt.deleteMany({ exam: req.params.id });
  res.json({ ok: true });
});

// ---- attempts ----
export const startAttempt = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam || !exam.published) throw httpError(404, 'Exam not found');
  if (!assertPass(req.body.passToken, req.user._id)) throw httpError(403, 'Verify your identity before starting the exam');
  let attempt = await Attempt.findOne({ exam: exam._id, student: req.user._id });
  if (exam.startsAt && exam.startsAt > new Date()) throw httpError(400, `This exam opens on ${exam.startsAt.toLocaleString()}`);
  if (!attempt && exam.endsAt && exam.endsAt < new Date()) throw httpError(400, 'This exam window has closed');
  if (attempt && attempt.status !== 'active') throw httpError(400, `This exam was already ${attempt.status}`);
  if (!attempt) attempt = await Attempt.create({ exam: exam._id, student: req.user._id, answers: exam.questions.map(() => -1) });
  attempt.lastVerifiedAt = new Date();
  await attempt.save();
  appendAudit('EXAM_STARTED', { exam: exam._id, user: req.user._id, attempt: attempt._id }).catch(() => {});
  emitProctors('attempt:update', { id: attempt._id, exam: { id: exam._id, title: exam.title }, student: { id: req.user._id, name: req.user.name }, status: 'active', trust: attempt.trust, startedAt: attempt.startedAt });
  const deadline = new Date(attempt.startedAt.getTime() + exam.durationMin * 60_000);
  res.json({ attempt, exam: publicExam(exam), deadline });
});

const ownAttempt = async (req) => {
  const a = await Attempt.findById(req.params.id).populate('exam');
  if (!a || !a.student.equals(req.user._id)) throw httpError(404, 'Attempt not found');
  return a;
};

export const heartbeat = asyncHandler(async (req, res) => {
  const a = await ownAttempt(req);
  if (a.status !== 'active') return res.json({ status: a.status, decision: 'REJECT', trust: a.trust });
  const r = await runVerification({ user: req.user, body: req.body, mode: 'continuous', attempt: a, exam: a.exam, ip: req.ip, device: null });
  a.trust = +(0.6 * a.trust + 0.4 * r.fused).toFixed(4);
  a.rejects = r.decision === 'ACCEPT' ? 0 : a.rejects + (r.decision === 'REJECT' ? 1 : 0.5);
  a.lastVerifiedAt = new Date();
  if (r.decision !== 'ACCEPT') a.flags.push({ type: r.decision === 'REJECT' ? 'identity_mismatch' : 'identity_uncertain', detail: r.reason || `fused ${r.fused.toFixed(2)}` });
  if (a.rejects >= 3) {
    a.status = 'terminated';
    a.submittedAt = new Date();
    a.flags.push({ type: 'terminated', detail: 'Repeated failed identity checks' });
    appendAudit('EXAM_TERMINATED', { attempt: a._id, user: req.user._id, trust: a.trust }).catch(() => {});
    notify(req.user._id, { title: 'Exam ended automatically', body: 'Several identity checks failed in a row.', type: 'danger', link: '/results' });
  }
  await a.save();
  emitProctors('attempt:update', { id: a._id, exam: { id: a.exam._id, title: a.exam.title }, student: { id: req.user._id, name: req.user.name }, status: a.status, trust: a.trust, lastDecision: r.decision, fused: r.fused, flags: a.flags.length });
  res.json({ decision: r.decision, fused: r.fused, faceScore: r.faceScore, keyScore: r.keyScore, trust: a.trust, status: a.status, explain: r.explain });
});

export const flagAttempt = asyncHandler(async (req, res) => {
  const a = await ownAttempt(req);
  const { type, detail } = z.object({ type: z.enum(['tab_switch', 'fullscreen_exit', 'paste', 'copy']), detail: z.string().max(100).optional() }).parse(req.body);
  if (a.status !== 'active') return res.json({ ok: true });
  a.flags.push({ type, detail });
  a.trust = Math.max(0, +(a.trust - 0.03).toFixed(4));
  await a.save();
  emitProctors('attempt:update', { id: a._id, exam: { id: a.exam._id, title: a.exam.title }, student: { id: req.user._id, name: req.user.name }, status: a.status, trust: a.trust, flags: a.flags.length, lastFlag: type });
  res.json({ trust: a.trust });
});

export const submitAttempt = asyncHandler(async (req, res) => {
  const a = await ownAttempt(req);
  if (a.status !== 'active') throw httpError(400, 'This attempt is already closed');
  const { answers } = z.object({ answers: z.array(z.number().int()) }).parse(req.body);
  const qs = a.exam.questions;
  a.answers = qs.map((_, i) => answers[i] ?? -1);
  a.score = qs.reduce((s, q, i) => s + (a.answers[i] === q.answerIndex ? 1 : 0), 0);
  a.total = qs.length;
  a.status = 'submitted';
  a.submittedAt = new Date();
  await a.save();
  appendAudit('EXAM_SUBMITTED', { attempt: a._id, user: req.user._id, trust: a.trust }).catch(() => {});
  emitProctors('attempt:update', { id: a._id, exam: { id: a.exam._id, title: a.exam.title }, student: { id: req.user._id, name: req.user.name }, status: 'submitted', trust: a.trust });
  res.json({ score: a.score, total: a.total, trust: a.trust });
});

export const listAttempts = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'student' ? { student: req.user._id } : {};
  if (req.query.exam) filter.exam = req.query.exam;
  if (req.query.student && req.user.role !== 'student') filter.student = req.query.student;
  if (req.query.status) filter.status = req.query.status;
  const items = await Attempt.find(filter).sort({ createdAt: -1 }).limit(200).populate('exam', 'title').populate('student', 'name email rollNo');
  res.json(items);
});

export const attemptTimeline = asyncHandler(async (req, res) => {
  const a = await Attempt.findById(req.params.id).populate('exam', 'title').populate('student', 'name rollNo');
  if (!a) throw httpError(404, 'Attempt not found');
  if (req.user.role === 'student' && !a.student._id.equals(req.user._id)) throw httpError(403, 'Not allowed');
  const events = await AuthEvent.find({ attempt: a._id }).sort({ createdAt: 1 }).select('fused faceScore keyScore decision reason createdAt');
  res.json({ attempt: a, events });
});

// ---- proctor actions (faculty/admin -> student, real time) ----
export const warnAttempt = asyncHandler(async (req, res) => {
  const { message } = z.object({ message: z.string().min(2).max(200) }).parse(req.body);
  const a = await Attempt.findById(req.params.id);
  if (!a || a.status !== 'active') throw httpError(400, 'Attempt is not active');
  a.flags.push({ type: 'proctor_warning', detail: message });
  await a.save();
  emitUser(a.student, 'proctor:warn', { message, by: req.user.name });
  notify(a.student, { title: `Message from ${req.user.name}`, body: message, type: 'warn' });
  appendAudit('PROCTOR_WARNING', { attempt: a._id, by: req.user._id, message }).catch(() => {});
  res.json({ ok: true });
});

export const terminateAttempt = asyncHandler(async (req, res) => {
  const a = await Attempt.findById(req.params.id).populate('exam', 'title').populate('student', 'name');
  if (!a || a.status !== 'active') throw httpError(400, 'Attempt is not active');
  a.status = 'terminated'; a.submittedAt = new Date();
  a.flags.push({ type: 'terminated_by_proctor', detail: req.user.name });
  await a.save();
  emitUser(a.student._id, 'attempt:terminated', { by: req.user.name });
  notify(a.student._id, { title: 'Exam ended by proctor', body: a.exam.title, type: 'danger', link: '/results' });
  emitProctors('attempt:update', { id: a._id, exam: { id: a.exam._id, title: a.exam.title }, student: { id: a.student._id, name: a.student.name }, status: 'terminated', trust: a.trust, flags: a.flags.length });
  appendAudit('EXAM_TERMINATED_BY_PROCTOR', { attempt: a._id, by: req.user._id }).catch(() => {});
  res.json({ ok: true });
});

export const exportAttempts = asyncHandler(async (req, res) => {
  const filter = req.query.exam ? { exam: req.query.exam } : {};
  const items = await Attempt.find(filter).sort({ createdAt: -1 }).populate('exam', 'title').populate('student', 'name email rollNo');
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const rows = [['Student', 'Email', 'Roll no', 'Exam', 'Status', 'Score', 'Total', 'Trust %', 'Flags', 'Submitted at']];
  items.forEach((a) => rows.push([a.student?.name, a.student?.email, a.student?.rollNo, a.exam?.title, a.status, a.score, a.total, Math.round(a.trust * 100), a.flags.length, a.submittedAt?.toISOString()]));
  res.type('text/csv').send(rows.map((r) => r.map(esc).join(',')).join('\n'));
});
