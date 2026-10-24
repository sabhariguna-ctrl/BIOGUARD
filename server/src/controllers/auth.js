import crypto from 'crypto';
import { z } from 'zod';
import { User } from '../models/User.js';
import { asyncHandler, httpError } from '../utils/httpError.js';
import { signAccess } from '../utils/token.js';
import { appendAudit } from '../services/auditChain.js';
import { issueOtp, checkOtp, discardOtp } from '../services/otp.js';
import { devMode, sendTemplated, publicMailError } from '../utils/mailer.js';
import { notify } from '../services/notify.js';
import { deviceInfo } from '../utils/device.js';

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', 'qwerty123', 'qwertyuiop', 'iloveyou1', 'admin123', 'welcome123', 'letmein123', 'abc12345', '11111111', '00000000', 'pass1234', 'student123', 'bioguard123', 'changeme123']);
const strongPassword = z.string()
  .min(8, 'Password needs at least 8 characters')
  .max(100)
  .regex(/[A-Za-z]/, 'Password needs at least one letter')
  .regex(/[0-9]/, 'Password needs at least one number')
  .refine((p) => !COMMON.has(p.toLowerCase()), 'That password is too common. Choose something harder to guess.');
const code6 = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(60),
  email, password: strongPassword,
  accountType: z.enum(['student', 'faculty']).default('student'),
  rollNo: z.string().max(30).optional(),
  department: z.string().max(60).optional(),
}).refine((d) => !d.password.toLowerCase().includes(d.email.split('@')[0]) || d.email.split('@')[0].length < 4, { message: 'Password must not contain your email name', path: ['password'] });

const SUBJECT = {
  verify_email: ['Verify your BioGuard email', 'Confirm your email address', 'Use this code to finish creating your BioGuard account.'],
  login: ['Your BioGuard login code', 'Your login code', 'Use this code to log in to BioGuard.'],
  reset_password: ['Reset your BioGuard password', 'Reset your password', 'Use this code to choose a new password.'],
};

/** Issue a code, email it, and (dev mode only) hand it back so the UI can show it. */
async function sendCode(addr, purpose) {
  const code = await issueOtp(addr, purpose);
  const [subject, title, intro] = SUBJECT[purpose];
  try {
    await sendTemplated(addr, subject, { title, intro, code, note: 'This code expires in 10 minutes. Never share it with anyone, BioGuard staff will never ask for it.' });
  } catch (e) { await discardOtp(addr, purpose); throw httpError(502, publicMailError(e)); }
  return devMode() ? code : undefined;
}

/** Remember which browsers have signed in; alert the owner when a new one appears. */
async function recordLogin(user, req) {
  const d = deviceInfo(req), now = new Date();
  const known = (user.loginDevices || []).map((x) => ({ hash: x.hash, label: x.label, firstSeen: x.firstSeen, lastSeen: x.lastSeen }));
  const seen = known.some((x) => x.hash === d.hash);
  const list = seen ? known.map((x) => (x.hash === d.hash ? { ...x, lastSeen: now } : x)) : [...known, { hash: d.hash, label: d.label, firstSeen: now, lastSeen: now }].slice(-10);
  await User.updateOne({ _id: user._id }, { $set: { loginDevices: list, lastLogin: now } });
  if (!seen && known.length > 0) {
    notify(user._id, { title: 'New sign-in to your account', body: `${d.label} at ${now.toLocaleString()}`, type: 'warn', link: '/profile' });
    sendTemplated(user.email, 'New sign-in to your BioGuard account', { title: 'New sign-in', intro: `Your account was just accessed from ${d.label}.`, note: 'If this was you, no action is needed. If not, change your password and use "Sign out other devices" in My security.' }).catch(() => {});
  }
}

const session = async (user) => ({ token: signAccess(user), user: await User.findById(user._id) });

export const register = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const wantsFaculty = data.accountType === 'faculty';
  let user = await User.findOne({ email: data.email }).select('+password');
  if (user?.inviteTokenHash) throw httpError(409, 'This email has a pending invitation. Use the link in your invite email.');
  if (user && user.emailVerified !== false) throw httpError(409, 'An account with this email already exists. Log in instead.');
  const extra = { rollNo: data.rollNo, department: data.department, requestedRole: wantsFaculty ? 'faculty' : undefined, approval: wantsFaculty ? 'pending' : 'none' };
  if (user) { // earlier unverified sign-up: refresh details and resend the code
    Object.assign(user, { name: data.name, password: data.password, ...extra });
    await user.save();
  } else {
    user = await User.create({ name: data.name, email: data.email, password: data.password, ...extra, role: 'student', emailVerified: false }); // everyone starts as a student
  }
  const devCode = await sendCode(data.email, 'verify_email');
  appendAudit('REGISTER', { user: user._id, requestedRole: wantsFaculty ? 'faculty' : null }).catch(() => {});
  res.status(201).json({ needsVerification: true, email: data.email, devCode });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const b = z.object({ email, code: code6 }).parse(req.body);
  await checkOtp(b.email, 'verify_email', b.code);
  const user = await User.findOne({ email: b.email });
  if (!user) throw httpError(404, 'Account not found');
  user.emailVerified = true;
  await user.save();
  appendAudit('EMAIL_VERIFIED', { user: user._id }).catch(() => {});
  notify(user._id, { title: 'Welcome to BioGuard', body: 'Your email is verified. Next, enroll your face and typing rhythm.', type: 'success', link: '/enroll' });
  if (user.approval === 'pending') {
    const admins = await User.find({ role: 'admin' }).select('_id');
    admins.forEach((a) => notify(a._id, { title: 'Teacher access requested', body: `${user.name} (${user.email}) wants faculty access.`, type: 'info', link: '/users' }));
  }
  await recordLogin(user, req);
  res.json(await session(user));
});

/** One endpoint for: resend verification code, email me a login code, forgot password. Never reveals whether an account exists. */
export const sendCodeRoute = asyncHandler(async (req, res) => {
  const b = z.object({ email, purpose: z.enum(['verify_email', 'login', 'reset_password']) }).parse(req.body);
  const user = await User.findOne({ email: b.email });
  const alreadyVerified = user && user.emailVerified !== false;
  const eligible = user && !user.inviteTokenHash && !(b.purpose === 'verify_email' && alreadyVerified);
  if (!eligible) return res.json({ ok: true });
  const devCode = await sendCode(b.email, b.purpose);
  res.json({ ok: true, devCode });
});

export const login = asyncHandler(async (req, res) => {
  const b = z.object({ email, password: z.string().min(1).max(100) }).parse(req.body);
  const user = await User.findOne({ email: b.email }).select('+password');
  if (user?.lockUntil && user.lockUntil > new Date()) {
    throw httpError(423, `Too many failed attempts. Try again in ${Math.ceil((user.lockUntil - Date.now()) / 60000)} minute(s), or reset your password with an emailed code.`);
  }
  if (!user || !(await user.compare(b.password))) {
    if (user) {
      user.failedLogins = (user.failedLogins || 0) + 1;
      if (user.failedLogins >= 5) {
        user.lockUntil = new Date(Date.now() + 10 * 60_000); user.failedLogins = 0;
        appendAudit('ACCOUNT_LOCKED', { user: user._id }).catch(() => {});
        notify(user._id, { title: 'Account temporarily locked', body: 'There were 5 failed log-in attempts.', type: 'danger' });
        sendTemplated(user.email, 'BioGuard account temporarily locked', { title: 'Too many failed log-ins', intro: 'Your account is locked for 10 minutes after 5 incorrect password attempts.', note: 'If this was not you, reset your password after the lock ends.' }).catch(() => {});
      }
      await user.save();
    }
    appendAudit('LOGIN_FAILED', { email: b.email }).catch(() => {});
    throw httpError(401, 'Email or password is incorrect');
  }
  if (user.emailVerified === false) {
    throw httpError(403, 'Please verify your email to continue.', { code: 'EMAIL_NOT_VERIFIED', email: user.email });
  }
  user.failedLogins = 0; user.lockUntil = undefined;
  await user.save();
  // second factor by email: always for people who enabled it, and for staff when STAFF_2FA=true
  if (user.twoFactorEmail || (process.env.STAFF_2FA === 'true' && user.role !== 'student')) {
    const devCode = await sendCode(user.email, 'login');
    return res.json({ mfaRequired: true, email: user.email, devCode });
  }
  appendAudit('LOGIN', { user: user._id }).catch(() => {});
  await recordLogin(user, req);
  res.json(await session(user));
});

export const loginWithCode = asyncHandler(async (req, res) => {
  const b = z.object({ email, code: code6 }).parse(req.body);
  await checkOtp(b.email, 'login', b.code);
  const user = await User.findOne({ email: b.email });
  if (!user) throw httpError(401, 'Account not found');
  user.emailVerified = true;
  await user.save();
  appendAudit('LOGIN_CODE', { user: user._id }).catch(() => {});
  await recordLogin(user, req);
  res.json(await session(user));
});

export const resetPassword = asyncHandler(async (req, res) => {
  const b = z.object({ email, code: code6, password: strongPassword }).parse(req.body);
  await checkOtp(b.email, 'reset_password', b.code);
  const user = await User.findOne({ email: b.email }).select('+password');
  if (!user) throw httpError(404, 'Account not found');
  user.password = b.password; user.emailVerified = true; user.failedLogins = 0; user.lockUntil = undefined;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // signs out every existing session
  await user.save();
  appendAudit('PASSWORD_RESET', { user: user._id }).catch(() => {});
  notify(user._id, { title: 'Password changed', body: 'Your password was reset. If this was not you, contact your admin.', type: 'warn' });
  sendTemplated(user.email, 'Your BioGuard password was changed', { title: 'Password changed', intro: 'Your BioGuard password was just reset and all devices were signed out.', note: 'If this was not you, contact your administrator immediately.' }).catch(() => {});
  res.json({ ok: true });
});

export const acceptInvite = asyncHandler(async (req, res) => {
  const b = z.object({ email, token: z.string().min(20), password: strongPassword }).parse(req.body);
  const user = await User.findOne({ email: b.email, inviteTokenHash: crypto.createHash('sha256').update(b.token).digest('hex') }).select('+password');
  if (!user || !user.inviteExpires || user.inviteExpires < new Date()) throw httpError(400, 'This invitation link is invalid or has expired. Ask your admin to send a new one.');
  user.password = b.password; user.emailVerified = true; user.inviteTokenHash = undefined; user.inviteExpires = undefined;
  await user.save();
  appendAudit('INVITE_ACCEPTED', { user: user._id, role: user.role }).catch(() => {});
  await recordLogin(user, req);
  res.json(await session(user));
});

export const me = asyncHandler(async (req, res) => res.json({ user: req.user }));

/** Issues a fresh token so active sessions (including long exams) never expire unexpectedly. */
export const refresh = asyncHandler(async (req, res) => res.json({ token: signAccess(req.user) }));

export const changePassword = asyncHandler(async (req, res) => {
  const { current, next } = z.object({ current: z.string().min(1), next: strongPassword }).parse(req.body);
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.compare(current))) throw httpError(400, 'Current password is incorrect');
  user.password = next;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  appendAudit('PASSWORD_CHANGED', { user: user._id }).catch(() => {});
  notify(user._id, { title: 'Password changed', body: 'Your password was updated and other devices were signed out.', type: 'info' });
  res.json({ ok: true, token: signAccess(user) }); // keep this session alive
});

export const logoutOthers = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  appendAudit('SESSIONS_REVOKED', { user: user._id }).catch(() => {});
  res.json({ ok: true, token: signAccess(user) });
});

export const setTwoFactor = asyncHandler(async (req, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  await User.updateOne({ _id: req.user._id }, { twoFactorEmail: enabled });
  appendAudit(enabled ? 'TWO_FACTOR_ENABLED' : 'TWO_FACTOR_DISABLED', { user: req.user._id }).catch(() => {});
  notify(req.user._id, { title: enabled ? 'Email two-step login turned on' : 'Email two-step login turned off', type: enabled ? 'success' : 'warn' });
  res.json({ ok: true, user: await User.findById(req.user._id) });
});
