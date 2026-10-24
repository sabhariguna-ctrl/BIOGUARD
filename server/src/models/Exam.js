import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    durationMin: { type: Number, default: 30, min: 1 },
    heartbeatSec: { type: Number, default: 45, min: 15 },
    acceptThreshold: { type: Number, default: 0.75 },
    stepUpThreshold: { type: Number, default: 0.55 },
    published: { type: Boolean, default: true },
    shuffle: { type: Boolean, default: true },
    startsAt: Date,
    endsAt: Date,
    questions: [{ text: String, options: [String], answerIndex: Number }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
export const Exam = mongoose.model('Exam', schema);
