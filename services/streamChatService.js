const { StreamChat } = require('stream-chat');
const User = require('../models/User');

const getStreamServerClient = () => {
  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;

  if (!apiKey || !apiSecret) {
    return null;
  }

  return StreamChat.getInstance(apiKey, apiSecret);
};

const getDirectMessageChannelId = (userIdA, userIdB) => {
  const a = userIdA?.toString();
  const b = userIdB?.toString();
  if (!a || !b) {
    throw new Error('Both user ids are required for a direct channel');
  }
  return `dm-${[a, b].sort().join('-')}`;
};

const upsertStreamUsers = async (serverClient, userIds) => {
  if (!userIds?.length) return;

  const users = await User.find({ _id: { $in: userIds } }).select('name avatar profileImage');
  if (!users.length) return;

  await serverClient.upsertUsers(
    users.map((u) => ({
      id: u._id.toString(),
      name: u.name || 'User',
      image: u.avatar || u.profileImage || undefined,
    }))
  );
};

const ensureMessagingPermissions = async (serverClient) => {
  if (!serverClient) return;

  try {
    await serverClient.updateChannelType('messaging', {
      grants: {
        channel_member: [
          'read-channel',
          'read-channel-members',
          'create-message',
          'update-message',
          'delete-message',
          'send-message',
          'create-reaction',
          'delete-reaction',
          'upload-attachment',
          'typing-indicator',
        ],
        channel_moderator: [
          'read-channel',
          'read-channel-members',
          'create-message',
          'update-message',
          'delete-message',
          'delete-any-message',
          'update-any-message',
          'send-message',
          'create-reaction',
          'delete-reaction',
          'upload-attachment',
          'typing-indicator',
          'ban-channel-member',
          'mute-channel-member',
        ],
        user: [
          'create-channel',
          'read-channel',
          'read-channel-members',
          'send-message',
          'create-message',
          'upload-attachment',
        ],
        admin: ['*'],
      },
    });
  } catch (error) {
    console.warn('Stream messaging permissions update:', error?.message);
  }
};

const getChannelMemberIds = async (serverClient, channelType, channelId) => {
  try {
    const channels = await serverClient.queryChannels(
      { type: channelType, id: { $eq: channelId } },
      {},
      { limit: 1, state: true, watch: false }
    );

    const ch = channels?.[0];
    if (!ch?.state?.members) {
      return [];
    }

    return Object.keys(ch.state.members).map((id) => id.toString());
  } catch (error) {
    console.warn('queryChannels members:', error?.message);
    return [];
  }
};

const createChannelIfMissing = async (channel, createdById, memberIds) => {
  try {
    await channel.create({
      created_by_id: createdById,
      members: memberIds,
    });
    return 'created';
  } catch (error) {
    const exists =
      error?.code === 4 ||
      String(error?.message || '').toLowerCase().includes('already exists');
    if (!exists) {
      throw error;
    }
    return 'exists';
  }
};

/**
 * Force-add members; recreate channel if Stream state is broken.
 */
const syncChannelMembers = async (
  serverClient,
  channelType,
  channelId,
  memberIds,
  channelData = {},
  createdById
) => {
  const uniqueMembers = Array.from(
    new Set(memberIds.filter(Boolean).map((id) => id.toString()))
  );

  if (!uniqueMembers.length) {
    throw new Error('At least one member is required for the channel');
  }

  await upsertStreamUsers(serverClient, uniqueMembers);

  const creator = createdById?.toString() || uniqueMembers[0];
  const channel = serverClient.channel(channelType, channelId, {
    ...channelData,
    members: uniqueMembers,
    created_by_id: creator,
  });

  const createStatus = await createChannelIfMissing(channel, creator, uniqueMembers);

  let existingIds = await getChannelMemberIds(serverClient, channelType, channelId);
  let toAdd = uniqueMembers.filter((id) => !existingIds.includes(id));

  if (toAdd.length) {
    try {
      await channel.addMembers(toAdd);
    } catch (addError) {
      console.warn('addMembers failed, recreating channel:', addError?.message);
      try {
        await channel.delete();
      } catch (deleteError) {
        console.warn('channel delete:', deleteError?.message);
      }
      await channel.create({
        created_by_id: creator,
        members: uniqueMembers,
        ...channelData,
      });
      toAdd = uniqueMembers;
    }
  }

  existingIds = await getChannelMemberIds(serverClient, channelType, channelId);
  const missing = uniqueMembers.filter((id) => !existingIds.includes(id));
  if (missing.length) {
    throw new Error(`Could not add members to channel: ${missing.join(', ')}`);
  }

  return {
    channelId,
    channelType,
    memberCount: uniqueMembers.length,
    added: toAdd.length,
    created: createStatus === 'created',
  };
};

const ensureDirectMessageChannel = async (currentUserId, otherUserId, otherUserName) => {
  const serverClient = getStreamServerClient();
  if (!serverClient) {
    throw new Error('Stream is not configured on the server (STREAM_API_KEY / STREAM_API_SECRET)');
  }

  await ensureMessagingPermissions(serverClient);

  const currentId = currentUserId.toString();
  const otherId = otherUserId.toString();

  if (otherUserName) {
    await serverClient.upsertUser({
      id: otherId,
      name: otherUserName,
    });
  }

  const channelId = getDirectMessageChannelId(currentId, otherId);
  const result = await syncChannelMembers(
    serverClient,
    'messaging',
    channelId,
    [currentId, otherId],
    { name: otherUserName || 'Chat' },
    currentId
  );

  return {
    ...result,
    channelId,
    channelType: 'messaging',
  };
};

const ensureUserInChannel = async (userId, channelType, channelId, otherUserId) => {
  const serverClient = getStreamServerClient();
  if (!serverClient) {
    throw new Error('Stream is not configured on the server');
  }

  await ensureMessagingPermissions(serverClient);
  const uid = userId.toString();

  if (channelId?.startsWith('group-')) {
    const Group = require('../models/Group');
    const { syncGroupStreamChannel } = require('./streamGroupService');
    const groupId = channelId.replace('group-', '');
    const group = await Group.findById(groupId)
      .populate('owner', 'name avatar')
      .populate('members', 'name avatar');
    if (!group) {
      throw new Error('Group not found');
    }
    return syncGroupStreamChannel(group, uid);
  }

  if (otherUserId) {
    return ensureDirectMessageChannel(uid, otherUserId);
  }

  if (channelId?.startsWith('dm-')) {
    const rest = channelId.slice(3);
    const parts = rest.split('-');
    if (parts.length >= 2) {
      const peerId = parts[0] === uid ? parts[1] : parts[0];
      return ensureDirectMessageChannel(uid, peerId);
    }
  }

  await upsertStreamUsers(serverClient, [uid]);
  const existingIds = await getChannelMemberIds(serverClient, channelType, channelId);

  if (!existingIds.length) {
    throw new Error('Channel not found');
  }

  if (!existingIds.includes(uid)) {
    const channel = serverClient.channel(channelType, channelId);
    await channel.addMembers([uid]);
  }

  return { channelId, channelType, memberCount: existingIds.length + 1 };
};

/**
 * One API to prepare any chat — returns the channel id the app must open.
 */
const openChatChannel = async (userId, options = {}) => {
  const { otherUserId, otherUserName, groupId, channelId, channelType = 'messaging' } =
    options;
  const uid = userId.toString();

  if (groupId) {
    const Group = require('../models/Group');
    const { syncGroupStreamChannel } = require('./streamGroupService');
    const group = await Group.findById(groupId)
      .populate('owner', 'name avatar')
      .populate('members', 'name avatar');
    if (!group) {
      throw new Error('Group not found');
    }
    const isMember =
      group.members.some((m) => (m._id || m).toString() === uid) ||
      (group.owner?._id || group.owner)?.toString() === uid;
    if (!isMember) {
      throw new Error('Join the group before opening group chat');
    }
    const result = await syncGroupStreamChannel(group, uid);
    return {
      channelType: 'messaging',
      channelId: result.channelId,
      kind: 'group',
      memberCount: result.memberCount,
    };
  }

  if (otherUserId) {
    const result = await ensureDirectMessageChannel(uid, otherUserId, otherUserName);
    return {
      channelType: result.channelType,
      channelId: result.channelId,
      kind: 'direct',
      memberCount: result.memberCount,
    };
  }

  if (channelId) {
    const result = await ensureUserInChannel(uid, channelType, channelId, otherUserId);
    return {
      channelType: result.channelType || channelType,
      channelId: result.channelId || channelId,
      kind: channelId.startsWith('group-') ? 'group' : 'direct',
      memberCount: result.memberCount,
    };
  }

  throw new Error('otherUserId, groupId, or channelId is required');
};

module.exports = {
  getStreamServerClient,
  getDirectMessageChannelId,
  ensureMessagingPermissions,
  ensureDirectMessageChannel,
  ensureUserInChannel,
  openChatChannel,
  upsertStreamUsers,
  createChannelIfMissing,
  syncChannelMembers,
  getChannelMemberIds,
};
