import crypto from 'crypto';
const TYPES = ['blink', 'turn_left', 'turn_right'];
const store = new Map(); // nonce -> { userId, type, exp }

export function issueChallenge(userId) {
  for (const [k, v] of store) if (v.exp < Date.now()) store.delete(k);
  const type = TYPES[crypto.randomInt(TYPES.length)];
  const nonce = crypto.randomBytes(12).toString('hex');
  store.set(nonce, { userId: userId.toString(), type, exp: Date.now() + 30_000 });
  return { nonce, type, expiresInSec: 30 };
}

/** One-time use: the client must report the SAME random challenge that the server issued. */
export function consumeChallenge(liveness, userId) {
  if (!liveness?.nonce) return { ok: false, reason: 'liveness_missing' };
  const c = store.get(liveness.nonce);
  store.delete(liveness.nonce);
  if (!c || c.exp < Date.now() || c.userId !== userId.toString()) return { ok: false, reason: 'liveness_expired' };
  if (!liveness.passed || liveness.type !== c.type) return { ok: false, reason: 'liveness_failed' };
  return { ok: true };
}
