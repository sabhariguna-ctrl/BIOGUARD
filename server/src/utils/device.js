import crypto from 'crypto';
/** Lightweight device fingerprint from request headers (not for tracking, only to spot a new browser/machine). */
export function deviceInfo(req) {
  const ua = req.headers['user-agent'] || 'unknown';
  const hash = crypto.createHash('sha256').update(ua + (req.headers['accept-language'] || '')).digest('hex').slice(0, 16);
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return { hash, label: `${browser} on ${os}` };
}
