// Run against a THROWAWAY database: it seeds-dependent, registers users, changes a password and deletes data.
// Usage: npm run seed, start the server, then  API=http://localhost:5000/api npm run e2e
const B = process.env.API || 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m, extra ?? ''); } };
const call = async (method, path, { token, body, ua } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(ua ? { 'User-Agent': ua } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, j };
};
const login = async (e, p) => (await call('POST', '/auth/login', { body: { email: e, password: p } })).j;
const rnd = (seed) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; }; };
const mkDesc = (seed, noise = 0) => { const r = rnd(seed), n = rnd(seed + 99); return Array.from({ length: 128 }, () => r() * 0.2 - 0.1 + (n() - 0.5) * noise); };
const typing = (phrase, j = 0, slow = 0) => { let t = 1000; return phrase.split('').map((k, i) => { const d = (t += 150 + (i % 4) * 20 + Math.sin(i * (1 + j)) * 6 + slow); const u = d + 90 + (i % 3) * 8 + slow / 2; t = u; return { k, d: Math.round(d), u: Math.round(u) }; }); };
const PHRASE = 'secure exam access 2026';

console.log('AUTH');
let r = await call('POST', '/auth/register', { body: { name: 'Test Reg', email: 'reg@x.dev', password: 'short' } });
ok(r.s === 400, 'register rejects short password', r.j);
r = await call('POST', '/auth/register', { body: { name: 'Test Reg', email: 'reg@x.dev', password: 'nodigitshere' } });
ok(r.s === 400, 'register rejects password without a number');
r = await call('POST', '/auth/register', { body: { name: 'Test Reg', email: 'reg@x.dev', password: 'LongEnough1' } });
ok(r.s === 201 && r.j.needsVerification && /^\d{6}$/.test(r.j.devCode), 'register needs email verification (dev code returned)', r.j);
const regCode = r.j.devCode;
r = await call('POST', '/auth/login', { body: { email: 'reg@x.dev', password: 'LongEnough1' } });
ok(r.s === 403 && r.j.code === 'EMAIL_NOT_VERIFIED', 'unverified account cannot log in', r.j);
r = await call('POST', '/auth/send-code', { body: { email: 'reg@x.dev', purpose: 'verify_email' } });
ok(r.s === 429, 'resend code is rate limited by cooldown', r);
r = await call('POST', '/auth/verify-email', { body: { email: 'reg@x.dev', code: '000000' } });
ok(r.s === 400, 'wrong verification code rejected');
r = await call('POST', '/auth/verify-email', { body: { email: 'reg@x.dev', code: regCode } });
ok(r.s === 200 && r.j.token && r.j.user.emailVerified, 'correct code verifies email and logs in', r.j);
r = await call('POST', '/auth/verify-email', { body: { email: 'reg@x.dev', code: regCode } });
ok(r.s === 400, 'code cannot be reused');
r = await call('POST', '/auth/register', { body: { name: 'Dup', email: 'reg@x.dev', password: 'LongEnough1' } });
ok(r.s === 409, 'cannot register an already verified email');
r = await call('POST', '/auth/send-code', { body: { email: 'nobody@x.dev', purpose: 'login' } });
ok(r.s === 200 && !r.j.devCode, 'unknown email gets a generic response (no account enumeration)');
const S = await login('student@bioguard.dev', 'Student@123');
const F = await login('faculty@bioguard.dev', 'Faculty@123');
const A = await login('admin@bioguard.dev', 'Admin@123');
ok(S.token && F.token && A.token, 'three seeded logins');
r = await call('GET', '/auth/me', { token: S.token }); ok(r.s === 200 && r.j.user.role === 'student', 'me');
r = await call('GET', '/users', { token: S.token }); ok(r.s === 403, 'student blocked from /users');
for (let i = 0; i < 5; i++) r = await call('POST', '/auth/login', { body: { email: 'reg@x.dev', password: 'wrong' } });
r = await call('POST', '/auth/login', { body: { email: 'reg@x.dev', password: 'LongEnough1' } });
ok(r.s === 423, 'account locks after 5 failures', r);

console.log('ENROLLMENT');
r = await call('POST', '/biometric/verify', { token: S.token, body: { mode: 'login' } });
ok(r.s === 400, 'verify before enroll is rejected');
const faces = [0, 1, 2, 3, 4].map((i) => mkDesc(7, 0.02 * i));
r = await call('POST', '/biometric/enroll/face', { token: S.token, body: { descriptors: faces } }); ok(r.s === 200, 'enroll face', r.j);
const samples = [0, 0.4, 0.8, 1.2, 1.6, 2].map((j) => typing(PHRASE, j));
r = await call('POST', '/biometric/enroll/keystroke', { token: S.token, body: { phrase: PHRASE, samples } }); ok(r.s === 200, 'enroll keystroke', r.j);
r = await call('GET', '/biometric/status', { token: S.token }); ok(r.j.enrolled === true, 'status enrolled', r.j);

console.log('VERIFY (liveness, fusion, device trust)');
const UA1 = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36';
const doVerify = async ({ ua = UA1, desc = mkDesc(7, 0.01), ev = typing(PHRASE, 0.7), live = true } = {}) => {
  const ch = (await call('GET', '/biometric/challenge', { token: S.token, ua })).j;
  return call('POST', '/biometric/verify', { token: S.token, ua, body: { mode: 'login', descriptor: desc, quality: { detScore: 0.95, brightness: 0.5, faceRatio: 0.3 }, liveness: { nonce: ch.nonce, type: ch.type, passed: live }, keystroke: { phrase: PHRASE, events: ev } } });
};
r = await doVerify();
ok(r.j.decision === 'ACCEPT' && r.j.passToken, 'genuine ACCEPT with pass token', r.j);
ok(Array.isArray(r.j.explain) && r.j.explain.length >= 2, 'explain list returned');
const pass1 = r.j.passToken;
r = await doVerify({ desc: mkDesc(555, 0) });
ok(r.j.decision === 'REJECT' || r.j.decision === 'STEP_UP', 'different face is not accepted', r.j.decision + ' ' + r.j.fused);
r = await doVerify({ live: false });
ok(r.j.decision === 'REJECT' && r.j.reason === 'liveness_failed', 'failed liveness rejects');
const ch = (await call('GET', '/biometric/challenge', { token: S.token })).j;
const body = { mode: 'login', descriptor: mkDesc(7, 0.01), liveness: { nonce: ch.nonce, type: ch.type, passed: true }, keystroke: { phrase: PHRASE, events: typing(PHRASE, 0.7) } };
await call('POST', '/biometric/verify', { token: S.token, body });
r = await call('POST', '/biometric/verify', { token: S.token, body });
ok(r.j.decision === 'REJECT' && r.j.reason === 'liveness_expired', 'liveness nonce is single-use');
r = await doVerify({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Firefox/121.0' });
ok(r.j.decision === 'STEP_UP' && r.j.reason === 'new_device', 'new device forces step-up', r.j);
ok(/^\d{6}$/.test(r.j.devCode || ''), 'step-up code is delivered (dev code present)', r.j);
const otpCode = r.j.devCode;
r = await call('POST', '/biometric/step-up', { token: S.token, body: { otp: otpCode === '000000' ? '111111' : '000000' } }); ok(r.s === 400, 'wrong OTP rejected');
r = await call('POST', '/biometric/step-up', { token: S.token, body: { otp: otpCode } }); ok(r.s === 200 && r.j.passToken, 'correct step-up OTP issues pass token', r.j);
r = await doVerify({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Firefox/121.0' });
ok(r.j.decision === 'ACCEPT', 'device is trusted after step-up', r.j.decision + ' ' + r.j.reason);

console.log('EXAM FLOW');
const exams = (await call('GET', '/exams', { token: S.token })).j;
ok(exams.length >= 2 && !JSON.stringify(exams).includes('answerIndex'), 'student sees exams without answers');
const ex1 = exams.find((e) => /Networks/.test(e.title)), ex2 = exams.find((e) => /Quick Quiz/.test(e.title));
r = await call('POST', `/exams/${ex1._id}/start`, { token: S.token, body: { passToken: 'garbage' } }); ok(r.s === 403, 'start requires valid pass token');
r = await call('POST', `/exams/${ex1._id}/start`, { token: S.token, body: { passToken: pass1 } });
ok(r.s === 200 && r.j.attempt && r.j.deadline, 'start exam', r.j);
const att = r.j.attempt._id;
let hb = await call('POST', `/attempts/${att}/verify`, { token: S.token, body: { descriptor: mkDesc(7, 0.01), quality: { detScore: 0.9, brightness: 0.5, faceRatio: 0.3 }, keystroke: { events: typing('some rough working text here', 0.3) } } });
ok(hb.s === 200 && hb.j.decision, 'heartbeat genuine', hb.j);
for (let i = 0; i < 3; i++) hb = await call('POST', `/attempts/${att}/verify`, { token: S.token, body: { noFace: true } });
ok(hb.j.status === 'terminated', 'three failed checks terminate the attempt', hb.j);
r = await call('POST', `/attempts/${att}/submit`, { token: S.token, body: { answers: [1] } }); ok(r.s === 400, 'cannot submit a terminated attempt');

r = await call('POST', `/exams/${ex2._id}/start`, { token: S.token, body: { passToken: (await doVerify()).j.passToken } });
ok(r.s === 200, 'start second exam', r.j);
const att2 = r.j.attempt._id;
r = await call('POST', `/attempts/${att2}/flag`, { token: S.token, body: { type: 'tab_switch' } }); ok(r.s === 200 && r.j.trust < 1, 'tab-switch flag lowers trust', r.j);
r = await call('POST', `/attempts/${att2}/warn`, { token: S.token, body: { message: 'hi' } }); ok(r.s === 403, 'student cannot warn');
r = await call('POST', `/attempts/${att2}/warn`, { token: F.token, body: { message: 'Keep your face in frame' } }); ok(r.s === 200, 'faculty warn');
r = await call('POST', `/attempts/${att2}/submit`, { token: S.token, body: { answers: [1, 1, 0, 1] } }); ok(r.s === 200 && r.j.score === 4, 'submit scores correctly', r.j);
r = await call('GET', `/attempts/${att}/timeline`, { token: F.token }); ok(r.s === 200 && r.j.events.length >= 4, 'timeline has events', r.j.events?.length);
r = await call('GET', '/attempts', { token: S.token }); ok(r.j.length === 2, 'student lists own attempts');

console.log('PROCTOR TERMINATE');
r = await call('POST', '/users/invite', { token: F.token, body: { name: 'Inv', email: 'invitee@x.dev', role: 'faculty' } });
ok(r.s === 403, 'faculty cannot invite users');
r = await call('POST', '/users/invite', { token: A.token, body: { name: 'Invited Faculty', email: 'invitee@x.dev', role: 'faculty' } });
ok(r.s === 201 && r.j.devLink?.includes('/accept-invite?token='), 'admin invites by email (dev link returned)', r.j);
const inviteUrl = new URL(r.j.devLink);
const invToken = inviteUrl.searchParams.get('token');
r = await call('POST', '/users/invite', { token: A.token, body: { name: 'Inv', email: 'invitee@x.dev', role: 'faculty' } });
ok(r.s === 409, 'duplicate invite rejected');
r = await call('POST', '/auth/accept-invite', { body: { email: 'invitee@x.dev', token: invToken, password: 'weak' } });
ok(r.s === 400, 'invite rejects weak password');
r = await call('POST', '/auth/accept-invite', { body: { email: 'invitee@x.dev', token: 'x'.repeat(48), password: 'GoodPass123' } });
ok(r.s === 400, 'invite rejects wrong token');
r = await call('POST', '/auth/accept-invite', { body: { email: 'invitee@x.dev', token: invToken, password: 'GoodPass123' } });
ok(r.s === 200 && r.j.user.role === 'faculty' && r.j.token, 'invitee sets password and joins as faculty', r.j);
r = await call('POST', '/auth/accept-invite', { body: { email: 'invitee@x.dev', token: invToken, password: 'GoodPass123' } });
ok(r.s === 400, 'invite link works only once');

console.log('FORGOT PASSWORD / EMAIL CODE LOGIN');
r = await call('POST', '/auth/send-code', { body: { email: 'invitee@x.dev', purpose: 'reset_password' } });
ok(r.s === 200 && /^\d{6}$/.test(r.j.devCode), 'forgot password sends a code', r.j);
const resetCode = r.j.devCode;
r = await call('POST', '/auth/reset-password', { body: { email: 'invitee@x.dev', code: resetCode, password: 'nonumberspass' } });
ok(r.s === 400, 'reset rejects weak password');
r = await call('POST', '/auth/reset-password', { body: { email: 'invitee@x.dev', code: resetCode, password: 'BrandNew456' } });
ok(r.s === 200, 'reset password with code', r.j);
ok((await login('invitee@x.dev', 'BrandNew456')).token, 'login with the new password');
r = await call('POST', '/auth/send-code', { body: { email: 'invitee@x.dev', purpose: 'login' } });
ok(r.s === 200 && /^\d{6}$/.test(r.j.devCode), 'login code requested', r.j);
const lc = r.j.devCode;
r = await call('POST', '/auth/login-code', { body: { email: 'invitee@x.dev', code: lc === '000000' ? '111111' : '000000' } });
ok(r.s === 400, 'wrong login code rejected');
r = await call('POST', '/auth/login-code', { body: { email: 'invitee@x.dev', code: lc } });
ok(r.s === 200 && r.j.token, 'login with emailed code', r.j);

console.log('NOTIFICATIONS / MAIL SETTINGS');
r = await call('GET', '/notifications', { token: S.token });
ok(r.s === 200 && r.j.items.length >= 1 && r.j.unread >= 1, 'student has notifications (warn, new device, etc.)', r.j.unread);
r = await call('POST', '/notifications/read-all', { token: S.token }); ok(r.s === 200, 'mark all read');
r = await call('GET', '/notifications', { token: S.token }); ok(r.j.unread === 0, 'unread count resets');
r = await call('GET', '/admin/mail-status', { token: A.token }); ok(r.s === 200 && r.j.devMode === true, 'mail status (dev mode)', r.j);
r = await call('GET', '/admin/mail-status', { token: F.token }); ok(r.s === 403, 'faculty cannot see mail settings');
r = await call('POST', '/admin/test-email', { token: A.token, body: {} }); ok(r.s === 200 && r.j.ok, 'test email endpoint works', r.j);

console.log('STAFF, ANALYTICS, AUDIT');
r = await call('GET', '/analytics/overview', { token: F.token }); if (r.s === 500) console.log('  SKIP overview (aggregation operators unsupported by the FerretDB test database)'); else ok(r.s === 200 && r.j.users >= 3, 'overview', r.j);
r = await call('GET', '/analytics/performance', { token: F.token }); ok(r.s === 200 && r.j.nGenuine >= 300 && r.j.eer.value < 0.2, 'performance + EER', r.j.eer);
r = await call('GET', '/analytics/risk', { token: F.token }); if (r.s === 500) console.log('  SKIP risk (aggregation operators unsupported by the FerretDB test database)'); else ok(r.s === 200 && r.j.byHour?.length === 24, 'risk endpoint', r.j);
r = await call('GET', `/analytics/exam/${ex2._id}`, { token: F.token }); ok(r.s === 200 && r.j.attempts === 1 && r.j.questions.length === 4, 'question stats', r.j);
r = await call('GET', '/analytics/events', { token: F.token }); ok(r.s === 200 && r.j.length > 0, 'recent events');
r = await call('GET', '/attempts/export', { token: F.token }); ok(r.s === 200 && String(r.j).startsWith('"Student"'), 'CSV export', String(r.j).slice(0, 80));
r = await call('GET', '/audit?limit=5', { token: A.token }); ok(r.s === 200 && r.j.length > 0, 'audit list');
r = await call('GET', '/audit/verify', { token: A.token }); ok(r.j.valid === true && r.j.total > 5, 'audit chain valid', r.j);
r = await call('GET', '/audit', { token: F.token }); ok(r.s === 403, 'faculty cannot read raw audit');
r = await call('POST', '/exams', { token: F.token, body: { title: 'New exam', durationMin: 20, heartbeatSec: 30, acceptThreshold: 0.8, stepUpThreshold: 0.5, shuffle: true, startsAt: null, endsAt: null, questions: [{ text: 'Q one?', options: ['a', 'b'], answerIndex: 1 }] } });
ok(r.s === 201, 'faculty creates exam', r.j);
const newId = r.j._id;
r = await call('POST', '/exams', { token: F.token, body: { title: 'Bad', durationMin: 20, acceptThreshold: 0.5, stepUpThreshold: 0.6, questions: [{ text: 'Q?', options: ['a', 'b'], answerIndex: 0 }] } }); ok(r.s === 400, 'bad thresholds rejected');
r = await call('PUT', `/exams/${newId}`, { token: F.token, body: { title: 'New exam v2', durationMin: 20, heartbeatSec: 30, acceptThreshold: 0.8, stepUpThreshold: 0.5, shuffle: false, startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: null, questions: [{ text: 'Q one?', options: ['a', 'b'], answerIndex: 1 }] } }); ok(r.s === 200, 'faculty updates exam with future start', r.j);
r = await call('POST', `/exams/${newId}/start`, { token: S.token, body: { passToken: (await doVerify()).j.passToken } }); ok(r.s === 400 && /opens/.test(r.j.message), 'exam not open yet is blocked', r.j);
r = await call('DELETE', `/exams/${newId}`, { token: F.token }); ok(r.s === 200, 'delete exam');

console.log('TEACHER REQUESTS, 2FA, SESSIONS, BULK INVITE');
r = await call('POST', '/auth/register', { body: { name: 'Common Pw', email: 'cp@x.dev', password: 'password123' } });
ok(r.s === 400 && /common/i.test(r.j.message), 'common passwords are rejected', r.j);
r = await call('POST', '/auth/register', { body: { name: 'Teach Er', email: 'teacher@x.dev', password: 'LongEnough7', accountType: 'faculty' } });
ok(r.s === 201 && r.j.devCode, 'teacher sign-up request', r.j);
r = await call('POST', '/auth/verify-email', { body: { email: 'teacher@x.dev', code: r.j.devCode } });
ok(r.s === 200 && r.j.user.role === 'student' && r.j.user.approval === 'pending', 'teacher starts as student with pending approval', r.j.user);
let TT = r.j.token; const teacherId = r.j.user._id;
r = await call('GET', '/notifications', { token: A.token }); ok(r.j.items.some((n) => /Teacher access requested/.test(n.title)), 'admin is notified of the request');
r = await call('POST', '/exams', { token: TT, body: { title: 'Nope', durationMin: 10, questions: [{ text: 'Q?', options: ['a', 'b'], answerIndex: 0 }] } }); ok(r.s === 403, 'pending teacher cannot create exams');
r = await call('POST', `/users/${teacherId}/approve`, { token: F.token }); ok(r.s === 403, 'faculty cannot approve requests');
r = await call('POST', `/users/${teacherId}/approve`, { token: A.token }); ok(r.s === 200 && r.j.role === 'faculty' && r.j.approval === 'approved', 'admin approves teacher', r.j);
r = await call('GET', '/notifications', { token: TT }); ok(r.j.items.some((n) => /approved/i.test(n.title)), 'teacher is notified of approval');
r = await call('POST', '/exams', { token: TT, body: { title: 'Teacher exam', durationMin: 10, heartbeatSec: 30, acceptThreshold: 0.75, stepUpThreshold: 0.55, shuffle: true, questions: [{ text: 'Q one?', options: ['a', 'b'], answerIndex: 0 }] } }); ok(r.s === 201, 'approved teacher can create exams');
r = await call('POST', '/auth/register', { body: { name: 'Teach Two', email: 'teacher2@x.dev', password: 'LongEnough8', accountType: 'faculty' } });
r = await call('POST', '/auth/verify-email', { body: { email: 'teacher2@x.dev', code: r.j.devCode } });
const t2 = r.j.user._id;
r = await call('POST', `/users/${t2}/reject`, { token: A.token }); ok(r.s === 200 && r.j.role === 'student' && r.j.approval === 'rejected', 'admin declines a request', r.j);

r = await call('POST', '/auth/refresh', { token: TT }); ok(r.s === 200 && r.j.token, 'token refresh');
r = await call('GET', '/auth/me', { token: r.j.token }); ok(r.s === 200, 'refreshed token works');

r = await call('POST', '/auth/two-factor', { token: TT, body: { enabled: true } }); ok(r.s === 200 && r.j.user.twoFactorEmail === true, 'enable email two-step login');
r = await call('POST', '/auth/login', { body: { email: 'teacher@x.dev', password: 'LongEnough7' } });
ok(r.s === 200 && r.j.mfaRequired && !r.j.token && /^\d{6}$/.test(r.j.devCode), 'password login now asks for an emailed code', r.j);
const mfaCode = r.j.devCode;
r = await call('POST', '/auth/login-code', { body: { email: 'teacher@x.dev', code: mfaCode } }); ok(r.s === 200 && r.j.token, 'two-step login completes with the code');
TT = r.j.token;
r = await call('POST', '/auth/two-factor', { token: TT, body: { enabled: false } }); ok(r.s === 200 && r.j.user.twoFactorEmail === false, 'disable two-step login');

const UA_A = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537', UA_B = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Firefox/121.0';
r = await call('POST', '/auth/login', { body: { email: 'teacher@x.dev', password: 'LongEnough7' }, ua: UA_A }); const tokA = r.j.token;
r = await call('POST', '/auth/login', { body: { email: 'teacher@x.dev', password: 'LongEnough7' }, ua: UA_B });
ok(r.s === 200 && r.j.token, 'login from a second browser');
r = await call('GET', '/notifications', { token: tokA }); ok(r.j.items.some((n) => /New sign-in/.test(n.title)), 'new browser triggers a sign-in alert');
r = await call('POST', '/auth/logout-others', { token: tokA }); ok(r.s === 200 && r.j.token, 'sign out other devices');
const tokNew = r.j.token;
r = await call('GET', '/auth/me', { token: r.j.token === tokA ? 'x' : tokA }); ok(r.s === 401, 'previous session is revoked');
r = await call('GET', '/auth/me', { token: tokNew }); ok(r.s === 200, 'current session continues');

r = await call('POST', '/users/bulk-invite', { token: F.token, body: { role: 'student', rows: [
  { name: 'Bulk One', email: 'bulk1@x.dev', rollNo: 'B1' }, { name: 'Bulk Two', email: 'bulk2@x.dev' }, { name: 'Dup One', email: 'bulk1@x.dev' },
  { name: 'Bad Row', email: 'notanemail' }, { name: 'Exists', email: 'student@bioguard.dev' }] } });
ok(r.s === 200 && r.j.sent === 2 && r.j.skipped.length === 2 && r.j.failed.length === 1, 'bulk invite reports sent / skipped / failed', r.j);
r = await call('POST', '/users/bulk-invite', { token: F.token, body: { role: 'faculty', rows: [{ name: 'Nope Nope', email: 'nope@x.dev' }] } }); ok(r.s === 403, 'faculty cannot bulk-invite faculty');
r = await call('POST', '/users/bulk-invite', { token: S.token, body: { role: 'student', rows: [{ name: 'Nope Nope', email: 'nope2@x.dev' }] } }); ok(r.s === 403, 'students cannot bulk-invite');

r = await call('GET', '/admin/mail-logs', { token: A.token }); ok(r.s === 200 && r.j.length > 0 && r.j[0].status, 'delivery log records emails', r.j[0]);
r = await call('GET', '/admin/mail-status', { token: A.token }); ok(r.j.provider === 'none' && Array.isArray(r.j.warnings), 'mail status reports provider');

console.log('STUDENT DIRECTORY');
r = await call('GET', '/students', { token: S.token }); ok(r.s === 403, 'students cannot list other students');
r = await call('GET', '/students', { token: F.token });
const me1 = Array.isArray(r.j) && r.j.find((x) => x.email === 'student@bioguard.dev');
ok(r.s === 200 && me1 && me1.attempts >= 1 && me1.enrolled && !('password' in me1), 'faculty can list students with enrollment and attempt summary', r.j?.length);
r = await call('GET', `/attempts?student=${me1._id}`, { token: F.token }); ok(r.s === 200 && r.j.length >= 1 && r.j.every((a) => String(a.student._id) === String(me1._id)), 'faculty can filter attempts by student');

console.log('SINGLE ADMIN POLICY');
r = await call('POST', '/users/invite', { token: A.token, body: { name: 'Second Admin', email: 'admin2@x.dev', role: 'admin' } }); ok(r.s === 400, 'cannot invite a second admin');
r = await call('POST', '/users/bulk-invite', { token: A.token, body: { role: 'admin', rows: [{ name: 'Nope Nope', email: 'admin3@x.dev' }] } }); ok(r.s === 400, 'cannot bulk-invite admins');
r = await call('POST', '/users/invite', { token: A.token, body: { name: 'Admin Again', email: 'admin@bioguard.dev', role: 'faculty' } }); ok(r.s === 409, 'cannot invite the administrator email');
const everyone = (await call('GET', '/users', { token: A.token })).j;
r = await call('PATCH', `/users/${everyone.find((u) => u.role === 'student')._id}/role`, { token: A.token, body: { role: 'admin' } }); ok(r.s === 400, 'cannot promote anyone to admin');
r = await call('PATCH', `/users/${everyone.find((u) => u.role === 'admin')._id}/role`, { token: A.token, body: { role: 'faculty' } }); ok(r.s === 400, 'admin role cannot be changed');
r = await call('DELETE', `/users/${everyone.find((u) => u.role === 'admin')._id}`, { token: A.token }); ok(r.s === 400, 'admin account cannot be deleted');
ok(everyone.filter((u) => u.role === 'admin').length === 1, 'exactly one admin exists');

console.log('ROLE PERMISSION MATRIX');
const matrix = [
  ['GET', '/students', { admin: 200, faculty: 200, student: 403 }],
  ['GET', '/users', { admin: 200, faculty: 403, student: 403 }],
  ['GET', '/audit', { admin: 200, faculty: 403, student: 403 }],
  ['GET', '/audit/verify', { admin: 200, faculty: 200, student: 403 }],
  ['GET', '/admin/mail-status', { admin: 200, faculty: 403, student: 403 }],
  ['GET', '/admin/mail-logs', { admin: 200, faculty: 403, student: 403 }],
  ['GET', '/analytics/overview', { admin: 200, faculty: 200, student: 403 }],
  ['GET', '/analytics/performance', { admin: 200, faculty: 200, student: 403 }],
  ['GET', '/analytics/risk', { admin: 200, faculty: 200, student: 403 }],
  ['GET', '/attempts/export', { admin: 200, faculty: 200, student: 403 }],
  ['GET', '/exams', { admin: 200, faculty: 200, student: 200 }],
  ['GET', '/attempts', { admin: 200, faculty: 200, student: 200 }],
  ['GET', '/notifications', { admin: 200, faculty: 200, student: 200 }],
  ['GET', '/me/security', { admin: 200, faculty: 200, student: 200 }],
  ['GET', '/biometric/status', { admin: 200, faculty: 200, student: 200 }],
  ['POST', '/exams', { admin: 400, faculty: 400, student: 403 }], // empty body: staff reach validation (400), students are stopped first (403)
  ['POST', '/users/invite', { admin: 400, faculty: 403, student: 403 }],
  ['POST', '/users/bulk-invite', { admin: 400, faculty: 400, student: 403 }],
];
const who = { admin: A.token, faculty: F.token, student: S.token };
for (const [m, p, exp] of matrix) {
  for (const role of Object.keys(exp)) {
    const res = await call(m, p, { token: who[role], body: m === 'POST' ? {} : undefined });
    ok(res.s === exp[role], `${role.padEnd(7)} ${m} ${p} -> ${exp[role]}`, `got ${res.s}`);
  }
}
r = await call('GET', '/students'); ok(r.s === 401, 'no token -> 401');

console.log('ME / PRIVACY / ADMIN');
r = await call('GET', '/me/security', { token: S.token }); ok(r.s === 200 && r.j.devices.length === 2 && r.j.template.faceSamples >= 5, 'me/security', r.j);
ok(r.j.template.adaptations >= 1, 'template adapted after strong match', r.j.template);
r = await call('GET', '/me/export', { token: S.token }); ok(r.s === 200 && r.j.authenticationEvents, 'data export');
r = await call('POST', '/auth/change-password', { token: S.token, body: { current: 'wrong', next: 'NewPassw0rd' } }); ok(r.s === 400, 'wrong current password rejected');
r = await call('POST', '/auth/change-password', { token: S.token, body: { current: 'Student@123', next: 'NewPassw0rd' } }); ok(r.s === 200 && r.j.token, 'password changed and this session stays valid');
const oldTok = S.token; S.token = r.j.token;
r = await call('GET', '/auth/me', { token: oldTok }); ok(r.s === 401, 'old session is signed out after password change');
ok((await login('student@bioguard.dev', 'NewPassw0rd')).token, 'login with new password');
const hash = (await call('GET', '/me/security', { token: S.token })).j.devices[0].hash;
r = await call('DELETE', `/me/devices/${hash}`, { token: S.token }); ok(r.s === 200, 'revoke device');
r = await call('GET', '/users', { token: A.token }); ok(r.s === 200 && r.j.length >= 5, 'admin lists users');
const uid = r.j.find((u) => u.email === 'invitee@x.dev')._id;
r = await call('PATCH', `/users/${uid}/role`, { token: A.token, body: { role: 'faculty' } }); ok(r.s === 200 && r.j.role === 'faculty', 'admin changes role');
r = await call('DELETE', `/users/${uid}`, { token: A.token }); ok(r.s === 200, 'admin deletes user');
r = await call('DELETE', '/biometric', { token: S.token }); ok(r.s === 200, 'erase templates');
r = await call('GET', '/audit/verify', { token: A.token }); ok(r.j.valid === true, 'audit chain still valid at end', r.j);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
