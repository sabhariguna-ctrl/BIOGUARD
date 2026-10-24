import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    index: { type: Number, unique: true, required: true },
    payload: { type: String, required: true }, // canonical JSON string that is hashed
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
  },
  { timestamps: true }
);
export const AuditBlock = mongoose.model('AuditBlock', schema);
