const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  getMyProgress,
  claimReward,
  getMyClaims,
  getLeaderboard,
  applyReferral,
  getReferralEarnings,
} = require('../controllers/rewardController');

const router = express.Router();

router.get('/my-progress', authMiddleware, getMyProgress);
router.post('/claim', authMiddleware, claimReward);
router.get('/my-claims', authMiddleware, getMyClaims);
router.get('/leaderboard', authMiddleware, getLeaderboard);
router.post('/referral', authMiddleware, applyReferral);
router.get('/referral-earnings', authMiddleware, getReferralEarnings);

module.exports = router;
