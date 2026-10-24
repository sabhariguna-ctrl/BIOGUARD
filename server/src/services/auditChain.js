import crypto from 'crypto';
import { AuditBlock } from '../models/AuditBlock.js';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const GENESIS = '0'.repeat(64);
let tail = Promise.resolve();

/** Append a block whose hash covers its content AND the previous block's hash (tamper-evident chain). */
export function appendAudit(type, data = {}) {
  const job = tail.then(async () => {
    const last = await AuditBlock.findOne().sort({ index: -1 });
    const index = last ? last.index + 1 : 0;
    const prevHash = last ? last.hash : GENESIS;
    const payload = JSON.stringify({ index, ts: new Date().toISOString(), type, data, prevHash });
    return AuditBlock.create({ index, payload, prevHash, hash: sha256(payload) });
  });
  tail = job.catch(() => {});
  return job;
}

export async function verifyChain() {
  const blocks = await AuditBlock.find().sort({ index: 1 }).lean();
  let prev = GENESIS;
  for (const b of blocks) {
    const parsed = JSON.parse(b.payload);
    if (sha256(b.payload) !== b.hash) return { valid: false, brokenAt: b.index, reason: 'Block content was modified', total: blocks.length };
    if (b.prevHash !== prev || parsed.prevHash !== prev) return { valid: false, brokenAt: b.index, reason: 'Chain link broken (block removed or reordered)', total: blocks.length };
    prev = b.hash;
  }
  return { valid: true, total: blocks.length, head: prev };
}
