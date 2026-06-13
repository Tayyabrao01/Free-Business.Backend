const User = require('../models/User');
const {
  REFERRAL_SIGNUP_BONUS,
  calculateCommission,
  meetsTierRequirements,
  getTierConfig,
  getUserSalesCount,
} = require('../utils/rewardConfig');

const generateReferralCode = async () => {
  let code;
  let exists = true;

  while (exists) {
    const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    code = `FB${suffix}`;
    exists = await User.findOne({ referralCode: code });
  }

  return code;
};

const applyReferralOnRegister = async (newUser, referralCode) => {
  if (!referralCode || !newUser) return null;

  const referrer = await User.findOne({
    referralCode: String(referralCode).trim().toUpperCase(),
  });

  if (!referrer || referrer._id.toString() === newUser._id.toString()) {
    return null;
  }

  newUser.referredBy = referrer._id;
  await newUser.save();

  referrer.referrals.push({ user: newUser._id, joinedAt: new Date() });
  referrer.referralEarnings += REFERRAL_SIGNUP_BONUS;
  await referrer.save();

  return referrer;
};

const incrementPostsCount = async (userId) => {
  return User.findByIdAndUpdate(userId, { $inc: { postsCount: 1 } }, { new: true });
};

const recordPropertyCompletion = async (ownerId, purpose, price) => {
  const user = await User.findById(ownerId);
  if (!user) return null;

  const commission = calculateCommission(purpose, price);

  if (purpose === 'rent') {
    user.propertiesRented += 1;
  } else {
    user.propertiesSold += 1;
  }
  user.totalCommission += commission;
  updateCurrentTier(user);
  await user.save();

  return { user, commission };
};

const updateCurrentTier = (user) => {
  if (meetsTierRequirements(user, 'gold')) {
    user.currentTier = 'gold';
  } else if (meetsTierRequirements(user, 'silver')) {
    user.currentTier = 'silver';
  } else if (meetsTierRequirements(user, 'bronze')) {
    user.currentTier = 'bronze';
  } else {
    user.currentTier = 'none';
  }
};

const buildProgressPayload = (user) => {
  const sales = getUserSalesCount(user);
  const tiers = ['bronze', 'silver', 'gold'].map((tier) => {
    const config = getTierConfig(tier);
    const req = config.requirements;
    return {
      tier,
      rewardAmount: config.rewardAmount,
      requirements: req,
      progress: {
        followers: user.followersCount ?? (user.followers ? user.followers.length : 0),
        posts: user.postsCount || 0,
        sales,
      },
      percentages: {
        followers: Math.min(
          100,
          Math.round(
            (((user.followersCount ?? user.followers?.length) || 0) / req.followers) * 100
          )
        ),
        posts: Math.min(100, Math.round(((user.postsCount || 0) / req.posts) * 100)),
        sales: Math.min(100, Math.round((sales / req.sales) * 100)),
      },
      eligible: meetsTierRequirements(user, tier),
    };
  });

  return {
    currentTier: user.currentTier,
    postsCount: user.postsCount || 0,
    followersCount: user.followersCount ?? (user.followers ? user.followers.length : 0),
    propertiesSold: user.propertiesSold || 0,
    propertiesRented: user.propertiesRented || 0,
    totalSales: sales,
    totalCommission: user.totalCommission || 0,
    referralEarnings: user.referralEarnings || 0,
    referralCode: user.referralCode,
    totalReferrals: user.referrals?.length || 0,
    tiers,
  };
};

module.exports = {
  generateReferralCode,
  applyReferralOnRegister,
  incrementPostsCount,
  recordPropertyCompletion,
  updateCurrentTier,
  buildProgressPayload,
  meetsTierRequirements,
};
