const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tier: {
      type: String,
      enum: ['bronze', 'silver', 'gold'],
      required: true,
    },
    requirements: {
      followers: { type: Number, required: true },
      posts: { type: Number, required: true },
      sales: { type: Number, required: true },
    },
    rewardAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'paid', 'rejected'],
      default: 'pending',
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    approvedAt: Date,
    paidAt: Date,
    adminNotes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reward', rewardSchema);
