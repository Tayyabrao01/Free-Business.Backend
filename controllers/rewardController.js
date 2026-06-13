const Reward = require('../models/Reward');
const User = require('../models/User');
const {
  getTierConfig,
  meetsTierRequirements,
  getUserSalesCount,
} = require('../utils/rewardConfig');
const {
  buildProgressPayload,
  applyReferralOnRegister,
} = require('../services/rewardTrackingService');

const getMyProgress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json(buildProgressPayload(user));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch progress', error: error.message });
  }
};

const claimReward = async (req, res) => {
  try {
    const { tier } = req.body;
    const config = getTierConfig(tier);

    if (!config) {
      return res.status(400).json({ message: 'Invalid tier. Use bronze, silver, or gold.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!meetsTierRequirements(user, tier)) {
      return res.status(400).json({ message: 'You have not met the requirements for this tier yet.' });
    }

    const existingPending = await Reward.findOne({
      user: user._id,
      tier,
      status: { $in: ['pending', 'approved'] },
    });

    if (existingPending) {
      return res.status(400).json({ message: 'You already have a pending or approved claim for this tier.' });
    }

    const alreadyPaid = await Reward.findOne({ user: user._id, tier, status: 'paid' });
    if (alreadyPaid) {
      return res.status(400).json({ message: 'You have already received payment for this tier.' });
    }

    const sales = getUserSalesCount(user);
    const claim = await Reward.create({
      user: user._id,
      tier,
      requirements: {
        followers: user.followersCount || 0,
        posts: user.postsCount || 0,
        sales,
      },
      rewardAmount: config.rewardAmount,
      status: 'pending',
      requestedAt: new Date(),
    });

    user.rewardsReceived.push({
      rewardId: claim._id,
      tier,
      amount: config.rewardAmount,
      status: 'pending',
    });
    user.currentTier = tier;
    await user.save();

    return res.status(201).json({
      message: 'Reward claim submitted for admin approval',
      claim,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to claim reward', error: error.message });
  }
};

const getMyClaims = async (req, res) => {
  try {
    const claims = await Reward.find({ user: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json(claims);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch claims', error: error.message });
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const users = await User.find()
      .select('name referralCode postsCount followersCount propertiesSold propertiesRented totalCommission currentTier')
      .sort({ totalCommission: -1, postsCount: -1 })
      .limit(20);

    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      name: user.name,
      currentTier: user.currentTier,
      postsCount: user.postsCount || 0,
      followersCount: user.followersCount || 0,
      totalSales: getUserSalesCount(user),
      totalCommission: user.totalCommission || 0,
      score:
        (user.totalCommission || 0) +
        (user.postsCount || 0) * 10 +
        getUserSalesCount(user) * 100,
    }));

    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return res.status(200).json(leaderboard);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch leaderboard', error: error.message });
  }
};

const applyReferral = async (req, res) => {
  try {
    const { referralCode } = req.body;
    if (!referralCode) {
      return res.status(400).json({ message: 'Referral code is required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.referredBy) {
      return res.status(400).json({ message: 'Referral code already applied to your account' });
    }

    const referrer = await applyReferralOnRegister(user, referralCode);
    if (!referrer) {
      return res.status(400).json({ message: 'Invalid referral code' });
    }

    return res.status(200).json({
      message: 'Referral applied successfully',
      referredBy: referrer.name,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to apply referral', error: error.message });
  }
};

const getReferralEarnings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('referrals.user', 'name email createdAt')
      .select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({
      referralCode: user.referralCode,
      referralEarnings: user.referralEarnings || 0,
      totalReferrals: user.referrals?.length || 0,
      referrals: user.referrals || [],
      referredBy: user.referredBy,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch referral earnings', error: error.message });
  }
};

module.exports = {
  getMyProgress,
  claimReward,
  getMyClaims,
  getLeaderboard,
  applyReferral,
  getReferralEarnings,
};
