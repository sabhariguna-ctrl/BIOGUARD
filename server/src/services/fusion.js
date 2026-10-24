export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/**
 * Quality-aware adaptive score-level fusion.
 * Weighted sum rule: fused = wFace * faceScore + wKey * keyScore
 * wFace grows with face capture quality (lighting, size, detector confidence), so a dark/blurry
 * frame automatically shifts trust toward keystroke dynamics - and vice versa.
 */
export function fuse({ faceScore, keyScore, faceQuality = 0.5 }, { accept = 0.75, stepUp = 0.55 } = {}) {
  const hasFace = faceScore != null;
  const hasKey = keyScore != null;
  let fused = 0, wFace = 0, wKey = 0;
  if (hasFace && hasKey) {
    wFace = clamp(0.5 * faceQuality + 0.2, 0.2, 0.7);
    wKey = 1 - wFace;
    fused = wFace * faceScore + wKey * keyScore;
  } else if (hasFace) {
    wFace = 1;
    fused = faceScore * 0.9; // single-modality penalty
  } else if (hasKey) {
    wKey = 1;
    fused = keyScore * 0.8;
  }
  fused = clamp(fused);
  const decision = fused >= accept ? 'ACCEPT' : fused >= stepUp ? 'STEP_UP' : 'REJECT';
  return { fused, wFace, wKey, decision };
}
