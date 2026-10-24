import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'submitted', 'terminated'], default: 'active' },
    answers: [Number],
    startedAt: { type: Date, default: Date.now },
    submittedAt: Date,
    score: Number,
    total: Number,
    trust: { type: Number, default: 1 },
    rejects: { type: Number, default: 0 },
    flags: [{ type: { type: String }, detail: String, at: { type: Date, default: Date.now } }],
    lastVerifiedAt: Date,
  },
  { timestamps: true }
);
schema.index({ exam: 1, student: 1 }, { unique: true });
export const Attempt = mongoose.model('Attempt', schema);
