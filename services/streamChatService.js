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

const toMemberIds = (memberIds) =>
  Array.from(new Set(memberIds.filter(Boolean).map((id) => id.toString())));

const toStreamMemberPayloads = (memberIds) =>
  toMemberIds(memberIds).map((user_id) => ({ user_id }));

const stripReservedChannelFields = (channelData = {}) => {
  const { members, ...rest } = channelData;
  return rest;
};

const buildChannelCreateData = (channelData = {}, createdById) => ({
  ...stripReservedChannelFields(channelData),
  created_by_id: createdById?.toString(),
});

const isCorruptedChannelData = (data = {}) => Array.isArray(data.members);

const repairChannelCustomData = async (serverClient, channelType, channelId) => {
  try {
    const channels = await serverClient.queryChannels(
      { type: channelType, id: { $eq: channelId } },
      {},
      { limit: 1, state: false }
    );
    const existing = channels?.[0];
    if (!existing?.data) {
      return false;
    }

    if (!isCorruptedChannelData(existing.data)) {
      return false;
    }

    const unset = [];
    if (Array.isArray(existing.data.members)) {
      unset.push('members');
    }

    if (unset.length) {
      await existing.updatePartial({ unset });
      console.warn('[stream] repaired channel custom data:', channelId, unset.join(', '));
    }
    return true;
  } catch (error) {
    console.warn('[stream] channel repair skipped:', error?.message);
    return false;
  }
};

const deleteChannelIfExists = async (serverClient, channelType, channelId) => {
  try {
    await serverClient.deleteChannels(
      [{ type: channelType, id: channelId }],
      { hard_delete: true }
    );
    return true;
  } catch (bulkError) {
    try {
      const channel = serverClient.channel(channelType, channelId);
      await channel.delete();
      return true;
    } catch (error) {
      const missing =
        error?.code === 4 ||
        String(error?.message || '').toLowerCase().includes('not found');
      if (!missing) {
        console.warn('[stream] channel delete:', error?.message);
      }
      return false;
    }
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isChannelNotFoundError = (error) => {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes("can't find channel") ||
    msg.includes('channel not found') ||
    error?.code === 16 ||
    error?.code === 4
  );
};

const channelExists = async (serverClient, channelType, channelId) => {
  try {
    const channels = await serverClient.queryChannels(
      { type: channelType, id: { $eq: channelId } },
      {},
      { limit: 1, state: false }
    );
    return Boolean(channels?.length);
  } catch (error) {
    console.warn('[stream] channelExists check:', error?.message);
    return false;
  }
};

const createFreshChannel = async (
  serverClient,
  channelType,
  channelId,
  memberIds,
  channelData,
  createdById
) => {
  const uniqueMembers = toMemberIds(memberIds);
  const memberPayloads = toStreamMemberPayloads(memberIds);
  const creator = createdById?.toString() || uniqueMembers[0];
  const channel = serverClient.channel(
    channelType,
    channelId,
    buildChannelCreateData(channelData, creator)
  );

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (attempt > 0) {
        await sleep(500 * attempt);
      }

      if (await channelExists(serverClient, channelType, channelId)) {
        if (memberPayloads.length) {
          await channel.addMembers(memberPayloads);
        }
        return channel;
      }

      await channel.create();
      await sleep(400);

      if (memberPayloads.length) {
        await channel.addMembers(memberPayloads);
      }

      if (await channelExists(serverClient, channelType, channelId)) {
        return channel;
      }

      lastError = new Error(`Channel ${channelId} was not created`);
    } catch (error) {
      lastError = error;
      if (isChannelNotFoundError(error) || isMembersFieldError(error)) {
        await deleteChannelIfExists(serverClient, channelType, channelId);
        await sleep(500);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error(`Failed to create channel ${channelId}`);
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

const createChannelIfMissing = async (channel, createdById, memberIds, channelData = {}) => {
  const memberPayloads = toStreamMemberPayloads(memberIds);
  try {
    await channel.create();
    if (memberPayloads.length) {
      await channel.addMembers(memberPayloads);
    }
    return 'created';
  } catch (error) {
    if (isMembersFieldError(error)) {
      throw error;
    }
    const exists =
      error?.code === 4 ||
      String(error?.message || '').toLowerCase().includes('already exists');
    if (!exists) {
      throw error;
    }
    return 'exists';
  }
};

const isMembersFieldError = (error) => {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('expected object for field "members"') ||
    msg.includes('getorcreatechannel') ||
    msg.includes('created_by_id must be provided') ||
    msg.includes('data.created_by')
  );
};

const channelHasCorruptedCustomData = async (serverClient, channelType, channelId) => {
  try {
    const channels = await serverClient.queryChannels(
      { type: channelType, id: { $eq: channelId } },
      {},
      { limit: 1, state: false }
    );
    const data = channels?.[0]?.data;
    return Boolean(data && isCorruptedChannelData(data));
  } catch (error) {
    console.warn('[stream] channel probe skipped:', error?.message);
    return false;
  }
};

const forceRebuildChannel = async (
  serverClient,
  channelType,
  channelId,
  memberIds,
  channelData,
  createdById
) => {
  await deleteChannelIfExists(serverClient, channelType, channelId);
  await sleep(800);
  await createFreshChannel(
    serverClient,
    channelType,
    channelId,
    memberIds,
    channelData,
    createdById
  );
  const existingIds = await getChannelMemberIds(serverClient, channelType, channelId);
  const missing = toMemberIds(memberIds).filter((id) => !existingIds.includes(id));
  if (missing.length) {
    const channel = serverClient.channel(channelType, channelId);
    await channel.addMembers(toStreamMemberPayloads(missing));
  }
  return {
    channelId,
    channelType,
    memberCount: toMemberIds(memberIds).length,
    added: toMemberIds(memberIds).length,
    created: true,
    rebuilt: true,
  };
};

const ensureChannelReady = async (
  serverClient,
  channelType,
  channelId,
  memberIds,
  channelData,
  createdById
) => {
  const uniqueMembers = toMemberIds(memberIds);
  const exists = await channelExists(serverClient, channelType, channelId);

  if (!exists) {
    return createFreshChannel(
      serverClient,
      channelType,
      channelId,
      uniqueMembers,
      channelData,
      createdById
    ).then(() => ({
      channelId,
      channelType,
      memberCount: uniqueMembers.length,
      added: uniqueMembers.length,
      created: true,
      rebuilt: false,
    }));
  }

  await repairChannelCustomData(serverClient, channelType, channelId);

  const channel = serverClient.channel(
    channelType,
    channelId,
    stripReservedChannelFields(channelData)
  );
  const existingIds = await getChannelMemberIds(serverClient, channelType, channelId);
  const toAdd = uniqueMembers.filter((id) => !existingIds.includes(id));

  if (toAdd.length) {
    try {
      await channel.addMembers(toStreamMemberPayloads(toAdd));
    } catch (error) {
      if (isMembersFieldError(error)) {
        await repairChannelCustomData(serverClient, channelType, channelId);
        try {
          await channel.addMembers(toStreamMemberPayloads(toAdd));
        } catch (retryError) {
          console.warn('[stream] addMembers after repair:', retryError?.message);
          throw retryError;
        }
      } else if (isChannelNotFoundError(error)) {
        return createFreshChannel(
          serverClient,
          channelType,
          channelId,
          uniqueMembers,
          channelData,
          createdById
        ).then(() => ({
          channelId,
          channelType,
          memberCount: uniqueMembers.length,
          added: uniqueMembers.length,
          created: true,
          rebuilt: false,
        }));
      } else {
        throw error;
      }
    }
  }

  return {
    channelId,
    channelType,
    memberCount: uniqueMembers.length,
    added: toAdd.length,
    created: false,
    rebuilt: false,
  };
};

const syncChannelMembers = async (
  serverClient,
  channelType,
  channelId,
  memberIds,
  channelData = {},
  createdById,
  options = {}
) => {
  const { forceRebuild = false } = options;

  const runSync = async (rebuild) => {
    const uniqueMembers = toMemberIds(memberIds);

    if (!uniqueMembers.length) {
      throw new Error('At least one member is required for the channel');
    }

    await upsertStreamUsers(serverClient, uniqueMembers);

    const creator = createdById?.toString() || uniqueMembers[0];

    // Create if missing (e.g. manually deleted in Stream dashboard), rebuild only when broken.
    const exists = await channelExists(serverClient, channelType, channelId);
    if (exists) {
      await repairChannelCustomData(serverClient, channelType, channelId);
    }
    if (!exists) {
      console.warn('[stream] channel missing, creating:', channelId);
      return ensureChannelReady(
        serverClient,
        channelType,
        channelId,
        uniqueMembers,
        channelData,
        creator
      );
    }

    if (rebuild || forceRebuild) {
      console.warn('[stream] force rebuilding channel:', channelId);
      return forceRebuildChannel(
        serverClient,
        channelType,
        channelId,
        uniqueMembers,
        channelData,
        creator
      );
    }

    return ensureChannelReady(
      serverClient,
      channelType,
      channelId,
      uniqueMembers,
      channelData,
      creator
    );
  };

  try {
    return await runSync(forceRebuild);
  } catch (error) {
    const exists = await channelExists(serverClient, channelType, channelId);
    if (!exists) {
      return ensureChannelReady(
        serverClient,
        channelType,
        channelId,
        toMemberIds(memberIds),
        channelData,
        createdById
      );
    }
    if (forceRebuild && (isMembersFieldError(error) || isChannelNotFoundError(error))) {
      console.warn('[stream] channel error, rebuilding:', channelId, error?.message);
      return forceRebuildChannel(
        serverClient,
        channelType,
        channelId,
        toMemberIds(memberIds),
        channelData,
        createdById
      );
    }
    throw error;
  }
};

const ensureDirectMessageChannel = async (
  currentUserId,
  otherUserId,
  otherUserName,
  options = {}
) => {
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
    currentId,
    options
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
    return syncGroupStreamChannel(group, uid, { forceRebuild: false });
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
  const {
    otherUserId,
    otherUserName,
    groupId,
    channelId,
    channelType = 'messaging',
    forceRebuild = false,
  } = options;
  const uid = userId.toString();
  const syncOptions = { forceRebuild: false };

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
      group.members.some((member) => normalizeUserId(member) === uid) ||
      normalizeUserId(group.owner) === uid;
    if (!isMember) {
      throw new Error('Join the group before opening group chat');
    }
    const result = await syncGroupStreamChannel(group, uid, syncOptions);
    return {
      channelType: 'messaging',
      channelId: result.channelId,
      kind: 'group',
      memberCount: result.memberCount,
    };
  }

  if (otherUserId) {
    const result = await ensureDirectMessageChannel(
      uid,
      otherUserId,
      otherUserName,
      syncOptions
    );
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
