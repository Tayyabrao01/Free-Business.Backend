const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/authMiddleware');
const {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  uploadAvatar,
  updateProfile,
  getUsers,
  getUserProfile,
} = require('../controllers/socialController');
const {
  createGroup,
  listGroups,
  getGroupDetails,
  joinGroup,
  leaveGroup,
  deleteGroup,
  removeMember,
  approveMember,
  rejectMember,
  syncGroupChat,
  createGroupPost,
  getGroupPosts,
} = require('../controllers/groupController');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-.]/g, '') || 'photo.jpg';
    cb(null, `avatar-${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const handleMulterError = (err, req, res, next) => {
  if (!err) {
    return next();
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Image is too large. Use a photo under 5 MB.' });
  }
  return res.status(400).json({ message: err.message || 'Invalid image upload' });
};

router.use(authMiddleware);

router.get('/users', getUsers);
router.get('/profile/:userId', getUserProfile);
router.put('/profile', updateProfile);
router.post('/profile/avatar', upload.single('image'), handleMulterError, uploadAvatar);

router.post('/groups', createGroup);
router.get('/groups', listGroups);
router.get('/groups/:groupId', getGroupDetails);
router.post('/groups/:groupId/join', joinGroup);
router.post('/groups/:groupId/leave', leaveGroup);
router.delete('/groups/:groupId', deleteGroup);
router.post('/groups/:groupId/members/:memberId/approve', approveMember);
router.post('/groups/:groupId/members/:memberId/reject', rejectMember);
router.delete('/groups/:groupId/members/:memberId', removeMember);
router.post('/groups/:groupId/sync-chat', syncGroupChat);
router.post('/groups/:groupId/posts', createGroupPost);
router.get('/groups/:groupId/posts', getGroupPosts);

router.post('/follow/:userId', followUser);
router.post('/unfollow/:userId', unfollowUser);
router.get('/:userId/followers', getFollowers);
router.get('/:userId/following', getFollowing);

module.exports = router;
