import crypto from 'crypto';
import { User } from '../models/User.js';

export const adminEmail = () => (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const randomPassword = () => crypto.randomBytes(32).toString('hex');

/**
 * The ONE administrator is defined by ADMIN_EMAIL. There is no default password:
 * the admin logs in with a one-time code emailed to that address (or sets a password via "Forgot password").
 * Anyone else holding the admin role is demoted, so the admin email is the only way in.
 */
export async function ensureAdmin() {
  const email = adminEmail();
  const notes = [];
  let user = await User.findOne({ email }).select('+password');
  if (!user) {
    user = new User({ name: process.env.ADMIN_NAME || 'Administrator', email, password: randomPassword(), role: 'admin', emailVerified: true });
    await user.save();
    notes.push(`Administrator account created for ${email}. Log in with "Email me a login code".`);
  } else if (user.role !== 'admin' || user.emailVerified === false || user.approval !== 'none' || user.inviteTokenHash) {
    // an account with this email already existed (maybe self-registered): take it over safely
    user.role = 'admin'; user.emailVerified = true; user.approval = 'none'; user.requestedRole = undefined;
    user.inviteTokenHash = undefined; user.inviteExpires = undefined;
    user.password = randomPassword(); // old password may have been set by someone else
    user.tokenVersion = (user.tokenVersion || 0) + 1; user.failedLogins = 0; user.lockUntil = undefined;
    await user.save();
    notes.push(`${email} is now the administrator. Its password was reset: log in with "Email me a login code".`);
  }
  const others = await User.find({ role: 'admin', email: { $ne: email } }).select('_id email');
  if (others.length) {
    await User.updateMany({ _id: { $in: others.map((o) => o._id) } }, { role: 'faculty', $inc: { tokenVersion: 1 } });
    notes.push(`Only ${email} may be administrator. Demoted to faculty: ${others.map((o) => o.email).join(', ')}`);
  }
  try {
    const demo = await User.countDocuments({ email: { $regex: '@bioguard\\.dev$' } });
    if (demo) notes.push(`${demo} demo account(s) (@bioguard.dev) with public passwords exist. Remove them: npm run remove-demo`);
  } catch { /* regex not supported by some test databases */ }
  return notes;
}
