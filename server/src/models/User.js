import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'faculty', 'student'], default: 'student' },
    rollNo: String,
    department: String,
    enrolled: { face: { type: Boolean, default: false }, keystroke: { type: Boolean, default: false } },
    lastLogin: Date,
    emailVerified: { type: Boolean, default: true }, // self-registered accounts start unverified
    tokenVersion: { type: Number, default: 0 },   // bump to sign out every session
    twoFactorEmail: { type: Boolean, default: false },
    loginDevices: [{ hash: String, label: String, firstSeen: Date, lastSeen: Date }],
    requestedRole: { type: String, enum: ['faculty'] },
    approval: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    inviteTokenHash: String,
    inviteExpires: Date,
    failedLogins: { type: Number, default: 0 },
    lockUntil: Date,
    devices: [{ hash: String, label: String, firstSeen: Date, lastSeen: Date }],
  },
  { timestamps: true }
);
schema.pre('save', async function (next) {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 11);
  next();
});
schema.methods.compare = function (plain) { return bcrypt.compare(plain, this.password); };
export const User = mongoose.model('User', schema);
