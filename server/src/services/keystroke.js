import { clamp } from './fusion.js';

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

/** events: [{ k, d, u }] key, keydown ms, keyup ms. Returns dwell[] and flight[] timings. */
export function timings(events) {
  const dwell = [], flight = [];
  for (let i = 0; i < events.length; i++) {
    dwell.push(events[i].u - events[i].d);
    if (i < events.length - 1) flight.push(events[i + 1].d - events[i].u);
  }
  return { dwell, flight };
}

export const toVector = (events) => { const t = timings(events); return [...t.dwell, ...t.flight]; };

export function aggStats(events) {
  const { dwell, flight } = timings(events);
  const span = events.length > 1 ? events[events.length - 1].u - events[0].d : 0;
  return {
    meanDwell: mean(dwell), sdDwell: sd(dwell),
    meanFlight: mean(flight), sdFlight: sd(flight),
    cpm: span > 0 ? (events.length / span) * 60000 : 0,
  };
}

/** Build a template from N samples of the same phrase. */
export function buildTemplate(phrase, samples) {
  const vectors = samples.map(toVector);
  const len = vectors[0].length;
  const m = [], s = [];
  for (let j = 0; j < len; j++) {
    const col = vectors.map((v) => v[j]);
    const mu = mean(col);
    m.push(mu);
    s.push(Math.max(sd(col), 20, 0.15 * Math.abs(mu))); // floor avoids over-fit to tiny variance
  }
  const aggs = samples.map(aggStats);
  const keys = ['meanDwell', 'sdDwell', 'meanFlight', 'sdFlight', 'cpm'];
  const agg = Object.fromEntries(keys.map((k) => [k, mean(aggs.map((a) => a[k]))]));
  return { phrase, mean: m, std: s, agg, samples: samples.length };
}

/** Same-phrase matching: scaled Manhattan distance -> gaussian-like similarity in [0,1]. */
export function scorePhrase(tpl, events) {
  const v = toVector(events);
  if (v.length !== tpl.mean.length) return null;
  const d = v.reduce((s, x, i) => s + Math.abs(x - tpl.mean[i]) / tpl.std[i], 0) / v.length;
  return clamp(Math.exp(-0.5 * (d / 1.2) ** 2));
}

/** Free-text matching (continuous auth): compare aggregate rhythm statistics. */
export function scoreFree(tpl, events) {
  const a = aggStats(events), t = tpl.agg;
  const keys = ['meanDwell', 'meanFlight', 'cpm'];
  const d = keys.reduce((s, k) => s + Math.abs(a[k] - t[k]) / Math.max(0.4 * t[k], 15), 0) / keys.length;
  return clamp(Math.exp(-0.5 * (d / 1.2) ** 2));
}

/**
 * Template ageing: after a very confident match, nudge the stored template toward the new sample
 * (exponential moving average) so it follows slow, natural changes in the user's typing.
 */
export function updateTemplate(tpl, events, alpha = 0.1) {
  const v = toVector(events);
  if (v.length !== tpl.mean.length) return null;
  const mean = tpl.mean.map((m, i) => (1 - alpha) * m + alpha * v[i]);
  const std = tpl.std.map((s, i) => Math.max(20, 0.15 * Math.abs(mean[i]), (1 - alpha) * s + alpha * Math.abs(v[i] - tpl.mean[i]) * 1.25));
  return { mean, std };
}
