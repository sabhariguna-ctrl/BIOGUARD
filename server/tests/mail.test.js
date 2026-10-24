import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { sendMail, provider, devMode, publicMailError, template } from '../src/utils/mailer.js';

const startMock = (handler) => new Promise((resolve) => {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => { seen.push({ url: req.url, headers: req.headers, body: JSON.parse(body || '{}') }); handler(req, res); });
  }).listen(0, () => resolve({ srv, seen, url: `http://127.0.0.1:${srv.address().port}` }));
});
const reset = () => { for (const k of ['BREVO_API_KEY', 'RESEND_API_KEY', 'SMTP_HOST', 'BREVO_API_URL', 'RESEND_API_URL', 'MAIL_FROM', 'NODE_ENV', 'ALLOW_DEV_CODES']) delete process.env[k]; };

test('no provider and no opt-in: sending fails instead of silently faking it', async () => {
  reset();
  assert.equal(provider(), null);
  assert.equal(devMode(), false);
  await assert.rejects(() => sendMail({ to: 'a@b.dev', subject: 's', text: 't', html: 't' }), /not set up/);
});

test('explicit ALLOW_DEV_CODES: dev mode and console fallback (never in production)', async () => {
  reset();
  process.env.ALLOW_DEV_CODES = 'true';
  assert.equal(devMode(), true);
  process.env.NODE_ENV = 'production';
  assert.equal(devMode(), false);
  reset();
  process.env.ALLOW_DEV_CODES = 'true';
  const r = await sendMail({ to: 'a@b.dev', subject: 's', text: 't', html: '<p>t</p>' });
  assert.equal(r.dev, true);
});

test('brevo: sends the right API request', async () => {
  reset();
  const { srv, seen, url } = await startMock((_q, res) => { res.writeHead(201, { 'content-type': 'application/json' }); res.end('{"messageId":"1"}'); });
  process.env.BREVO_API_KEY = 'xkeysib-test-key'; process.env.BREVO_API_URL = url; process.env.MAIL_FROM = 'BioGuard <me@college.edu>';
  assert.equal(provider(), 'brevo');
  assert.equal(devMode(), false);
  await sendMail({ to: 'student@x.dev', subject: 'Code', text: 'Your code 123456', html: '<b>123456</b>' });
  srv.close();
  assert.equal(seen[0].url, '/v3/smtp/email');
  assert.equal(seen[0].headers['api-key'], 'xkeysib-test-key');
  assert.deepEqual(seen[0].body.sender, { name: 'BioGuard', email: 'me@college.edu' });
  assert.deepEqual(seen[0].body.to, [{ email: 'student@x.dev' }]);
  assert.equal(seen[0].body.subject, 'Code');
  reset();
});

test('brevo: explains an unverified sender', async () => {
  reset();
  const { srv, url } = await startMock((_q, res) => { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"code":"invalid_parameter","message":"Sender is not valid"}'); });
  process.env.BREVO_API_KEY = 'xkeysib-test-key'; process.env.BREVO_API_URL = url; process.env.MAIL_FROM = 'me@college.edu';
  await assert.rejects(() => sendMail({ to: 'a@b.dev', subject: 's', text: 't', html: 't' }), (e) => /Sender is not valid/.test(e.message) && /verify/i.test(e.message) && e.status === 502);
  srv.close(); reset();
});

test('resend: sends bearer-authenticated request', async () => {
  reset();
  const { srv, seen, url } = await startMock((_q, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"id":"1"}'); });
  process.env.RESEND_API_KEY = 're_test'; process.env.RESEND_API_URL = url; process.env.MAIL_FROM = 'BioGuard <hi@college.edu>';
  await sendMail({ to: 'x@y.dev', subject: 'S', text: 'T', html: 'H' });
  srv.close();
  assert.equal(seen[0].url, '/emails');
  assert.equal(seen[0].headers.authorization, 'Bearer re_test');
  assert.equal(seen[0].body.from, 'BioGuard <hi@college.edu>');
  reset();
});

test('production hides provider details from end users', () => {
  reset();
  process.env.NODE_ENV = 'production';
  assert.ok(!/brevo|smtp/i.test(publicMailError(new Error('The brevo email service rejected the message'))));
  reset();
  assert.match(publicMailError(new Error('detail here')), /detail here/);
});

test('email template escapes HTML', () => {
  const { html, text } = template({ title: '<b>Hi</b>', intro: 'x', code: '123456' });
  assert.ok(!html.includes('<b>Hi</b>'));
  assert.ok(text.includes('123456'));
});
