import mongoose from 'mongoose';
// Only mathematical templates are stored - never raw photos or typed text.
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    // [{ vec: [128 numbers] }]; legacy nested arrays are still readable
    faceTemplates: { type: [mongoose.Schema.Types.Mixed], default: [] },
    keystroke: {
      phrase: String,
      mean: [Number],
      std: [Number],
      agg: { meanDwell: Number, sdDwell: Number, meanFlight: Number, sdFlight: Number, cpm: Number },
      samples: { type: Number, default: 0 },
    },
    adaptations: { type: Number, default: 0 }, // how many times the template self-updated after a confident match
  },
  { timestamps: true }
);
export const BiometricTemplate = mongoose.model('BiometricTemplate', schema);
