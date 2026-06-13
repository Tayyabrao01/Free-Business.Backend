const Reward = require('../models/Reward');
const User = require('../models/User');
const { TIERS } = require('../utils/rewardConfig');

const getPendingRewards = async (req, res) => {
  try {
    const claims = await Reward.find({ status: 'pending' })
      .populate('user', 'name email currentTier')
      .sort({ requestedAt: -1 });
    return res.status(200).json(claims);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch pending rewards', error: error.message });
  }
};

const approveReward = async (req, res) => {
  try {
    const claim = await Reward.findById(req.params.claimId);
    if (!claim) {
      return res.status(404).json({ message: 'Claim not found' });
    }

    if (claim.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending claims can be approved' });
    }

    claim.status = 'approved';
    claim.approvedAt = new Date();
    claim.adminNotes = req.body.adminNotes || claim.adminNotes;
    await claim.save();

    await User.updateOne(
      { _id: claim.user, 'rewardsReceived.rewardId': claim._id },
      { $set: { 'rewardsReceived.$.status': 'approved' } }
    );

    return res.status(200).json({ message: 'Reward approved', claim });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to approve reward', error: error.message });
  }
};

const rejectReward = async (req, res) => {
  try {
    const claim = await Reward.findById(req.params.claimId);
    if (!claim) {
      return res.status(404).json({ message: 'Claim not found' });
    }

    if (claim.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending claims can be rejected' });
    }

    claim.status = 'rejected';
    claim.adminNotes = req.body.adminNotes || 'Rejected by admin';
    await claim.save();

    await User.updateOne(
      { _id: claim.user, 'rewardsReceived.rewardId': claim._id },
      { $set: { 'rewardsReceived.$.status': 'rejected' } }
    );

    return res.status(200).json({ message: 'Reward rejected', claim });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to reject reward', error: error.message });
  }
};

const getRewardStatistics = async (req, res) => {
  try {
    const [pending, approved, paid, rejected, totalPaidAmount] = await Promise.all([
      Reward.countDocuments({ status: 'pending' }),
      Reward.countDocuments({ status: 'approved' }),
      Reward.countDocuments({ status: 'paid' }),
      Reward.countDocuments({ status: 'rejected' }),
      Reward.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$rewardAmount' } } },
      ]),
    ]);

    const tierBreakdown = await Reward.aggregate([
      { $group: { _id: '$tier', count: { $sum: 1 }, amount: { $sum: '$rewardAmount' } } },
    ]);

    const topEarners = await User.find()
      .select('name totalCommission referralEarnings currentTier')
      .sort({ totalCommission: -1 })
      .limit(5);

    return res.status(200).json({
      counts: { pending, approved, paid, rejected },
      totalPaidAmount: totalPaidAmount[0]?.total || 0,
      tierBreakdown,
      tiers: TIERS,
      topEarners,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch statistics', error: error.message });
  }
};

module.exports = {
  getPendingRewards,
  approveReward,
  rejectReward,
  getRewardStatistics,
};
