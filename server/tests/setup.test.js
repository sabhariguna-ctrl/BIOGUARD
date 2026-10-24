import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import prompts from 'prompts';
import { SMTPServer } from 'smtp-server';
import { run, validEmail, explain } from '../src/setup.js';

const GOOD = 'goodgoodgoodgood';
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bg-setup-')), '.env');
const quiet = () => {};

async function smtp() {
  const inbox = [];
  const srv = new SMTPServer({
    authOptional: false, allowInsecureAuth: true, disabledCommands: ['STARTTLS'],
    onAuth(auth, _s, cb) { auth.password === GOOD ? cb(null, { user: auth.username }) : cb(Object.assign(new Error('Invalid login: 535 Username and Password not accepted'), { responseCode: 535 })); },
    onData(stream, session, cb) { let b = ''; stream.on('data', (c) => (b += c)); stream.on('end', () => { inbox.push({ to: session.envelope.rcptTo.map((r) => r.address), body: b }); cb(); }); },
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { inbox, port: srv.server.address().port, close: () => new Promise((r) => srv.close(r)) };
}
async function brevo(status = 201, body = '{"messageId":"1"}') {
  const seen = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { seen.push({ headers: req.headers, body: JSON.parse(b) }); res.writeHead(status, { 'content-type': 'application/json' }); res.end(body); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { seen, url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}
const parse = (file) => Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

test('email validation rejects placeholders and brackets', () => {
  assert.equal(validEmail('me@gmail.com'), true);
  for (const bad of ['<me@gmail.com>', 'me@gmail', 'unga-email@gmail.com', 'x@example.com', '', 'me gmail.com']) assert.equal(validEmail(bad), false, bad);
});

test('Gmail: sends a real test email, cleans the App Password, writes a correct .env', async () => {
  const s = await smtp(); const envFile = tmp();
  prompts.inject(['owner@gmail.com', 'gmail', 'owner@gmail.com', 'good good good good']);
  const r = await run({ envFile, log: quiet, smtp: { host: '127.0.0.1', port: s.port } });
  await s.close();
  assert.equal(r.saved, true);
  assert.deepEqual(s.inbox[0].to, ['owner@gmail.com']);
  const env = parse(envFile);
  assert.equal(env.ADMIN_EMAIL, 'owner@gmail.com');
  assert.equal(env.SMTP_USER, 'owner@gmail.com');
  assert.equal(env.SMTP_PASS, GOOD);
  assert.equal(env.MAIL_FROM, 'BioGuard <owner@gmail.com>');
  assert.equal(env.ALLOW_DEV_CODES, 'false');
  assert.equal(env.JWT_SECRET.length, 64);
  assert.equal(env.BREVO_API_KEY, '');
});

test('Gmail: a wrong App Password is reported and cancel changes nothing', async () => {
  const s = await smtp(); const envFile = tmp(); const out = [];
  prompts.inject(['owner@gmail.com', 'gmail', 'owner@gmail.com', 'wrongwrongwrong1', 'cancel']);
  const r = await run({ envFile, log: (m) => out.push(m), smtp: { host: '127.0.0.1', port: s.port } });
  await s.close();
  assert.equal(r.saved, false);
  assert.equal(fs.existsSync(envFile), false);
  assert.ok(out.join('\n').includes('App Password'), 'explains the App Password requirement');
});

test('Gmail: retry after a wrong password succeeds', async () => {
  const s = await smtp(); const envFile = tmp();
  prompts.inject(['owner@gmail.com', 'gmail', 'owner@gmail.com', 'wrongwrongwrong1', 'retry', 'owner@gmail.com', GOOD]);
  const r = await run({ envFile, log: quiet, smtp: { host: '127.0.0.1', port: s.port } });
  await s.close();
  assert.equal(r.saved, true);
  assert.equal(parse(envFile).SMTP_PASS, GOOD);
});

test('Brevo: sends through the HTTPS API and leaves SMTP empty', async () => {
  const b = await brevo(); const envFile = tmp();
  prompts.inject(['owner@college.edu', 'brevo', 'xkeysib-0123456789abcdefghij', 'owner@college.edu']);
  const r = await run({ envFile, log: quiet, brevoUrl: b.url });
  await b.close();
  assert.equal(r.saved, true);
  assert.equal(b.seen[0].headers['api-key'], 'xkeysib-0123456789abcdefghij');
  assert.deepEqual(b.seen[0].body.to, [{ email: 'owner@college.edu' }]);
  assert.deepEqual(b.seen[0].body.sender, { name: 'BioGuard', email: 'owner@college.edu' });
  const env = parse(envFile);
  assert.equal(env.BREVO_API_KEY, 'xkeysib-0123456789abcdefghij');
  assert.equal(env.SMTP_HOST, ''); assert.equal(env.SMTP_USER, ''); assert.equal(env.SMTP_PASS, '');
  assert.equal(env.MAIL_FROM, 'BioGuard <owner@college.edu>');
});

test('Brevo: an unverified sender gets a plain-language fix', async () => {
  const b = await brevo(400, '{"code":"invalid_parameter","message":"Sender is not valid"}'); const envFile = tmp(); const out = [];
  prompts.inject(['owner@college.edu', 'brevo', 'xkeysib-0123456789abcdefghij', 'owner@college.edu', 'cancel']);
  const r = await run({ envFile, log: (m) => out.push(m), brevoUrl: b.url });
  await b.close();
  assert.equal(r.saved, false);
  assert.ok(/Senders/.test(out.join('\n')) && /verification link/.test(out.join('\n')));
});

test('re-running keeps JWT secret, database URL and port, and backs up the old file', async () => {
  const s = await smtp(); const envFile = tmp();
  const secret = 'a'.repeat(64);
  fs.writeFileSync(envFile, `PORT=6000\nMONGO_URI=mongodb://db.example:27017/mine\nJWT_SECRET=${secret}\nSTAFF_2FA=true\nADMIN_EMAIL=old@gmail.com\n`);
  prompts.inject(['owner@gmail.com', 'gmail', 'owner@gmail.com', GOOD]);
  await run({ envFile, log: quiet, smtp: { host: '127.0.0.1', port: s.port } });
  await s.close();
  const env = parse(envFile);
  assert.equal(env.PORT, '6000'); assert.equal(env.MONGO_URI, 'mongodb://db.example:27017/mine');
  assert.equal(env.JWT_SECRET, secret); assert.equal(env.STAFF_2FA, 'true'); assert.equal(env.ADMIN_EMAIL, 'owner@gmail.com');
  assert.ok(fs.existsSync(`${envFile}.backup`));
});

test('explain() maps common failures to instructions', () => {
  assert.ok(/App Password/.test(explain(Object.assign(new Error('535 Invalid login'), { code: 'EAUTH' }), 'gmail')));
  assert.ok(/Could not reach/.test(explain(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }), 'smtp')));
});
