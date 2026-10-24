import { BiometricTemplate } from '../models/BiometricTemplate.js';
import { AuthEvent } from '../models/AuthEvent.js';
import { User } from '../models/User.js';
import { httpError } from '../utils/httpError.js';
import { fuse } from './fusion.js';
import { scoreFace, computeQuality } from './faceMatch.js';
import { scorePhrase, scoreFree, updateTemplate } from './keystroke.js';
import { consumeChallenge } from './liveness.js';
import { appendAudit } from './auditChain.js';
import { explain } from './explain.js';
import { emitProctors } from '../utils/realtime.js';

const faceVec = (t) => (Array.isArray(t) ? t : t.vec);

export const thresholdsFor = (exam) => ({
  accept: exam?.acceptThreshold ?? (Number(process.env.ACCEPT_THRESHOLD) || 0.75),
  stepUp: exam?.stepUpThreshold ?? (Number(process.env.STEPUP_THRESHOLD) || 0.55),
});

/**
 * Core multimodal verification: face + keystroke + liveness + device context -> fused decision.
 * mode: 'login' (liveness + device check) | 'continuous' (during exam) | 'test' (evaluation, labelled)
 */
export async function runVerification({ user, body, mode, attempt = null, exam = null, ip, device = null }) {
  const tpl = await BiometricTemplate.findOne({ user: user._id });
  if (!tpl || !tpl.faceTemplates?.length) throw httpError(400, 'Complete biometric enrollment first');

  let faceScore = null, keyScore = null, faceQuality = 0.5, faceDistance = null, samePhrase = false;
  if (body.noFace) {
    faceScore = 0; faceQuality = 0.3;
  } else if (Array.isArray(body.descriptor) && body.descriptor.length === 128) {
    const r = scoreFace(tpl.faceTemplates.map(faceVec), body.descriptor);
    faceScore = r.score; faceDistance = r.distance;
    faceQuality = computeQuality(body.quality);
  }
  const ev = body.keystroke?.events;
  if (Array.isArray(ev) && ev.length >= 8 && tpl.keystroke?.mean?.length) {
    samePhrase = body.keystroke.phrase === tpl.keystroke.phrase && ev.length === tpl.keystroke.phrase.length;
    keyScore = samePhrase ? scorePhrase(tpl.keystroke, ev) : scoreFree(tpl.keystroke, ev);
  }

  const thresholds = thresholdsFor(exam);
  let { fused, wFace, wKey, decision } = fuse({ faceScore, keyScore, faceQuality }, thresholds);
  let reason = null, live = null, newDevice = false;
  if (mode === 'login') {
    const l = consumeChallenge(body.liveness, user._id);
    live = l.ok;
    if (!l.ok) { decision = 'REJECT'; reason = l.reason; }
    else if (faceScore == null) { decision = 'REJECT'; reason = 'no_face'; }
    // context-aware risk: a known user on a never-seen device must pass an extra check
    if (device && user.devices?.length && !user.devices.some((d) => d.hash === device.hash)) {
      newDevice = true;
      if (decision === 'ACCEPT') { decision = 'STEP_UP'; reason = 'new_device'; }
    }
  }
  if (mode === 'continuous' && body.noFace) reason = 'no_face';

  const label = mode === 'test' && ['genuine', 'impostor'].includes(body.label) ? body.label : undefined;
  const event = await AuthEvent.create({
    user: user._id, attempt: attempt?._id, mode, faceScore, keyScore, faceQuality, wFace, fused, decision, live, reason, label, ip,
  });

  // trusted-device bookkeeping (first verified device is trusted automatically)
  if (mode === 'login' && device && decision === 'ACCEPT') {
    if (user.devices?.some((d) => d.hash === device.hash)) {
      const devices = user.devices.map((d) => ({ hash: d.hash, label: d.label, firstSeen: d.firstSeen, lastSeen: d.hash === device.hash ? new Date() : d.lastSeen }));
      await User.updateOne({ _id: user._id }, { $set: { devices } });
    } else {
      await User.updateOne({ _id: user._id }, { $push: { devices: { hash: device.hash, label: device.label, firstSeen: new Date(), lastSeen: new Date() } } });
    }
  }

  // template ageing: only after a strong, live, full-modality match (prevents impostor poisoning)
  let adapted = false;
  if (mode === 'login' && decision === 'ACCEPT' && live && fused >= 0.85 && faceScore != null) {
    const update = { $inc: { adaptations: 1 } };
    if (keyScore != null && samePhrase && keyScore >= 0.8) {
      const k = updateTemplate(tpl.keystroke.toObject(), ev);
      if (k) update.$set = { 'keystroke.mean': k.mean, 'keystroke.std': k.std };
    }
    if (faceScore >= 0.9) update.$push = { faceTemplates: { $each: [{ vec: body.descriptor }], $slice: -8 } };
    if (update.$set || update.$push) { await BiometricTemplate.updateOne({ _id: tpl._id }, update); adapted = true; }
  }

  appendAudit('AUTH_' + decision, {
    user: user._id, mode, fused: +fused.toFixed(3), faceScore: faceScore == null ? null : +faceScore.toFixed(3),
    keyScore: keyScore == null ? null : +keyScore.toFixed(3), attempt: attempt?._id || null, reason, adapted,
  }).catch((e) => console.error('audit', e.message));
  emitProctors('auth:event', {
    id: event._id, user: { id: user._id, name: user.name }, attempt: attempt?._id, mode,
    decision, fused, faceScore, keyScore, reason, at: event.createdAt,
  });
  return {
    decision, fused, faceScore, keyScore, faceQuality, wFace, wKey, faceDistance, live, reason, thresholds, newDevice, adapted,
    eventId: event._id, explain: explain({ faceScore, keyScore, faceQuality, wFace, wKey, reason, newDevice, mode }),
  };
}
