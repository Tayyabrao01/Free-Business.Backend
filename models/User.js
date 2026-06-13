const mongoose = require('mongoose');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      default: 'Not specified',
    },
    phone: {
      type: String,
    },
    whatsappNumber: {
      type: String,
    },
    role: {
      type: String,
      enum: ['user', 'buyer', 'seller', 'agent', 'admin'],
      default: 'user',
    },
    avatar: {
      type: String,
    },
    bio: {
      type: String,
      default: '',
      maxlength: 500,
    },
    profileImage: {
      type: String,
    },
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    referrals: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    referralEarnings: {
      type: Number,
      default: 0,
    },
    totalCommission: {
      type: Number,
      default: 0,
    },
    rewardsReceived: [
      {
        rewardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reward' },
        tier: String,
        amount: Number,
        status: String,
        receivedAt: { type: Date, default: Date.now },
      },
    ],
    currentTier: {
      type: String,
      enum: ['none', 'bronze', 'silver', 'gold'],
      default: 'none',
    },
    propertiesSold: {
      type: Number,
      default: 0,
    },
    propertiesRented: {
      type: Number,
      default: 0,
    },
    postsCount: {
      type: Number,
      default: 0,
    },
    followersCount: {
      type: Number,
      default: 0,
    },
    passwordResetCode: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.pre('save', function generateReferralCode() {
  if (!this.referralCode) {
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    this.referralCode = `FB${suffix}`;
  }
});

userSchema.methods.syncFollowersCount = function syncFollowersCount() {
  this.followersCount = this.followers ? this.followers.length : 0;
};

// email index comes from unique: true on the field above
userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ whatsappNumber: 1 }, { unique: true, sparse: true });
userSchema.index({ followers: 1 });

module.exports = mongoose.model('User', userSchema);
