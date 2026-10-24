import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    to: String, subject: String,
    status: { type: String, enum: ['sent', 'failed', 'dev'] },
    provider: String, error: String,
  },
  { timestamps: true }
);
export const MailLog = mongoose.model('MailLog', schema);
