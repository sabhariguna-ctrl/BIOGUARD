import crypto from 'crypto';
import { z } from 'zod';
import { User } from '../models/User.js';
import { asyncHandler, httpError } from '../utils/httpError.js';
import { appendAudit } from '../services/auditChain.js';
import { devMode, isMailConfigured, provider, sendTemplated } from '../utils/mailer.js';
import { MailLog } from '../models/MailLog.js';
import { notify } from '../services/notify.js';
import { adminEmail } from '../services/bootstrap.js';

const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');

async function sendInvite(user, invitedBy) {
  const token = crypto.randomBytes(24).toString('hex');
  user.inviteTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  user.inviteExpires = new Date(Date.now() + 7 * 86400_000);
  const url = `${clientUrl()}/accept-invite?token=${token}&email=${encodeURIComponent(user.email)}`;
  await sendTemplated(user.email, `${invitedBy} invited you to BioGuard`, {
    title: `You are invited as ${user.role}`,
    intro: `${invitedBy} added you to BioGuard. Set your password to activate your account.`,
    button: { label: 'Set password and join', url },
    note: 'This link works for 7 days.',
  });
  await user.save();
  return url;
}

/** Admin invites faculty/admin/student by email; they set their own password. */
export const invite = asyncHandler(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(2).max(60), email: z.string().trim().toLowerCase().email(), role: z.enum(['faculty', 'student']) }).parse(req.body);
  if (b.email === adminEmail()) throw httpError(409, 'That email is the administrator account.');
  if (await User.findOne({ email: b.email })) throw httpError(409, 'A user with this email already exists');
  const user = new User({ ...b, password: crypto.randomBytes(24).toString('hex'), emailVerified: false });
  const url = await sendInvite(user, req.user.name); // saves the user only if the email was sent
  appendAudit('USER_INVITED', { user: user._id, role: user.role, by: req.user._id }).catch(() => {});
  res.status(201).json({ user: await User.findById(user._id), devLink: devMode() ? url : undefined });
});

export const resendInvite = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || !user.inviteTokenHash) throw httpError(400, 'This user has no pending invitation');
  const url = await sendInvite(user, req.user.name);
  res.json({ ok: true, devLink: devMode() ? url : undefined });
});

/** Admin or faculty invite many students at once from a CSV list (max 100 per request). */
export const bulkInvite = asyncHandler(async (req, res) => {
  const b = z.object({
    role: z.enum(['student', 'faculty']).default('student'),
    rows: z.array(z.object({ name: z.string().optional(), email: z.string().optional(), rollNo: z.string().optional(), department: z.string().optional() })).min(1, 'Add at least one row').max(100, 'Send at most 100 people at a time'),
  }).parse(req.body);
  if (b.role !== 'student' && req.user.role !== 'admin') throw httpError(403, 'Only admins can invite faculty or admins');
  const rowSchema = z.object({ name: z.string().trim().min(2).max(60), email: z.string().trim().toLowerCase().email(), rollNo: z.string().trim().max(30).optional(), department: z.string().trim().max(60).optional() });
  const out = { sent: 0, skipped: [], failed: [], stopped: false };
  const seen = new Set();
  for (const raw of b.rows) {
    const p = rowSchema.safeParse(raw);
    if (!p.success) { out.failed.push({ email: raw.email || '(missing)', error: 'Invalid name or email' }); continue; }
    const row = p.data;
    if (seen.has(row.email)) { out.skipped.push({ email: row.email, reason: 'Duplicate in this list' }); continue; }
    seen.add(row.email);
    if (await User.findOne({ email: row.email })) { out.skipped.push({ email: row.email, reason: 'Already has an account' }); continue; }
    try {
      await sendInvite(new User({ ...row, role: b.role, password: crypto.randomBytes(24).toString('hex'), emailVerified: false }), req.user.name);
      out.sent += 1;
    } catch (e) {
      out.failed.push({ email: row.email, error: e.message });
      if (e.status === 502) { out.stopped = true; break; } // provider problem: do not hammer it
    }
  }
  appendAudit('USERS_BULK_INVITED', { by: req.user._id, sent: out.sent, role: b.role }).catch(() => {});
  res.json(out);
});

/** Teacher sign-up requests: approve to grant faculty access, or decline. */
export const approveRequest = asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u || u.approval !== 'pending') throw httpError(400, 'There is no pending request for this user');
  u.role = u.requestedRole || 'faculty'; u.approval = 'approved'; u.requestedRole = undefined;
  await u.save();
  appendAudit('FACULTY_APPROVED', { user: u._id, by: req.user._id }).catch(() => {});
  notify(u._id, { title: 'Teacher access approved', body: 'You can now create exams and use live proctoring.', type: 'success', link: '/' });
  sendTemplated(u.email, 'Your BioGuard teacher access was approved', { title: 'Teacher access approved', intro: 'An administrator approved your request. Log in again to see the faculty tools.' }).catch(() => {});
  res.json(await User.findById(u._id));
});

export const rejectRequest = asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u || u.approval !== 'pending') throw httpError(400, 'There is no pending request for this user');
  u.approval = 'rejected'; u.requestedRole = undefined;
  await u.save();
  appendAudit('FACULTY_DECLINED', { user: u._id, by: req.user._id }).catch(() => {});
  notify(u._id, { title: 'Teacher access declined', body: 'Your account stays a student account. Contact your admin if this is a mistake.', type: 'warn' });
  res.json(await User.findById(u._id));
});

const mask = (v) => (v ? `${v.slice(0, 4)}...${v.slice(-3)}` : null);

export const mailStatus = asyncHandler(async (_req, res) => {
  const p = provider();
  const u = process.env.SMTP_USER || '';
  const key = process.env.BREVO_API_KEY || process.env.RESEND_API_KEY || '';
  const warnings = [];
  if (p === 'smtp' && /unga-email|your-email|example\.com|<.*>/i.test(u)) warnings.push('SMTP_USER still looks like example text. Use your full real Gmail address.');
  if (p === 'smtp' && /16-letter|app-password|your-app|xxxx/i.test(process.env.SMTP_PASS || '')) warnings.push('SMTP_PASS still looks like example text. Use the 16-letter Google App Password.');
  if (p === 'smtp' && process.env.RENDER) warnings.push('You appear to be on Render, which blocks SMTP on free plans. Switch to BREVO_API_KEY.');
  if (p && !process.env.MAIL_FROM && p !== 'smtp') warnings.push('MAIL_FROM is not set. Use: BioGuard <your-verified-sender@example.com>');
  if (p === 'resend') warnings.push('Resend only delivers to other people after you verify a domain. Brevo is easier for student projects.');
  if (!p && process.env.NODE_ENV === 'production') warnings.push('No email provider configured in production: nobody can receive codes.');
  res.json({
    configured: isMailConfigured(), devMode: devMode(), provider: p || 'none',
    host: process.env.SMTP_HOST || null, port: Number(process.env.SMTP_PORT) || 587,
    user: u ? u.replace(/^(.{2}).*(@.*)$/, '$1***$2') : null,
    apiKey: p === 'brevo' || p === 'resend' ? mask(key) : null,
    from: process.env.MAIL_FROM || u || null,
    production: process.env.NODE_ENV === 'production', staff2fa: process.env.STAFF_2FA === 'true', adminEmail: adminEmail(),
    warnings,
  });
});

export const mailLogs = asyncHandler(async (_req, res) => res.json(await MailLog.find().sort({ createdAt: -1 }).limit(30)));

export const testEmail = asyncHandler(async (req, res) => {
  const { to } = z.object({ to: z.string().email().optional() }).parse(req.body || {});
  const target = to || req.user.email;
  await sendTemplated(target, 'BioGuard test email', { title: 'Email is working', intro: 'This is a test message from your BioGuard server. OTP codes, invitations and alerts will be delivered the same way.', code: '123456' });
  res.json({ ok: true, to: target, dev: !isMailConfigured() });
});
