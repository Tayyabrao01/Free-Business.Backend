const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Activity = require('../models/Activity');
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');

const publicUserFields =
  'name email avatar bio location phone whatsappNumber role followers following followersCount postsCount createdAt';

const formatUser = (user, currentUserFollowingIds = []) => {
  if (!user) return null;
  const doc = user.toObject ? user.toObject() : user;
  const followers = doc.followers || [];
  const following = doc.following || [];
  const followingIds = Array.isArray(currentUserFollowingIds)
    ? currentUserFollowingIds.map((id) => id.toString())
    : [];
  const isFollowing = followingIds.includes(doc._id.toString());

  return {
    _id: doc._id,
    name: doc.name,
    email: doc.email,
    avatar: doc.avatar || doc.profileImage || null,
    bio: doc.bio || '',
    location: doc.location,
    phone: doc.phone || '',
    whatsappNumber: doc.whatsappNumber || '',
    role: doc.role,
    followersCount: doc.followersCount ?? followers.length,
    followingCount: following.length,
    postsCount: doc.postsCount || 0,
    isFollowing: Boolean(isFollowing),
    createdAt: doc.createdAt,
  };
};

const logActivity = async (userId, action, targetType, targetId, metadata = {}) => {
  try {
    await Activity.create({ user: userId, action, targetType, targetId, metadata });
  } catch (error) {
    console.error('Activity log error:', error.message);
  }
};

const syncFollowerCounts = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return;
  user.syncFollowersCount();
  await user.save();
};

const followUser = async (req, res) => {
  try {
    const targetId = req.params.userId;
    const currentUserId = req.user._id.toString();

    if (targetId === currentUserId) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUser = await User.findById(req.user._id);

    const alreadyFollowing = currentUser.following.some(
      (id) => id.toString() === targetId
    );
    if (alreadyFollowing) {
      return res.status(400).json({ message: 'Already following this user' });
    }

    currentUser.following.push(targetId);
    targetUser.followers.push(currentUser._id);

    currentUser.syncFollowersCount();
    targetUser.syncFollowersCount();

    await currentUser.save();
    await targetUser.save();

    await logActivity(currentUser._id, 'follow', 'user', targetId, {
      targetName: targetUser.name,
    });

    return res.status(200).json({
      message: 'Followed successfully',
      user: formatUser(targetUser, currentUser.following),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to follow user', error: error.message });
  }
};

const unfollowUser = async (req, res) => {
  try {
    const targetId = req.params.userId;
    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUser = await User.findById(req.user._id);

    currentUser.following = currentUser.following.filter(
      (id) => id.toString() !== targetId
    );
    targetUser.followers = targetUser.followers.filter(
      (id) => id.toString() !== currentUser._id.toString()
    );

    currentUser.syncFollowersCount();
    targetUser.syncFollowersCount();

    await currentUser.save();
    await targetUser.save();

    await logActivity(currentUser._id, 'unfollow', 'user', targetId);

    return res.status(200).json({
      message: 'Unfollowed successfully',
      user: formatUser(targetUser, currentUser.following),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to unfollow user', error: error.message });
  }
};

const getFollowers = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('followers', publicUserFields)
      .select('followers followersCount name');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUser = await User.findById(req.user._id).select('following');
    const followers = (user.followers || []).map((f) =>
      formatUser(f, currentUser.following)
    );

    return res.status(200).json({
      count: followers.length,
      followers,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch followers', error: error.message });
  }
};

const getFollowing = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('following', publicUserFields)
      .select('following name');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUser = await User.findById(req.user._id).select('following');
    const following = (user.following || []).map((f) =>
      formatUser(f, currentUser.following)
    );

    return res.status(200).json({
      count: following.length,
      following,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch following', error: error.message });
  }
};

const uploadsDir = path.join(__dirname, '..', 'uploads');

const saveAvatarToDisk = (file) => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  if (file.path && fs.existsSync(file.path)) {
    return `/uploads/${path.basename(file.path)}`;
  }
  if (file.buffer?.length) {
    const filename = `avatar-${Date.now()}.jpg`;
    fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
    return `/uploads/${filename}`;
  }
  return null;
};

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Avatar image is required' });
    }

    let avatarUrl = null;

    if (isCloudinaryConfigured() && req.file.path && fs.existsSync(req.file.path)) {
      try {
        const uploadResult = await cloudinary.uploader.upload(req.file.path, {
          folder: 'freebusiness/avatars',
          resource_type: 'image',
          transformation: [{ width: 400, height: 400, crop: 'fill' }],
        });
        avatarUrl = uploadResult.secure_url;
        fs.unlinkSync(req.file.path);
      } catch (cloudinaryError) {
        console.warn('Cloudinary avatar upload failed, using disk:', cloudinaryError.message);
        avatarUrl = saveAvatarToDisk(req.file);
      }
    } else {
      avatarUrl = saveAvatarToDisk(req.file);
    }

    if (!avatarUrl) {
      return res.status(500).json({ message: 'Failed to save avatar image' });
    }

    const user = await User.findById(req.user._id);
    user.avatar = avatarUrl;
    user.profileImage = avatarUrl;
    await user.save();

    await logActivity(user._id, 'avatar_update', 'profile', user._id, { avatarUrl });

    return res.status(200).json({
      message: 'Avatar updated successfully',
      avatar: avatarUrl,
      user: formatUser(user, user.following),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to upload avatar', error: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, bio, location, phone, whatsappNumber, avatar } = req.body;
    const user = await User.findById(req.user._id);

    if (name) user.name = name.trim();
    if (bio !== undefined) user.bio = String(bio).trim().slice(0, 500);
    if (location) user.location = location.trim();
    if (phone !== undefined) user.phone = String(phone).trim();
    if (whatsappNumber !== undefined) user.whatsappNumber = String(whatsappNumber).trim();
    if (avatar !== undefined) {
      const url = String(avatar).trim();
      if (url.startsWith('/uploads/') || url.startsWith('http://') || url.startsWith('https://')) {
        user.avatar = url;
        user.profileImage = url;
      }
    }

    await user.save();

    await logActivity(user._id, 'profile_update', 'profile', user._id, { name: user.name });

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: formatUser(user, user.following),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update profile', error: error.message });
  }
};

const getUsers = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = { _id: { $ne: req.user._id } };

    if (search && search.trim()) {
      const term = search.trim();
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { location: { $regex: term, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select(publicUserFields)
      .limit(50)
      .sort({ createdAt: -1 });

    const currentUser = await User.findById(req.user._id).select('following');

    const formatted = users.map((u) => formatUser(u, currentUser.following));

    return res.status(200).json(formatted);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select(publicUserFields);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUser = await User.findById(req.user._id).select('following');
    return res.status(200).json(formatUser(user, currentUser.following));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch profile', error: error.message });
  }
};

module.exports = {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  uploadAvatar,
  updateProfile,
  getUsers,
  getUserProfile,
  formatUser,
};
