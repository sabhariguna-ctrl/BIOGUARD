import { Notification } from '../models/Notification.js';
import { emitUser } from '../utils/realtime.js';

/** Persist an in-app notification and push it live. Never throws. */
export async function notify(userId, { title, body = '', type = 'info', link = null }) {
  try {
    const n = await Notification.create({ user: userId, title, body, type, link });
    emitUser(userId, 'notify', n);
    return n;
  } catch (e) { console.error('notify failed:', e.message); return null; }
}
