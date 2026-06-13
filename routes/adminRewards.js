const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const {
  getPendingRewards,
  approveReward,
  rejectReward,
  getRewardStatistics,
} = require('../controllers/adminRewardController');

const router = express.Router();

router.use(authMiddleware, authorizeRoles('admin'));

router.get('/pending', getPendingRewards);
router.post('/approve/:claimId', approveReward);
router.post('/reject/:claimId', rejectReward);
router.get('/statistics', getRewardStatistics);

module.exports = router;
