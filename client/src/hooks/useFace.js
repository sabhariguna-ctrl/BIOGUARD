import { useCallback, useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
let modelsPromise = null;
// Pick a TensorFlow backend explicitly (GPU first, CPU fallback), then load models.
// On failure the cache is cleared so "Try again" really retries.
const loadModels = () => (modelsPromise ||= (async () => {
  const ok = await faceapi.tf.setBackend('webgl').catch(() => false);
  if (!ok) await faceapi.tf.setBackend('cpu');
  await faceapi.tf.ready();
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
})().catch((e) => { modelsPromise = null; throw e; }));

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ear = (p) => (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Webcam + face-api.js: descriptor (128-d), quality metrics, and active liveness challenges. */
export function useFace() {
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const [state, setState] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState('');

  const start = useCallback(async () => {
    setState('loading'); setError('');
    try {
      // 1) camera first, so permission problems show up immediately
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      const v = videoRef.current;
      v.srcObject = stream;
      await v.play();
      // 2) then the face models
      await loadModels().catch((e) => {
        console.error('Face model load failed:', e);
        throw new Error('Face models could not be loaded. Check your internet, turn off VPN or ad blockers, then try again.');
      });
      setState('ready');
    } catch (e) {
      setState('error');
      setError(
        e.name === 'NotAllowedError' ? 'Camera permission was blocked. Allow camera access in your browser and retry.'
        : e.name === 'NotFoundError' ? 'No camera found on this device.'
        : e.name === 'NotReadableError' ? 'Camera is being used by another app. Close Zoom, Teams or Meet and retry.'
        : e.message || 'Could not start the camera'
      );
    }
  }, []);

  const stop = useCallback(() => {
    const v = videoRef.current;
    v?.srcObject?.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
  }, []);
  useEffect(() => stop, [stop]);

  const brightness = () => {
    const v = videoRef.current, c = canvasRef.current;
    c.width = 32; c.height = 24;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, 32, 24);
    const d = ctx.getImageData(0, 0, 32, 24).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (d.length / 4) / 255;
  };

  /** One detection pass: { descriptor, landmarks, quality, nose ratio } or null. */
  const detect = useCallback(async (withDescriptor = true) => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return null;
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
    let task = faceapi.detectSingleFace(v, opts).withFaceLandmarks();
    const r = await (withDescriptor ? task.withFaceDescriptor() : task);
    if (!r) return null;
    const p = r.landmarks.positions;
    const leftEar = ear(p.slice(36, 42)), rightEar = ear(p.slice(42, 48));
    const noseRatio = (p[30].x - p[0].x) / (p[16].x - p[0].x); // ~0.5 facing camera
    return {
      descriptor: withDescriptor ? Array.from(r.descriptor) : null,
      ear: (leftEar + rightEar) / 2,
      noseRatio,
      quality: { detScore: r.detection.score, brightness: brightness(), faceRatio: r.detection.box.width / v.videoWidth },
    };
  }, []);

  /** Active liveness: user must perform the server-chosen random action within the timeout. */
  const runChallenge = useCallback(async (type, onTick, timeoutMs = 12000) => {
    const t0 = Date.now();
    let blinks = 0, closed = false;
    while (Date.now() - t0 < timeoutMs) {
      const r = await detect(false);
      if (r) {
        onTick?.(r);
        if (type === 'blink') {
          if (r.ear < 0.2 && !closed) closed = true;
          if (r.ear > 0.25 && closed) { closed = false; blinks += 1; }
          if (blinks >= 2) return true;
        } else if (type === 'turn_left' && r.noseRatio > 0.62) return true;   // user's left = image right (unmirrored feed)
        else if (type === 'turn_right' && r.noseRatio < 0.38) return true;
      }
      await sleep(90);
    }
    return false;
  }, [detect]);

  /** Wait for a frontal, well-detected frame then capture the descriptor. */
  const captureFrontal = useCallback(async (timeoutMs = 6000) => {
    const t0 = Date.now();
    let best = null;
    while (Date.now() - t0 < timeoutMs) {
      const r = await detect(true);
      if (r) {
        if (!best || r.quality.detScore > best.quality.detScore) best = r;
        if (Math.abs(r.noseRatio - 0.5) < 0.09 && r.quality.detScore > 0.8) return r;
      }
      await sleep(120);
    }
    return best;
  }, [detect]);

  return { videoRef, state, error, start, stop, detect, runChallenge, captureFrontal };
}
