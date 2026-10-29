const mongoose = require('mongoose');

const emailVerificationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['register', 'verification', 'password_reset', 'login'],
      default: 'verification',
    },
    codeHash: {
      type: String,
      required: true,
    },
    expires: {
      type: Date,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

emailVerificationSchema.index({ email: 1, purpose: 1 });

module.exports = mongoose.model('EmailVerification', emailVerificationSchema);
