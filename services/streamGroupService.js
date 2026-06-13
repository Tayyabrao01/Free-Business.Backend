const {
  getStreamServerClient,
  ensureMessagingPermissions,
  upsertStreamUsers,
  syncChannelMembers,
} = require('./streamChatService');

const GROUP_CHANNEL_PREFIX = 'group-';
const GROUP_CALL_PREFIX = 'group-call-';

const getGroupChannelId = (groupId) => `${GROUP_CHANNEL_PREFIX}${groupId.toString()}`;
const getGroupCallId = (groupId) => `${GROUP_CALL_PREFIX}${groupId.toString()}`;

const collectMemberIds = (group, requestingUserId) => {
  const ids = new Set();
  if (group.owner) {
    ids.add(group.owner._id ? group.owner._id.toString() : group.owner.toString());
  }
  (group.members || []).forEach((member) => {
    const id = member?._id ? member._id.toString() : member?.toString();
    if (id) ids.add(id);
  });
  if (requestingUserId) {
    ids.add(requestingUserId.toString());
  }
  return Array.from(ids);
};

/**
 * Create or update the Stream messaging channel for a MongoDB group.
 */
const syncGroupStreamChannel = async (group, requestingUserId) => {
  const serverClient = getStreamServerClient();
  if (!serverClient || !group?._id) {
    return { synced: false, reason: 'stream_not_configured' };
  }

  await ensureMessagingPermissions(serverClient);

  const memberIds = collectMemberIds(group, requestingUserId);
  if (!memberIds.length) {
    return { synced: false, reason: 'no_members' };
  }

  await upsertStreamUsers(serverClient, memberIds);

  const channelId = getGroupChannelId(group._id);
  const ownerId =
    group.owner?._id?.toString() ||
    group.owner?.toString() ||
    memberIds[0];

  const result = await syncChannelMembers(
    serverClient,
    'messaging',
    channelId,
    memberIds,
    {
      name: group.name || 'Group',
      image: group.coverImage || undefined,
      free_business_group_id: group._id.toString(),
      free_business_owner_id: ownerId,
    },
    ownerId
  );

  try {
    const channel = serverClient.channel('messaging', channelId);
    await channel.addModerators([ownerId]);
  } catch (modError) {
    console.warn('Stream group moderator assign:', modError?.message);
  }

  return {
    synced: true,
    channelId,
    channelType: 'messaging',
    memberCount: result.memberCount,
    added: result.added,
  };
};

const deleteGroupStreamChannel = async (groupId) => {
  const serverClient = getStreamServerClient();
  if (!serverClient || !groupId) {
    return { deleted: false };
  }
  try {
    const channel = serverClient.channel('messaging', getGroupChannelId(groupId));
    await channel.delete();
    return { deleted: true };
  } catch (error) {
    console.warn('Stream group channel delete:', error?.message);
    return { deleted: false, error: error.message };
  }
};

module.exports = {
  getGroupChannelId,
  getGroupCallId,
  syncGroupStreamChannel,
  deleteGroupStreamChannel,
  GROUP_CHANNEL_PREFIX,
  GROUP_CALL_PREFIX,
};
