import { clamp } from './fusion.js';

export const euclid = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));

/** Distance 0.35 or lower is near-certain match, 0.70 or higher is a clear mismatch (face-api 128-d descriptors). */
export function scoreFace(templates, descriptor) {
  const ds = templates.map((t) => euclid(t, descriptor)).sort((x, y) => x - y);
  const d = ds.slice(0, Math.min(2, ds.length)).reduce((s, x) => s + x, 0) / Math.min(2, ds.length);
  return { score: clamp((0.7 - d) / 0.35), distance: d };
}

/** Capture quality 0..1 from detector confidence, exposure and face size. */
export function computeQuality({ detScore = 0.5, brightness = 0.5, faceRatio = 0.2 } = {}) {
  const exposure = clamp(1 - Math.abs(brightness - 0.5) * 2.2);
  const size = clamp(faceRatio / 0.25);
  return clamp(0.5 * clamp(detScore) + 0.25 * exposure + 0.25 * size);
}
