import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from './models/User.js';
import { BiometricTemplate } from './models/BiometricTemplate.js';
import { Attempt } from './models/Attempt.js';
import { AuthEvent } from './models/AuthEvent.js';
import { Notification } from './models/Notification.js';
import { Exam } from './models/Exam.js';

/** Deletes the demo accounts (@bioguard.dev) created by `npm run seed:demo`, and everything tied to them. */
await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bioguard');
const demo = await User.find({ email: { $regex: '@bioguard\\.dev$' } }).select('_id email');
const ids = demo.map((u) => u._id);
await Promise.all([
  Exam.deleteMany({ createdBy: { $in: ids } }),
  Attempt.deleteMany({ student: { $in: ids } }),
  BiometricTemplate.deleteMany({ user: { $in: ids } }),
  Notification.deleteMany({ user: { $in: ids } }),
  AuthEvent.deleteMany({ $or: [{ user: { $in: ids } }, { synthetic: true }] }),
]);
await User.deleteMany({ _id: { $in: ids } });
console.log(`Removed ${demo.length} demo account(s): ${demo.map((u) => u.email).join(', ') || 'none found'}`);
await mongoose.disconnect();
