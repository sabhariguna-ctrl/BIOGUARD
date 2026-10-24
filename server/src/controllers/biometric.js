import { z } from 'zod';
import { BiometricTemplate } from '../models/BiometricTemplate.js';
import { User } from '../models/User.js';
import { asyncHandler, httpError } from '../utils/httpError.js';
import { issueChallenge } from '../services/liveness.js';
import { buildTemplate } from '../services/keystroke.js';
import { runVerification } from '../services/verification.js';
import { appendAudit } from '../services/auditChain.js';
import { signPass, verifyToken } from '../utils/token.js';
import { devMode, sendTemplated } from '../utils/mailer.js';
import { issueOtp, checkOtp, discardOtp } from '../services/otp.js';
import { notify } from '../services/notify.js';
import { deviceInfo } from '../utils/device.js';

export const status = asyncHandler(async (req, res) => {
  const t = await BiometricTemplate.findOne({ user: req.user._id });
  res.json({
    faceSamples: t?.faceTemplates?.length || 0,
    keystrokeSamples: t?.keystroke?.samples || 0,
    phrase: t?.keystroke?.phrase || null,
    enrolled: !!(t?.faceTemplates?.length >= 3 && t?.keystroke?.samples >= 5),
  });
});

export const challenge = (req, res) => res.json(issueChallenge(req.user._id));

export const enrollFace = asyncHandler(async (req, res) => {
  const { descriptors } = z.object({ descriptors: z.array(z.array(z.number()).length(128)).min(3).max(8) }).parse(req.body);
  await BiometricTemplate.findOneAndUpdate({ user: req.user._id }, { faceTemplates: descriptors.map((vec) => ({ vec })) }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await User.updateOne({ _id: req.user._id }, { 'enrolled.face': true });
  appendAudit('ENROLL_FACE', { user: req.user._id, samples: descriptors.length }).catch(() => {});
  res.json({ ok: true });
});

const evSchema = z.object({ k: z.string().max(3), d: z.number(), u: z.number() });
export const enrollKeystroke = asyncHandler(async (req, res) => {
  const { phrase, samples } = z.object({
    phrase: z.string().min(12).max(60),
    samples: z.array(z.array(evSchema)).min(5).max(12),
  }).parse(req.body);
  if (samples.some((s) => s.length !== phrase.length)) throw httpError(400, 'Each sample must match the phrase length. Retype without corrections.');
  const keystroke = buildTemplate(phrase, samples);
  await BiometricTemplate.findOneAndUpdate({ user: req.user._id }, { keystroke }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await User.updateOne({ _id: req.user._id }, { 'enrolled.keystroke': true });
  appendAudit('ENROLL_KEYSTROKE', { user: req.user._id, samples: samples.length }).catch(() => {});
  res.json({ ok: true });
});

export const removeTemplates = asyncHandler(async (req, res) => {
  await BiometricTemplate.deleteOne({ user: req.user._id });
  await User.updateOne({ _id: req.user._id }, { 'enrolled.face': false, 'enrolled.keystroke': false });
  appendAudit('TEMPLATES_ERASED', { user: req.user._id }).catch(() => {});
  res.json({ ok: true });
});

export const verify = asyncHandler(async (req, res) => {
  const mode = req.body.mode === 'test' ? 'test' : 'login';
  const result = await runVerification({ user: req.user, body: req.body, mode, ip: req.ip, device: deviceInfo(req) });
  const out = { ...result };
  if (result.decision === 'ACCEPT') out.passToken = signPass(req.user._id);
  if (result.decision === 'STEP_UP') {
    try {
      const code = await issueOtp(req.user.email, 'step_up', { minutes: 5, cooldownSec: 0, meta: result.newDevice ? { device: deviceInfo(req) } : null });
      await sendTemplated(req.user.email, 'Your BioGuard verification code', {
        title: result.newDevice ? 'New device verification' : 'Extra verification needed',
        intro: result.newDevice ? `We noticed a sign-in from a new device (${deviceInfo(req).label}). Enter this code to confirm it is you.` : 'Your face and typing scores were borderline, so we need one more check. Enter this code to continue.',
        code, note: 'This code expires in 5 minutes. If this was not you, do not share the code and change your password.',
      });
      out.otpSent = true;
      if (devMode()) out.devCode = code;
      if (result.newDevice) notify(req.user._id, { title: 'New device check', body: `Sign-in attempt from ${deviceInfo(req).label}`, type: 'warn', link: '/profile' });
    } catch (e) { await discardOtp(req.user.email, 'step_up').catch(() => {}); out.otpError = e.message; }
  }
  res.json(out);
});

export const stepUp = asyncHandler(async (req, res) => {
  const { otp } = z.object({ otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }).parse(req.body);
  const rec = await checkOtp(req.user.email, 'step_up', otp);
  if (rec.meta?.device) await User.updateOne({ _id: req.user._id }, { $push: { devices: { ...rec.meta.device, firstSeen: new Date(), lastSeen: new Date() } } });
  appendAudit('STEP_UP_PASSED', { user: req.user._id }).catch(() => {});
  res.json({ passToken: signPass(req.user._id) });
});

export const assertPass = (token, userId) => {
  try {
    const p = verifyToken(token);
    return p.purpose === 'pass' && p.id === userId.toString();
  } catch { return false; }
};
