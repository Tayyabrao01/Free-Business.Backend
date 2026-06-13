const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const Property = require('../models/Property');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Group = require('../models/Group');
const Reward = require('../models/Reward');
const Activity = require('../models/Activity');
const Inquiry = require('../models/Inquiry');

const deleteUserAccount = async (userId) => {
  const id = new mongoose.Types.ObjectId(userId);

  await Post.deleteMany({ author: id });
  await Property.deleteMany({ owner: id });
  await Message.deleteMany({ $or: [{ sender: id }, { receiver: id }] });
  await Conversation.deleteMany({ participants: id });
  await Reward.deleteMany({ user: id });
  await Activity.deleteMany({ user: id });
  await Inquiry.deleteMany({ user: id });

  await Group.updateMany(
    { members: id },
    { $pull: { members: id, pendingMembers: id } }
  );

  const ownedGroups = await Group.find({ owner: id });
  for (const group of ownedGroups) {
    const otherMember = group.members.find((memberId) => memberId.toString() !== id.toString());
    if (otherMember) {
      group.owner = otherMember;
      group.members = group.members.filter((memberId) => memberId.toString() !== id.toString());
      await group.save();
    } else {
      await Group.findByIdAndDelete(group._id);
    }
  }

  await User.updateMany({ followers: id }, { $pull: { followers: id } });
  await User.updateMany({ following: id }, { $pull: { following: id } });
  await User.updateMany({ 'referrals.user': id }, { $pull: { referrals: { user: id } } });

  await User.findByIdAndDelete(id);
};

module.exports = { deleteUserAccount };
