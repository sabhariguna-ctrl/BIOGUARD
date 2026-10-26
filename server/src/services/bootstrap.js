
import crypto from 'crypto';
import { User } from '../models/User.js';

export const adminEmail = () =>
  (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

const randomPassword = () => crypto.randomBytes(32).toString('hex');

/**
 * The ONE administrator is defined by ADMIN_EMAIL.
 * There is no default password. The admin logs in with
 * a one-time code emailed to that address.
 * Anyone else holding the admin role is demoted.
 */
export async function ensureAdmin() {
  const email = adminEmail();

  if (!email) {
    throw new Error('ADMIN_EMAIL must be configured.');
  }

  const notes = [];

  let user = await User.findOne({ email }).select('+password');

  if (!user) {
    user = new User({
      name: process.env.ADMIN_NAME || 'Administrator',
      email,
      password: randomPassword(),
      role: 'admin',
      emailVerified: true,
    });

    await user.save();

    notes.push(
      `Administrator account created for ${email}. Log in with "Email me a login code".`
    );
  } else if (
    user.role !== 'admin' ||
    user.emailVerified === false ||
    user.approval !== 'none' ||
    user.inviteTokenHash
  ) {
    // Safely take over an existing account with the configured admin email.
    user.role = 'admin';
    user.emailVerified = true;
    user.approval = 'none';
    user.requestedRole = undefined;
    user.inviteTokenHash = undefined;
    user.inviteExpires = undefined;
    user.password = randomPassword();
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.failedLogins = 0;
    user.lockUntil = undefined;

    await user.save();

    notes.push(
      `${email} is now the administrator. Its password was reset: log in with "Email me a login code".`
    );
  }

  // Demote every other administrator.
  const others = await User.find({
    role: 'admin',
    email: { $ne: email },
  }).select('_id email');

  if (others.length) {
    await User.updateMany(
      { _id: { $in: others.map((other) => other._id) } },
      {
        $set: { role: 'faculty' },
        $inc: { tokenVersion: 1 },
      }
    );

    notes.push(
      `Only ${email} may be administrator. Demoted to faculty: ${others
        .map((other) => other.email)
        .join(', ')}`
    );
  }

  // Warn about demo accounts, but never count the configured administrator.
  try {
    const demoCount = await User.countDocuments({
      email: {
        $regex: '@bioguard\\.dev$',
        $ne: email,
      },
    });

    if (demoCount > 0) {
      notes.push(
        `${demoCount} demo account(s) (@bioguard.dev) with public passwords exist. Remove them: npm run remove-demo`
      );
    }
  } catch {
    // Some test databases may not support regex queries.
  }

  return notes;
}
