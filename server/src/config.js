import { isMailConfigured } from './utils/mailer.js';

/** Fail fast on unsafe production settings, warn about risky development ones. */
export function validateEnv() {
  const prod = process.env.NODE_ENV === 'production';
  const problems = [], warnings = [];
  const admin = (process.env.ADMIN_EMAIL || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(admin) || /example\.|your-|[<>]/i.test(admin)) problems.push('ADMIN_EMAIL must be the real email address of the one administrator (the inbox that will receive the admin login code). Run: npm run setup');
  const from = process.env.MAIL_FROM || '', smtpUser = process.env.SMTP_USER || '';
  if (isMailConfigured() && (/example\.|your-|[<]xxx/i.test(from) || (process.env.SMTP_HOST && /unga-|your-|example\./i.test(smtpUser)))) problems.push('MAIL_FROM / SMTP_USER still contain example text. Use your real sender address. Easiest fix: run  npm run setup');
  if (prod && process.env.ALLOW_DEV_CODES === 'true') problems.push('ALLOW_DEV_CODES must not be true in production.');
  const secret = process.env.JWT_SECRET || '';
  if (!secret || /change_me|dev_secret|secret$/i.test(secret) || secret.length < 24) {
    (prod ? problems : warnings).push('JWT_SECRET is missing, default, or shorter than 24 characters. Generate a long random value.');
  }
  if (prod) {
    if (!process.env.CLIENT_URL || /localhost|127\\.0\\.0\\.1/.test(process.env.CLIENT_URL)) problems.push('CLIENT_URL must be your real frontend URL (https://...).');
    if (!process.env.MONGO_URI || /localhost|127\\.0\\.0\\.1/.test(process.env.MONGO_URI)) problems.push('MONGO_URI must point to a hosted database such as MongoDB Atlas.');
    if (process.env.RENDER && !process.env.BREVO_API_KEY && !process.env.RESEND_API_KEY) warnings.push('Render blocks SMTP ports on free plans. Use BREVO_API_KEY for email.');
  }
  if (!isMailConfigured()) {
    if (process.env.ALLOW_DEV_CODES === 'true' && !prod) warnings.push('DEV CODES are ON (ALLOW_DEV_CODES=true): codes are shown on screen. Never use this when real users sign up.');
    else problems.push('No email provider configured. Set BREVO_API_KEY, or SMTP_HOST (+SMTP_USER, SMTP_PASS), so students and teachers receive their codes by email. Easiest: run  npm run setup');
  }
  warnings.forEach((w) => console.warn('[config] warning:', w));
  if (problems.length) { problems.forEach((p) => console.error('[config] ERROR:', p)); console.error('Fix the problems above and restart.'); process.exit(1); }
}

/** CLIENT_URL may hold several comma-separated frontends. Spaces and trailing slashes are ignored. */
export const allowedOrigins = () => (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
