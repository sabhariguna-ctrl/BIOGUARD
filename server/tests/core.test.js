import test from 'node:test';
import assert from 'node:assert/strict';
import { fuse } from '../src/services/fusion.js';
import { buildTemplate, scorePhrase } from '../src/services/keystroke.js';
import { scoreFace } from '../src/services/faceMatch.js';

const typing = (jit, base = 0) => 'hello world'.split('').map((k, i) => {
  const d = 1000 + i * 180 + base + (Math.sin(i * jit) * 8);
  return { k, d, u: d + 90 + (i % 3) * 10 };
});

test('fusion: genuine passes, impostor rejected, quality shifts weights', () => {
  assert.equal(fuse({ faceScore: 0.95, keyScore: 0.9, faceQuality: 0.9 }).decision, 'ACCEPT');
  assert.equal(fuse({ faceScore: 0.2, keyScore: 0.1, faceQuality: 0.9 }).decision, 'REJECT');
  assert.ok(fuse({ faceScore: 0.9, keyScore: 0.9, faceQuality: 0.1 }).wFace < fuse({ faceScore: 0.9, keyScore: 0.9, faceQuality: 1 }).wFace);
});

test('keystroke: own rhythm scores higher than a different rhythm', () => {
  const tpl = buildTemplate('hello world', [typing(1), typing(1.3), typing(0.7), typing(1.1), typing(0.9)]);
  const own = scorePhrase(tpl, typing(1.2));
  const other = scorePhrase(tpl, 'hello world'.split('').map((k, i) => ({ k, d: i * 90, u: i * 90 + 40 })));
  assert.ok(own > 0.6, `own=${own}`);
  assert.ok(other < own);
});

test('face: identical descriptor scores 1', () => {
  const d = Array.from({ length: 128 }, (_, i) => Math.sin(i));
  assert.equal(scoreFace([d], d).score, 1);
});

import { updateTemplate } from '../src/services/keystroke.js';
import { explain } from '../src/services/explain.js';

test('template ageing moves the mean toward a new sample but keeps a std floor', () => {
  const tpl = buildTemplate('hello world', [typing(1), typing(1.3), typing(0.7), typing(1.1), typing(0.9)]);
  const slower = typing(1, 0).map((e) => ({ ...e, u: e.u + 40 }));
  const next = updateTemplate(tpl, slower);
  assert.ok(next.mean[0] > tpl.mean[0]);
  assert.ok(next.std.every((s) => s >= 20));
});

test('explain: low camera quality is reported and bad face is flagged', () => {
  const out = explain({ faceScore: 0.3, keyScore: 0.9, faceQuality: 0.2, wFace: 0.3, wKey: 0.7, mode: 'login' });
  assert.ok(out.some((o) => o.tone === 'bad'));
  assert.ok(out.some((o) => /Camera quality was low/.test(o.text)));
});
