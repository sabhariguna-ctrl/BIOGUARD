import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, index: true },
    purpose: { type: String, enum: ['verify_email', 'login', 'reset_password', 'step_up'], required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    tries: { type: Number, default: 0 },
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);
export const OtpCode = mongoose.model('OtpCode', schema);
