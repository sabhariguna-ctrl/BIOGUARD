import { User } from '../models/User.js';
import { BiometricTemplate } from '../models/BiometricTemplate.js';
import { AuthEvent } from '../models/AuthEvent.js';
import { Attempt } from '../models/Attempt.js';
import { asyncHandler } from '../utils/httpError.js';
import { appendAudit } from '../services/auditChain.js';

/** "My security" overview: enrollment health, trusted devices, recent checks. */
export const security = asyncHandler(async (req, res) => {
  const real = { user: req.user._id, synthetic: { $ne: true } };
  const [tpl, recent, all] = await Promise.all([
    BiometricTemplate.findOne({ user: req.user._id }),
    AuthEvent.find(real).sort({ createdAt: -1 }).limit(10).select('mode decision fused faceScore keyScore reason createdAt'),
    AuthEvent.find(real).sort({ createdAt: -1 }).limit(2000).select('decision fused').lean(),
  ]);
  const a = {
    checks: all.length,
    accepted: all.filter((e) => e.decision === 'ACCEPT').length,
    avg: all.length ? all.reduce((s, e) => s + (e.fused || 0), 0) / all.length : null,
  };
  res.json({
    devices: req.user.devices || [],
    template: {
      faceSamples: tpl?.faceTemplates?.length || 0, typingSamples: tpl?.keystroke?.samples || 0,
      phrase: tpl?.keystroke?.phrase || null, adaptations: tpl?.adaptations || 0, updatedAt: tpl?.updatedAt || null,
    },
    stats: { checks: a.checks, acceptRate: a.checks ? a.accepted / a.checks : null, avgFused: a.avg },
    recent,
  });
});

export const revokeDevice = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { devices: { hash: req.params.hash } } });
  appendAudit('DEVICE_REVOKED', { user: req.user._id }).catch(() => {});
  res.json({ ok: true });
});

/** Data-subject export: everything the system holds about the caller (templates summarised, not raw vectors). */
export const exportData = asyncHandler(async (req, res) => {
  const [tpl, events, attempts] = await Promise.all([
    BiometricTemplate.findOne({ user: req.user._id }),
    AuthEvent.find({ user: req.user._id, synthetic: { $ne: true } }).sort({ createdAt: -1 }).limit(500).lean(),
    Attempt.find({ student: req.user._id }).populate('exam', 'title').lean(),
  ]);
  appendAudit('DATA_EXPORTED', { user: req.user._id }).catch(() => {});
  res.setHeader('Content-Disposition', 'attachment; filename="my-bioguard-data.json"');
  res.json({
    exportedAt: new Date().toISOString(), account: req.user,
    biometricTemplates: { faceTemplateCount: tpl?.faceTemplates?.length || 0, typingSamples: tpl?.keystroke?.samples || 0, note: 'Raw template vectors are intentionally not exported.' },
    authenticationEvents: events, attempts,
  });
});
