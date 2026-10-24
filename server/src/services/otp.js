import crypto from 'crypto';
import { OtpCode } from '../models/OtpCode.js';
import { httpError } from '../utils/httpError.js';

const hash = (email, code) => crypto.createHash('sha256').update(`${code}:${email}:${process.env.JWT_SECRET || 'dev'}`).digest('hex');

/** Create a one-time code (stored hashed). Throws 429 if one was requested very recently. */
export async function issueOtp(email, purpose, { minutes = 10, cooldownSec = 30, meta = null } = {}) {
  email = email.toLowerCase();
  const existing = await OtpCode.findOne({ email, purpose });
  if (existing) {
    const wait = cooldownSec - (Date.now() - existing.createdAt.getTime()) / 1000;
    if (wait > 0) throw httpError(429, `Please wait ${Math.ceil(wait)} seconds before requesting another code.`);
  }
  await OtpCode.deleteMany({ email, purpose });
  const code = String(crypto.randomInt(100000, 1000000));
  await OtpCode.create({ email, purpose, codeHash: hash(email, code), expiresAt: new Date(Date.now() + minutes * 60_000), meta });
  return code;
}

export const discardOtp = (email, purpose) => OtpCode.deleteMany({ email: email.toLowerCase(), purpose });

/** Validate and consume a code. At most 5 wrong guesses per code. */
export async function checkOtp(email, purpose, code) {
  email = email.toLowerCase();
  const rec = await OtpCode.findOne({ email, purpose });
  if (!rec || rec.expiresAt < new Date()) throw httpError(400, 'That code has expired. Request a new one.');
  if (rec.tries >= 5) { await OtpCode.deleteOne({ _id: rec._id }); throw httpError(429, 'Too many wrong attempts. Request a new code.'); }
  const a = Buffer.from(rec.codeHash, 'hex'), b = Buffer.from(hash(email, String(code)), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await OtpCode.updateOne({ _id: rec._id }, { $inc: { tries: 1 } });
    throw httpError(400, 'That code is not correct.');
  }
  await OtpCode.deleteOne({ _id: rec._id });
  return rec;
}
