const Group = require('../models/Group');
const User = require('../models/User');
const {
  getGroupChannelId,
  syncGroupStreamChannel,
  deleteGroupStreamChannel,
} = require('../services/streamGroupService');
const { getStreamServerClient } = require('../services/streamChatService');

const normalizeUserId = (value) => {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value._id != null) {
    return value._id.toString();
  }
  return value.toString();
};

const isMember = (group, userId) =>
  (group.members || []).some(
    (member) => normalizeUserId(member) === normalizeUserId(userId)
  );

const isPending = (group, userId) =>
  (group.pendingMembers || []).some(
    (member) => normalizeUserId(member) === normalizeUserId(userId)
  );

const isOwner = (group, userId) =>
  normalizeUserId(group.owner) === normalizeUserId(userId);

const canViewGroup = (group, userId) => {
  if (isMember(group, userId) || isOwner(group, userId) || isPending(group, userId)) {
    return true;
  }
  return group.privacy === 'public';
};

const canViewPosts = (group, userId) => isMember(group, userId) || isOwner(group, userId);

const formatGroupListItem = (group, userId) => ({
  _id: group._id,
  name: group.name,
  description: group.description,
  coverImage: group.coverImage,
  privacy: group.privacy,
  owner: group.owner,
  membersCount: group.members.length,
  postsCount: group.posts.length,
  isMember: isMember(group, userId),
  isPending: isPending(group, userId),
  isOwner: isOwner(group, userId),
  canChat: canViewPosts(group, userId),
  memberIds: (group.members || []).map(normalizeUserId).filter(Boolean),
  streamChannelId: getGroupChannelId(group._id),
  streamChannelType: 'messaging',
  createdAt: group.createdAt,
});

const createGroup = async (req, res) => {
  try {
    const { name, description, coverImage, privacy } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    const group = await Group.create({
      name: name.trim(),
      description: description || '',
      coverImage: coverImage || '',
      owner: req.user._id,
      members: [req.user._id],
      privacy: privacy || 'public',
    });

    const populated = await Group.findById(group._id)
      .populate('owner', 'name avatar email')
      .populate('members', 'name avatar');

    try {
      await syncGroupStreamChannel(populated, populated.owner?._id || req.user._id);
    } catch (streamError) {
      console.warn('Stream group channel on create:', streamError?.message);
    }

    return res.status(201).json({
      message: 'Group created successfully',
      group: formatGroupListItem(populated, req.user._id),
      details: populated,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create group', error: error.message });
  }
};

const listGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    const groups = await Group.find({
      $or: [
        { privacy: 'public' },
        { members: userId },
        { pendingMembers: userId },
        { owner: userId },
      ],
    })
      .populate('owner', 'name avatar')
      .sort({ createdAt: -1 });

    const formatted = groups.map((g) => formatGroupListItem(g, userId));

    return res.status(200).json(formatted);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch groups', error: error.message });
  }
};

const getGroupDetails = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate('owner', 'name avatar email')
      .populate('members', 'name avatar email')
      .populate('pendingMembers', 'name avatar email')
      .populate('posts.author', 'name avatar');

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canViewGroup(group, req.user._id)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const response = {
      ...formatGroupListItem(group, req.user._id),
      description: group.description,
      coverImage: group.coverImage,
      owner: group.owner,
      members: group.members,
      pendingMembers: isOwner(group, req.user._id) ? group.pendingMembers : [],
      canPost: canViewPosts(group, req.user._id),
      canChat: canViewPosts(group, req.user._id),
      streamChannelId: getGroupChannelId(group._id),
      streamChannelType: 'messaging',
    };

    if (canViewPosts(group, req.user._id)) {
      response.posts = group.posts.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
    } else {
      response.posts = [];
    }

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch group', error: error.message });
  }
};

const joinGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const userId = req.user._id;

    if (isMember(group, userId) || isOwner(group, userId)) {
      return res.status(400).json({ message: 'You are already a member' });
    }

    if (isPending(group, userId)) {
      return res.status(400).json({ message: 'Join request already pending' });
    }

    if (group.privacy === 'public') {
      group.members.push(userId);
      group.pendingMembers = group.pendingMembers.filter(
        (id) => normalizeUserId(id) !== normalizeUserId(userId)
      );
      await group.save();
      const refreshed = await Group.findById(group._id)
        .populate('owner', 'name avatar')
        .populate('members', 'name avatar');
      try {
        await syncGroupStreamChannel(refreshed, userId);
      } catch (streamError) {
        console.warn('Stream group channel on join:', streamError?.message);
      }
      return res.status(200).json({ message: 'Joined group successfully', status: 'member' });
    }

    group.pendingMembers.push(userId);
    await group.save();
    return res.status(200).json({
      message: 'Join request sent. Waiting for approval.',
      status: 'pending',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to join group', error: error.message });
  }
};

const leaveGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const userId = req.user._id;

    if (isOwner(group, userId)) {
      return res.status(400).json({ message: 'Owner cannot leave the group. Transfer ownership first.' });
    }

    group.members = group.members.filter(
      (id) => normalizeUserId(id) !== normalizeUserId(userId)
    );
    group.pendingMembers = group.pendingMembers.filter(
      (id) => normalizeUserId(id) !== normalizeUserId(userId)
    );
    await group.save();

    const refreshed = await Group.findById(group._id)
      .populate('owner', 'name avatar')
      .populate('members', 'name avatar');
    try {
      await syncGroupStreamChannel(refreshed, userId);
    } catch (streamError) {
      console.warn('Stream group channel on leave:', streamError?.message);
    }

    return res.status(200).json({ message: 'Left group successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to leave group', error: error.message });
  }
};

const syncGroupChat = async (req, res) => {
  try {
    const forceRebuild =
      req.body?.forceRebuild === true || req.query?.forceRebuild === '1';
    const group = await Group.findById(req.params.groupId)
      .populate('owner', 'name avatar')
      .populate('members', 'name avatar');

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canViewPosts(group, req.user._id)) {
      return res.status(403).json({ message: 'Join the group to open group chat' });
    }

    const result = await syncGroupStreamChannel(group, req.user._id, {
      forceRebuild,
    });

    if (!result?.synced) {
      return res.status(500).json({
        message: result?.reason || 'Failed to sync group chat',
        error: result?.reason || 'Failed to sync group chat',
      });
    }

    return res.status(200).json({
      message: 'Group chat ready',
      streamChannelId: getGroupChannelId(group._id),
      streamChannelType: 'messaging',
      synced: result.synced,
      memberCount: result.memberCount,
    });
  } catch (error) {
    console.error('Sync group chat error:', error);
    const msg = error.message || 'Failed to sync group chat';
    return res.status(500).json({
      message: msg,
      error: msg,
    });
  }
};

const createGroupPost = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canViewPosts(group, req.user._id)) {
      return res.status(403).json({ message: 'Only members can post in this group' });
    }

    const { content, imageUrl } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Post content is required' });
    }

    const newPost = {
      author: req.user._id,
      content: content.trim(),
      imageUrl: imageUrl || '',
    };

    group.posts.push(newPost);
    await group.save();

    const populated = await Group.findById(group._id)
      .populate('posts.author', 'name avatar')
      .select('posts');

    const createdPost = populated.posts[populated.posts.length - 1];

    return res.status(201).json({
      message: 'Post created successfully',
      post: createdPost,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create post', error: error.message });
  }
};

const deleteGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    if (!isOwner(group, req.user._id)) {
      return res.status(403).json({ message: 'Only the group admin can delete this group' });
    }

    await deleteGroupStreamChannel(group._id);
    await Group.findByIdAndDelete(group._id);

    return res.status(200).json({ message: 'Group deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete group', error: error.message });
  }
};

const removeMember = async (req, res) => {
  try {
    const { memberId } = req.params;
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    if (!isOwner(group, req.user._id)) {
      return res.status(403).json({ message: 'Only the group admin can remove members' });
    }
    if (normalizeUserId(memberId) === normalizeUserId(group.owner)) {
      return res.status(400).json({ message: 'Cannot remove the group admin' });
    }

    group.members = group.members.filter(
      (id) => normalizeUserId(id) !== normalizeUserId(memberId)
    );
    group.pendingMembers = group.pendingMembers.filter(
      (id) => normalizeUserId(id) !== normalizeUserId(memberId)
    );
    await group.save();

    const refreshed = await Group.findById(group._id)
      .populate('owner', 'name avatar')
      .populate('members', 'name avatar');
    try {
      await syncGroupStreamChannel(refreshed, req.user._id);
      const serverClient = getStreamServerClient();
      if (serverClient) {
        const channel = serverClient.channel('messaging', getGroupChannelId(group._id));
        await channel.removeMembers([memberId]);
      }
    } catch (streamError) {
      console.warn('Stream remove member:', streamError?.message);
    }

    return res.status(200).json({ message: 'Member removed from group' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to remove member', error: error.message });
  }
};

const approveMember = async (req, res) => {
  try {
    const { memberId } = req.params;
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    if (!isOwner(group, req.user._id)) {
      return res.status(403).json({ message: 'Only the group admin can approve members' });
    }
    if (!isPending(group, memberId)) {
      return res.status(400).json({ message: 'No pending request for this user' });
    }

    group.pendingMembers = group.pendingMembers.filter(
      (id) => normalizeUserId(id) !== normalizeUserId(memberId)
    );
    if (!isMember(group, memberId)) {
      group.members.push(memberId);
    }
    await group.save();

    const refreshed = await Group.findById(group._id)
      .populate('owner', 'name avatar')
      .populate('members', 'name avatar');
    try {
      await syncGroupStreamChannel(refreshed, memberId);
    } catch (streamError) {
      console.warn('Stream approve member:', streamError?.message);
    }

    return res.status(200).json({ message: 'Member approved and added to group' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to approve member', error: error.message });
  }
};

const rejectMember = async (req, res) => {
  try {
    const { memberId } = req.params;
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    if (!isOwner(group, req.user._id)) {
      return res.status(403).json({ message: 'Only the group admin can reject requests' });
    }

    group.pendingMembers = group.pendingMembers.filter(
      (id) => normalizeUserId(id) !== normalizeUserId(memberId)
    );
    await group.save();

    return res.status(200).json({ message: 'Join request rejected' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to reject request', error: error.message });
  }
};

const getGroupPosts = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId).populate(
      'posts.author',
      'name avatar email'
    );

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canViewGroup(group, req.user._id)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    if (!canViewPosts(group, req.user._id)) {
      return res.status(403).json({ message: 'Join the group to view posts' });
    }

    const posts = [...group.posts].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.status(200).json(posts);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch posts', error: error.message });
  }
};

module.exports = {
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
};
