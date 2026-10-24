const pct = (x) => `${Math.round(x * 100)}%`;
const LIVE = {
  liveness_failed: 'The liveness action was not completed, so a photo or video replay cannot be ruled out.',
  liveness_expired: 'The liveness challenge expired. Start verification again.',
  liveness_missing: 'No liveness challenge was completed.',
};

/** Human-readable reasons behind a decision (explainable biometrics). */
export function explain({ faceScore, keyScore, faceQuality, wFace, wKey, reason, newDevice, mode }) {
  const out = [];
  if (LIVE[reason]) out.push({ tone: 'bad', text: LIVE[reason] });
  if (faceScore == null) out.push({ tone: 'warn', text: 'No face was captured in this check.' });
  else if (faceScore >= 0.85) out.push({ tone: 'good', text: `Your face matched your enrolled template strongly (${pct(faceScore)}).` });
  else if (faceScore >= 0.6) out.push({ tone: 'warn', text: `Your face matched, but with some difference (${pct(faceScore)}). Lighting or angle may be the cause.` });
  else out.push({ tone: 'bad', text: `Your face did not match the enrolled template (${pct(faceScore)}).` });

  if (keyScore == null) out.push({ tone: 'warn', text: mode === 'continuous' ? 'Not enough typing was captured, so this check relied on the face only.' : 'Typing rhythm was not captured.' });
  else if (keyScore >= 0.8) out.push({ tone: 'good', text: `Your typing rhythm matched your usual pattern (${pct(keyScore)}).` });
  else if (keyScore >= 0.5) out.push({ tone: 'warn', text: `Your typing was a little different from usual (${pct(keyScore)}).` });
  else out.push({ tone: 'bad', text: `Your typing rhythm differed a lot from your enrolled pattern (${pct(keyScore)}).` });

  if (faceScore != null && keyScore != null) {
    if (faceQuality < 0.5) out.push({ tone: 'warn', text: `Camera quality was low, so typing carried more weight (face ${pct(wFace)}, typing ${pct(wKey)}).` });
    else out.push({ tone: 'good', text: `Camera quality was good, so face carried ${pct(wFace)} of the decision.` });
  }
  if (newDevice) out.push({ tone: 'warn', text: 'This browser or device has not been used before, so an extra check is required.' });
  if (reason === 'no_face') out.push({ tone: 'bad', text: 'No face was visible. Stay inside the frame during the exam.' });
  return out;
}
