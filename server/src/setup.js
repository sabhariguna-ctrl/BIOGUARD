import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import nodemailer from 'nodemailer';
import prompts from 'prompts';

/**
 * Interactive setup: asks a few questions, SENDS A REAL TEST EMAIL to prove it works, then writes server/.env.
 *   npm run setup
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ENV = path.join(here, '..', '.env');

export const validEmail = (v) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(v || '').trim()) && !/example\.|your-|unga-/i.test(v);
const cleanPass = (v) => String(v || '').replace(/\s+/g, '');

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Turn a low-level mail error into a plain instruction. */
export function explain(e, provider) {
  const msg = String(e?.message || e);
  if (provider === 'gmail' && (e?.code === 'EAUTH' || /Invalid login|Username and Password|535|534/i.test(msg))) {
    return 'Gmail refused the login. Use your FULL Gmail address and a 16-letter App Password (not your normal password). App passwords need 2-Step Verification turned on: myaccount.google.com/apppasswords';
  }
  if (e?.code === 'EAUTH') return 'The mail server refused the username or password. Check them and try again.';
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED'].includes(e?.code)) return 'Could not reach the mail server. Check your internet connection (or whether a firewall or college network blocks email ports) and try again.';
  if (/401|403|api key|unauthorized/i.test(msg)) return 'Brevo rejected the API key. Copy it again from Brevo > SMTP & API > API Keys.';
  if (/sender|not valid|from/i.test(msg)) return 'Brevo does not accept that sender. In Brevo open Senders, Domains & Dedicated IPs > Senders, add this exact address and click the verification link they email you.';
  return msg;
}

async function sendTest(cfg, to, o) {
  const subject = 'BioGuard setup test';
  const text = 'Success! BioGuard can now send verification codes, login codes and invitations from this address.';
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif"><h2>Email is working</h2><p>${text}</p></div>`;
  if (cfg.provider === 'brevo') {
    const res = await fetch(`${o.brevoUrl || 'https://api.brevo.com'}/v3/smtp/email`, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'api-key': cfg.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: 'BioGuard', email: cfg.from }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  const host = o.smtp?.host || cfg.host, port = o.smtp?.port || cfg.port;
  const t = nodemailer.createTransport({
    host, port, secure: Number(port) === 465, auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000, tls: o.smtp?.tls,
  });
  await t.sendMail({ from: `BioGuard <${cfg.from}>`, to, subject, text, html });
}

function renderEnv(v) {
  return `PORT=${v.PORT}
MONGO_URI=${v.MONGO_URI}
JWT_SECRET=${v.JWT_SECRET}
CLIENT_URL=${v.CLIENT_URL}

ACCEPT_THRESHOLD=${v.ACCEPT_THRESHOLD}
STEPUP_THRESHOLD=${v.STEPUP_THRESHOLD}

# The ONE administrator. Admin login codes are emailed here.
ADMIN_EMAIL=${v.ADMIN_EMAIL}
ADMIN_NAME=${v.ADMIN_NAME}

# Email (written by npm run setup)
BREVO_API_KEY=${v.BREVO_API_KEY}
RESEND_API_KEY=
SMTP_HOST=${v.SMTP_HOST}
SMTP_PORT=${v.SMTP_PORT}
SMTP_USER=${v.SMTP_USER}
SMTP_PASS=${v.SMTP_PASS}
MAIL_FROM=BioGuard <${v.MAIL_FROM}>

NODE_ENV=${v.NODE_ENV}
STAFF_2FA=${v.STAFF_2FA}
ALLOW_DEV_CODES=false
`;
}

/** Runs the wizard. Options exist so tests can point at a fake mail server and a temp file. */
export async function run(o = {}) {
  const envFile = o.envFile || DEFAULT_ENV;
  const log = o.log || console.log;
  const existing = readEnv(envFile);
  const onCancel = () => { throw Object.assign(new Error('cancelled'), { cancelled: true }); };
  log('\nBioGuard setup: answer a few questions. A real test email is sent before anything is saved.\n');

  const a = await prompts([
    { type: 'text', name: 'adminEmail', message: 'Admin email (an inbox YOU can open: admin login codes are sent here)', initial: existing.ADMIN_EMAIL && validEmail(existing.ADMIN_EMAIL) ? existing.ADMIN_EMAIL : undefined, validate: (v) => validEmail(v) || 'Enter a real email address, without < > brackets' },
    { type: 'select', name: 'provider', message: 'How should BioGuard send email?', choices: [
      { title: 'Gmail (easiest on your own computer)', value: 'gmail' },
      { title: 'Brevo (free, use this when you host the site online)', value: 'brevo' },
      { title: 'Other SMTP (Outlook, college mail, ...)', value: 'smtp' }] },
  ], { onCancel });
  const adminEmail = a.adminEmail.trim().toLowerCase();

  let cfg;
  for (;;) {
    if (a.provider === 'gmail') {
      const g = await prompts([
        { type: 'text', name: 'user', message: 'Gmail address that will SEND the emails', initial: /@gmail\.com$/i.test(adminEmail) ? adminEmail : undefined, validate: (v) => validEmail(v) || 'Enter your full Gmail address' },
        { type: 'password', name: 'pass', message: 'Gmail App Password (16 letters; spaces are fine)', validate: (v) => cleanPass(v).length === 16 || 'An App Password is exactly 16 letters. Create one at myaccount.google.com/apppasswords' },
      ], { onCancel });
      cfg = { provider: 'gmail', host: 'smtp.gmail.com', port: 587, user: g.user.trim(), pass: cleanPass(g.pass), from: g.user.trim() };
    } else if (a.provider === 'brevo') {
      const b = await prompts([
        { type: 'password', name: 'key', message: 'Brevo API key (Brevo > SMTP & API > API Keys)', validate: (v) => String(v).trim().length > 20 || 'That looks too short for an API key' },
        { type: 'text', name: 'from', message: 'Sender email (must be verified in Brevo > Senders)', initial: adminEmail, validate: (v) => validEmail(v) || 'Enter a valid email' },
      ], { onCancel });
      cfg = { provider: 'brevo', apiKey: b.key.trim(), from: b.from.trim() };
    } else {
      const s = await prompts([
        { type: 'text', name: 'host', message: 'SMTP host (e.g. smtp.office365.com)', validate: (v) => v.trim().length > 3 || 'Required' },
        { type: 'number', name: 'port', message: 'SMTP port', initial: 587 },
        { type: 'text', name: 'user', message: 'SMTP username', validate: (v) => v.trim().length > 0 || 'Required' },
        { type: 'password', name: 'pass', message: 'SMTP password' },
        { type: 'text', name: 'from', message: 'Sender email', initial: adminEmail, validate: (v) => validEmail(v) || 'Enter a valid email' },
      ], { onCancel });
      cfg = { provider: 'smtp', host: s.host.trim(), port: s.port, user: s.user.trim(), pass: s.pass, from: s.from.trim() };
    }
    log(`\nSending a test email to ${adminEmail} ...`);
    try { await sendTest(cfg, adminEmail, o); log('Test email sent. Check that inbox (and spam) to confirm.\n'); break; }
    catch (e) {
      log(`\nThe test email FAILED:\n  ${explain(e, a.provider)}\n`);
      const { next } = await prompts({ type: 'select', name: 'next', message: 'What now?', choices: [
        { title: 'Try again with different details', value: 'retry' },
        { title: 'Save anyway (email will not work until fixed)', value: 'save' },
        { title: 'Cancel (change nothing)', value: 'cancel' }] }, { onCancel });
      if (next === 'cancel') { log('Cancelled. Nothing was changed.'); return { saved: false }; }
      if (next === 'save') break;
    }
  }

  const v = {
    PORT: existing.PORT || '5000', MONGO_URI: existing.MONGO_URI || 'mongodb://127.0.0.1:27017/bioguard',
    JWT_SECRET: existing.JWT_SECRET && existing.JWT_SECRET.length >= 32 && !/change_me/i.test(existing.JWT_SECRET) ? existing.JWT_SECRET : crypto.randomBytes(32).toString('hex'),
    CLIENT_URL: existing.CLIENT_URL || 'http://localhost:5173',
    ACCEPT_THRESHOLD: existing.ACCEPT_THRESHOLD || '0.75', STEPUP_THRESHOLD: existing.STEPUP_THRESHOLD || '0.55',
    ADMIN_EMAIL: adminEmail, ADMIN_NAME: existing.ADMIN_NAME || 'Administrator',
    BREVO_API_KEY: cfg.provider === 'brevo' ? cfg.apiKey : '',
    SMTP_HOST: cfg.provider === 'brevo' ? '' : cfg.host, SMTP_PORT: cfg.provider === 'brevo' ? '587' : String(cfg.port),
    SMTP_USER: cfg.provider === 'brevo' ? '' : cfg.user, SMTP_PASS: cfg.provider === 'brevo' ? '' : cfg.pass,
    MAIL_FROM: cfg.from, NODE_ENV: existing.NODE_ENV || 'development', STAFF_2FA: existing.STAFF_2FA || 'false',
  };
  if (fs.existsSync(envFile)) fs.copyFileSync(envFile, `${envFile}.backup`);
  fs.writeFileSync(envFile, renderEnv(v), 'ascii');
  log(`Saved ${envFile}${fs.existsSync(`${envFile}.backup`) ? ' (old file kept as .env.backup)' : ''}`);
  log('\nNext: npm run dev  (from the main bioguard folder), open http://localhost:5173,');
  log('choose "Email me a login code instead", and enter your admin email.\n');
  return { saved: true, values: v };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((r) => process.exit(r.saved ? 0 : 1)).catch((e) => { if (e.cancelled) { console.log('\nCancelled. Nothing was changed.'); process.exit(1); } console.error(e); process.exit(1); });
}
