import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import { MailLog } from '../models/MailLog.js';

/**
 * Email providers (first one configured wins):
 *   BREVO_API_KEY  -> Brevo transactional API over HTTPS (works on Render/Railway/Vercel, free 300 mails/day, any recipient)
 *   RESEND_API_KEY -> Resend API over HTTPS (needs a verified domain to email other people)
 *   SMTP_HOST      -> classic SMTP such as Gmail (works locally; many free hosts BLOCK SMTP ports)
 */
export const provider = () => (process.env.BREVO_API_KEY ? 'brevo' : process.env.RESEND_API_KEY ? 'resend' : process.env.SMTP_HOST ? 'smtp' : null);
export const isMailConfigured = () => !!provider();
/** Dev mode must be switched on explicitly (ALLOW_DEV_CODES=true) and never works in production. Codes are then printed and shown in the app. */
export const devMode = () => !isMailConfigured() && process.env.ALLOW_DEV_CODES === 'true' && process.env.NODE_ENV !== 'production';

const parseFrom = (s) => {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(s || '');
  return m ? { name: m[1].replace(/^"|"$/g, '') || 'BioGuard', email: m[2].trim() } : { name: 'BioGuard', email: (s || '').trim() };
};
const sender = () => parseFrom(process.env.MAIL_FROM || process.env.SMTP_USER || '');

let transporter = null;
const smtp = () => (transporter ||= nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
}));

const apiError = (name, status, body) => {
  let detail = body;
  try { const j = JSON.parse(body); detail = j.message || j.error || body; } catch { /* keep raw */ }
  detail = String(detail).slice(0, 220);
  let hint = '';
  if (status === 401 || status === 403) hint = ` Check that ${name === 'brevo' ? 'BREVO_API_KEY' : 'RESEND_API_KEY'} is correct.`;
  if (/sender|from|domain|verify|not valid/i.test(detail)) hint = name === 'brevo' ? ' In Brevo, open Senders & IP > Senders and verify the exact address used in MAIL_FROM.' : ' In Resend, verify your domain, or send only to your own account email while testing.';
  return Object.assign(new Error(`The ${name} email service rejected the message (HTTP ${status}): ${detail}.${hint}`), { status: 502 });
};

async function viaApi(name, { to, subject, text, html }) {
  const f = sender();
  if (!f.email) throw Object.assign(new Error('MAIL_FROM is not set. Use the format: BioGuard <you@example.com>'), { status: 502 });
  const brevo = name === 'brevo';
  const url = brevo ? `${process.env.BREVO_API_URL || 'https://api.brevo.com'}/v3/smtp/email` : `${process.env.RESEND_API_URL || 'https://api.resend.com'}/emails`;
  const res = await fetch(url, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: brevo ? { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' } : { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(brevo
      ? { sender: { name: f.name, email: f.email }, to: [{ email: to }], subject, htmlContent: html, textContent: text }
      : { from: `${f.name} <${f.email}>`, to: [to], subject, html, text }),
  }).catch((e) => { throw Object.assign(new Error(`Could not reach the ${name} email service: ${e.message}`), { status: 502 }); });
  if (!res.ok) throw apiError(name, res.status, await res.text());
}

const smtpFriendly = (e) => {
  if (e.code === 'EAUTH' || /Invalid login|Username and Password|535/i.test(e.message)) return 'SMTP login failed. For Gmail: turn on 2-Step Verification, create a 16-letter App Password, set SMTP_USER to your full Gmail address and SMTP_PASS to that App Password.';
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED'].includes(e.code)) return `Could not reach the SMTP server (${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}). If you host on Render or a similar free host, SMTP ports are blocked: use BREVO_API_KEY instead.`;
  return `Email could not be sent: ${e.message}`;
};

const record = (doc) => { if (mongoose.connection.readyState === 1) MailLog.create(doc).catch(() => {}); };

export async function sendMail({ to, subject, text, html }) {
  const p = provider();
  if (!p && !devMode()) throw Object.assign(new Error('Email is not set up on this server. The administrator must configure an email provider.'), { status: 502 });
  if (!p) {
    console.log(`\n[mail:dev] to=${to} | ${subject}\n${text}\n`);
    record({ to, subject, status: 'dev', provider: 'dev' });
    return { dev: true };
  }
  try {
    if (p === 'smtp') {
      try { await smtp().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html }); }
      catch (e) { transporter = null; throw Object.assign(new Error(smtpFriendly(e)), { status: 502 }); }
    } else await viaApi(p, { to, subject, text, html });
    record({ to, subject, status: 'sent', provider: p });
    return { provider: p };
  } catch (e) {
    record({ to, subject, status: 'failed', provider: p, error: e.message });
    console.error(`[mail:${p}] failed for ${to}: ${e.message}`);
    throw e;
  }
}

/** What an end user may see: details only in development, a generic line in production. */
export const publicMailError = (e) => (process.env.NODE_ENV === 'production'
  ? 'We could not send the email right now. Please try again in a minute, or contact your administrator.'
  : e.message);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Branded HTML + plain text email. */
export function template({ title, intro, code, note, button }) {
  const html = `<!doctype html><html><body style="margin:0;background:#eef2f8;padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#101a30">
<div style="max-width:480px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d9e0ec">
<div style="background:#0b1324;padding:20px 24px;color:#ffffff;font-size:20px;font-weight:700">
<span style="color:#33d6bd">&#9679;</span><span style="color:#8b7cf6">&#9679;</span> BioGuard</div>
<div style="padding:24px"><h2 style="margin:0 0 12px;font-size:20px">${esc(title)}</h2>
<p style="margin:0 0 16px;line-height:1.55;color:#37445f">${esc(intro)}</p>
${code ? `<div style="font-size:34px;letter-spacing:10px;font-weight:700;text-align:center;background:#f3f6fb;border-radius:12px;padding:16px;margin:0 0 16px;font-family:Consolas,monospace">${esc(code)}</div>` : ''}
${button ? `<p style="text-align:center;margin:0 0 16px"><a href="${esc(button.url)}" style="background:#0e9f8e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">${esc(button.label)}</a></p>` : ''}
${note ? `<p style="margin:0;font-size:13px;color:#5b6987;line-height:1.5">${esc(note)}</p>` : ''}
</div></div><p style="text-align:center;font-size:12px;color:#8d9bb8">Sent by BioGuard. If you did not expect this email, you can ignore it.</p></body></html>`;
  const text = [title, '', intro, code ? `\nCode: ${code}\n` : '', button ? `${button.label}: ${button.url}\n` : '', note || ''].join('\n');
  return { html, text };
}

export const sendTemplated = (to, subject, opts) => sendMail({ to, subject, ...template(opts) });
