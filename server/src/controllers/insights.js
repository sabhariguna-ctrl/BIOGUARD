import { Attempt } from '../models/Attempt.js';
import { AuthEvent } from '../models/AuthEvent.js';
import { Exam } from '../models/Exam.js';
import { User } from '../models/User.js';
import { asyncHandler, httpError } from '../utils/httpError.js';

/** Risk watchlist (students with flags / low trust) and failures by hour of day. */
export const risk = asyncHandler(async (_req, res) => {
  const [top, hours] = await Promise.all([
    Attempt.aggregate([
      { $group: { _id: '$student', attempts: { $sum: 1 }, flags: { $sum: { $size: { $ifNull: ['$flags', []] } } }, avgTrust: { $avg: '$trust' }, terminated: { $sum: { $cond: [{ $eq: ['$status', 'terminated'] }, 1, 0] } } } },
      { $sort: { flags: -1, avgTrust: 1 } }, { $limit: 8 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } }, { $unwind: '$u' },
      { $project: { name: '$u.name', rollNo: '$u.rollNo', attempts: 1, flags: 1, avgTrust: 1, terminated: 1 } },
    ]),
    AuthEvent.aggregate([
      { $match: { synthetic: { $ne: true }, mode: { $ne: 'test' } } },
      { $group: { _id: { h: { $hour: '$createdAt' }, d: '$decision' }, n: { $sum: 1 } } },
    ]),
  ]);
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, ACCEPT: 0, STEP_UP: 0, REJECT: 0 }));
  hours.forEach(({ _id, n }) => { if (byHour[_id.h] && _id.d) byHour[_id.h][_id.d] = n; });
  res.json({ top: top.filter((t) => t.flags > 0 || t.terminated > 0 || t.avgTrust < 0.75), byHour });
});

/** Per-question difficulty for an exam (percent answered correctly). */
export const examStats = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw httpError(404, 'Exam not found');
  const done = await Attempt.find({ exam: exam._id, status: 'submitted' });
  const n = done.length;
  res.json({
    title: exam.title, attempts: n,
    avgScore: n ? done.reduce((s, a) => s + (a.score || 0), 0) / n : null,
    avgTrust: n ? done.reduce((s, a) => s + a.trust, 0) / n : null,
    questions: exam.questions.map((q, i) => {
      const correct = done.filter((a) => a.answers[i] === q.answerIndex).length;
      return { n: i + 1, text: q.text.slice(0, 70), correct, pct: n ? Math.round((correct / n) * 100) : 0 };
    }),
  });
});

/** Student directory for faculty and admin: enrollment status and exam history summary (computed in JS, no heavy aggregation). */
export const listStudents = asyncHandler(async (_req, res) => {
  const students = await User.find({ role: 'student', emailVerified: { $ne: false } }).sort({ name: 1 }).limit(1000);
  const attempts = await Attempt.find({ student: { $in: students.map((s) => s._id) } }).select('student status trust flags').lean();
  const stats = new Map();
  for (const a of attempts) {
    const k = String(a.student);
    const o = stats.get(k) || { attempts: 0, submitted: 0, terminated: 0, flags: 0, trustSum: 0 };
    o.attempts += 1; o.trustSum += a.trust ?? 1; o.flags += a.flags?.length || 0;
    if (a.status === 'submitted') o.submitted += 1;
    if (a.status === 'terminated') o.terminated += 1;
    stats.set(k, o);
  }
  res.json(students.map((s) => {
    const o = stats.get(String(s._id)) || { attempts: 0, submitted: 0, terminated: 0, flags: 0, trustSum: 0 };
    return {
      _id: s._id, name: s.name, email: s.email, rollNo: s.rollNo, department: s.department,
      enrolled: { face: !!s.enrolled?.face, keystroke: !!s.enrolled?.keystroke }, lastLogin: s.lastLogin, createdAt: s.createdAt,
      attempts: o.attempts, submitted: o.submitted, terminated: o.terminated, flags: o.flags, avgTrust: o.attempts ? o.trustSum / o.attempts : null,
    };
  }));
});
