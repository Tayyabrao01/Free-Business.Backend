const User = require('../models/User');
const Post = require('../models/Post');
const Group = require('../models/Group');
const Activity = require('../models/Activity');

const formatAdminUser = (user, activityCount = 0) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  location: user.location,
  followersCount: user.followersCount ?? user.followers?.length ?? 0,
  postsCount: user.postsCount || 0,
  propertiesSold: user.propertiesSold || 0,
  propertiesRented: user.propertiesRented || 0,
  salesCount: (user.propertiesSold || 0) + (user.propertiesRented || 0),
  activityCount,
  createdAt: user.createdAt,
});

const getStats = async (req, res) => {
  try {
    const [totalUsers, totalPosts, totalGroups] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      Group.countDocuments(),
    ]);

    const users = await User.find().select('-password').lean();

    const activityAgg = await Activity.aggregate([
      { $group: { _id: '$user', activityCount: { $sum: 1 } } },
    ]);
    const activityMap = {};
    activityAgg.forEach((row) => {
      activityMap[row._id.toString()] = row.activityCount;
    });

    const formatted = users.map((u) =>
      formatAdminUser(u, activityMap[u._id.toString()] || 0)
    );

    const topUsers = {
      byFollowers: [...formatted]
        .sort((a, b) => b.followersCount - a.followersCount)
        .slice(0, 5),
      byPosts: [...formatted].sort((a, b) => b.postsCount - a.postsCount).slice(0, 5),
      bySales: [...formatted].sort((a, b) => b.salesCount - a.salesCount).slice(0, 5),
    };

    return res.status(200).json({
      totalUsers,
      totalPosts,
      totalGroups,
      topUsers,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch stats', error: error.message });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();

    const activityAgg = await Activity.aggregate([
      { $group: { _id: '$user', activityCount: { $sum: 1 } } },
    ]);
    const activityMap = {};
    activityAgg.forEach((row) => {
      activityMap[row._id.toString()] = row.activityCount;
    });

    const formatted = users.map((u) =>
      formatAdminUser(u, activityMap[u._id.toString()] || 0)
    );

    return res.status(200).json(formatted);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
};

const getActivities = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const activities = await Activity.find()
      .populate('user', 'name email avatar role')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json(activities);
  } catch (error) {
    return res
      .status(500)
      .json({ message: 'Failed to fetch activities', error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot delete another admin account' });
    }

    await Post.deleteMany({ author: userId });
    await Activity.deleteMany({ user: userId });
    await User.findByIdAndDelete(userId);

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete user', error: error.message });
  }
};

const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const authorId = post.author;
    await Post.findByIdAndDelete(postId);

    if (authorId) {
      const author = await User.findById(authorId);
      if (author && author.postsCount > 0) {
        author.postsCount -= 1;
        await author.save();
      }
    }

    return res.status(200).json({ message: 'Post deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete post', error: error.message });
  }
};

module.exports = {
  getStats,
  getUsers,
  getActivities,
  deleteUser,
  deletePost,
};
