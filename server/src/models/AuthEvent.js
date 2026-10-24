import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', index: true },
    mode: { type: String, enum: ['login', 'continuous', 'test'], default: 'login' },
    faceScore: Number,
    keyScore: Number,
    faceQuality: Number,
    wFace: Number,
    fused: Number,
    decision: { type: String, enum: ['ACCEPT', 'STEP_UP', 'REJECT'] },
    live: Boolean,
    reason: String,
    label: { type: String, enum: ['genuine', 'impostor'] }, // for FAR/FRR evaluation
    synthetic: { type: Boolean, default: false },
    ip: String,
  },
  { timestamps: true }
);
export const AuthEvent = mongoose.model('AuthEvent', schema);
