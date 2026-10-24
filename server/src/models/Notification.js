import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    type: { type: String, enum: ['info', 'success', 'warn', 'danger'], default: 'info' },
    link: String,
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);
export const Notification = mongoose.model('Notification', schema);
