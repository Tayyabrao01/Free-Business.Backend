const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const {
  getStats,
  getUsers,
  getActivities,
  deleteUser,
  deletePost,
} = require('../controllers/adminController');

const router = express.Router();

router.use(authMiddleware, authorizeRoles('admin'));

router.get('/stats', getStats);
router.get('/users', getUsers);
router.get('/activities', getActivities);
router.delete('/users/:userId', deleteUser);
router.delete('/posts/:postId', deletePost);

module.exports = router;
