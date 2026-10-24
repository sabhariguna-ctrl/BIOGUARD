import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, requireRole } from '../middleware/auth.js';
import * as auth from '../controllers/auth.js';
import * as bio from '../controllers/biometric.js';
import * as ex from '../controllers/exams.js';
import * as ad from '../controllers/admin.js';
import * as ins from '../controllers/insights.js';
import * as me from '../controllers/me.js';
import * as acc from '../controllers/accounts.js';
import * as nt from '../controllers/notifications.js';

const r = Router();
const staff = requireRole('admin', 'faculty');
const admin = requireRole('admin');

r.get('/health', (_q, s) => s.json({ ok: true, name: 'BioGuard API' }));

const codeLimiter = rateLimit({ windowMs: 10 * 60_000, max: process.env.NODE_ENV === 'production' ? 60 : 300, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts. Please wait a few minutes and try again.' } });
r.post('/auth/register', codeLimiter, auth.register);
r.post('/auth/verify-email', codeLimiter, auth.verifyEmail);
r.post('/auth/send-code', codeLimiter, auth.sendCodeRoute);
r.post('/auth/login-code', codeLimiter, auth.loginWithCode);
r.post('/auth/reset-password', codeLimiter, auth.resetPassword);
r.post('/auth/accept-invite', codeLimiter, auth.acceptInvite);
r.post('/auth/refresh', protect, auth.refresh);
r.post('/auth/logout-others', protect, auth.logoutOthers);
r.post('/auth/two-factor', protect, auth.setTwoFactor);
r.post('/auth/login', auth.login);
r.get('/auth/me', protect, auth.me);
r.post('/auth/change-password', protect, auth.changePassword);

r.get('/me/security', protect, me.security);
r.delete('/me/devices/:hash', protect, me.revokeDevice);
r.get('/me/export', protect, me.exportData);

r.get('/biometric/status', protect, bio.status);
r.get('/biometric/challenge', protect, bio.challenge);
r.post('/biometric/enroll/face', protect, bio.enrollFace);
r.post('/biometric/enroll/keystroke', protect, bio.enrollKeystroke);
r.delete('/biometric', protect, bio.removeTemplates);
const verifyLimiter = rateLimit({ windowMs: 10 * 60_000, max: 60, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many verification attempts. Please wait a few minutes.' } });
r.post('/biometric/verify', protect, verifyLimiter, bio.verify);
r.post('/biometric/step-up', protect, bio.stepUp);

r.get('/exams', protect, ex.listExams);
r.post('/exams', protect, staff, ex.createExam);
r.get('/exams/:id', protect, ex.getExam);
r.put('/exams/:id', protect, staff, ex.updateExam);
r.delete('/exams/:id', protect, staff, ex.deleteExam);
r.post('/exams/:id/start', protect, requireRole('student'), ex.startAttempt);

r.get('/attempts', protect, ex.listAttempts);
r.get('/attempts/export', protect, staff, ex.exportAttempts);
r.post('/attempts/:id/warn', protect, staff, ex.warnAttempt);
r.post('/attempts/:id/terminate', protect, staff, ex.terminateAttempt);
r.get('/attempts/:id/timeline', protect, ex.attemptTimeline);
r.post('/attempts/:id/verify', protect, requireRole('student'), ex.heartbeat);
r.post('/attempts/:id/flag', protect, requireRole('student'), ex.flagAttempt);
r.post('/attempts/:id/submit', protect, requireRole('student'), ex.submitAttempt);

r.get('/analytics/overview', protect, staff, ad.overview);
r.get('/analytics/performance', protect, staff, ad.performance);
r.get('/analytics/events', protect, staff, ad.recentEvents);
r.get('/students', protect, staff, ins.listStudents);
r.get('/analytics/risk', protect, staff, ins.risk);
r.get('/analytics/exam/:id', protect, staff, ins.examStats);

r.get('/audit', protect, admin, ad.auditList);
r.get('/audit/verify', protect, staff, ad.auditVerify);

r.get('/users', protect, admin, ad.listUsers);
r.post('/users/invite', protect, admin, acc.invite);
r.post('/users/:id/resend-invite', protect, admin, acc.resendInvite);
r.post('/users/bulk-invite', protect, staff, acc.bulkInvite);
r.post('/users/:id/approve', protect, admin, acc.approveRequest);
r.post('/users/:id/reject', protect, admin, acc.rejectRequest);
r.get('/admin/mail-logs', protect, admin, acc.mailLogs);
r.get('/admin/mail-status', protect, admin, acc.mailStatus);
r.post('/admin/test-email', protect, admin, acc.testEmail);

r.get('/notifications', protect, nt.list);
r.post('/notifications/read-all', protect, nt.readAll);
r.post('/notifications/:id/read', protect, nt.readOne);
r.patch('/users/:id/role', protect, admin, ad.setRole);
r.delete('/users/:id', protect, admin, ad.deleteUser);

export default r;
