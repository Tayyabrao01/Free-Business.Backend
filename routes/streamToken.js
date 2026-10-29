const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/User');
const {
  getStreamServerClient,
  ensureMessagingPermissions,
  ensureDirectMessageChannel,
  ensureUserInChannel,
  openChatChannel,
} = require('../services/streamChatService');

const router = express.Router();

router.post('/stream/token', authMiddleware, async (req, res) => {
  try {
    const serverClient = getStreamServerClient();
    if (!serverClient) {
      return res.status(500).json({ message: 'Stream is not configured on the server' });
    }

    await ensureMessagingPermissions(serverClient);

    const userId = req.user._id.toString();
    const userName = req.user.name || req.body.userName || 'User';

    await serverClient.upsertUser({
      id: userId,
      name: userName,
      image: req.user.avatar || req.user.profileImage || undefined,
    });

    const token = serverClient.createToken(userId);

    res.json({
      success: true,
      token,
      apiKey: process.env.STREAM_API_KEY,
      userId,
    });
  } catch (error) {
    console.error('Stream token error:', error);
    res.status(500).json({ message: error.message || 'Failed to create Stream token' });
  }
});

router.post('/video/token', authMiddleware, async (req, res) => {
  try {
    const serverClient = getStreamServerClient();
    if (!serverClient) {
      return res.status(500).json({ message: 'Stream is not configured on the server' });
    }

    await ensureMessagingPermissions(serverClient);

    const userId = req.user._id.toString();
    const userName = req.user.name || req.body.userName || 'User';

    await serverClient.upsertUser({
      id: userId,
      name: userName,
    });

    const token = serverClient.createToken(userId);

    res.json({
      success: true,
      token,
      apiKey: process.env.STREAM_API_KEY,
      userId,
    });
  } catch (error) {
    console.error('Video token error:', error);
    res.status(500).json({ message: error.message || 'Failed to create video token' });
  }
});

router.post('/stream/channel/direct', authMiddleware, async (req, res) => {
  try {
    const { otherUserId, otherUserName } = req.body;

    if (!otherUserId) {
      return res.status(400).json({ message: 'otherUserId is required' });
    }

    const result = await ensureDirectMessageChannel(
      req.user._id,
      otherUserId,
      otherUserName
    );

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Ensure direct channel error:', error);
    return res.status(500).json({
      message: error.message || 'Failed to prepare chat channel',
    });
  }
});

router.post('/stream/chat/open', authMiddleware, async (req, res) => {
  try {
    const { otherUserId, otherUserName, groupId, channelId, channelType, forceRebuild } =
      req.body;
    const result = await openChatChannel(req.user._id, {
      otherUserId,
      otherUserName,
      groupId,
      channelId,
      channelType,
      forceRebuild: forceRebuild === true,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Open chat error:', error);
    const msg = error.message || 'Failed to open chat';
    let status = 500;
    if (/join the group|not a member|do not have access/i.test(msg)) {
      status = 403;
    } else if (/not configured|stream is not configured/i.test(msg)) {
      status = 503;
    } else if (/not found/i.test(msg)) {
      status = 404;
    }
    return res.status(status).json({
      message: msg,
      error: msg,
    });
  }
});

router.post('/stream/channel/join', authMiddleware, async (req, res) => {
  try {
    const { channelId, channelType = 'messaging', otherUserId } = req.body;

    if (!channelId) {
      return res.status(400).json({ message: 'channelId is required' });
    }

    const result = await ensureUserInChannel(
      req.user._id,
      channelType,
      channelId,
      otherUserId
    );

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Channel join error:', error);
    return res.status(500).json({
      message: error.message || 'Failed to join chat channel',
    });
  }
});

/** Public check — confirms chat-fix backend is deployed (no auth). */
router.get('/stream/chat-status', (_req, res) => {
  res.json({
    ok: true,
    chatFix: '2.4.2',
    routes: {
      directChannel: 'POST /api/stream/channel/direct',
      groupSync: 'POST /api/social/groups/:groupId/sync-chat',
    },
    streamConfigured: Boolean(
      process.env.STREAM_API_KEY && process.env.STREAM_API_SECRET
    ),
  });
});

router.post('/stream/sync-user', authMiddleware, async (req, res) => {
  try {
    const { userId, userName } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    if (userId.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Use /stream/token for your own account' });
    }

    const targetUser = await User.findById(userId).select('name avatar profileImage');
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const serverClient = getStreamServerClient();
    if (!serverClient) {
      return res.status(500).json({ message: 'Stream is not configured on the server' });
    }

    await ensureMessagingPermissions(serverClient);

    await serverClient.upsertUser({
      id: userId.toString(),
      name: userName || targetUser.name || 'User',
      image: targetUser.avatar || targetUser.profileImage || undefined,
    });

    res.json({
      success: true,
      message: `User ${userName || userId} synced successfully`,
      userId: userId.toString(),
    });
  } catch (error) {
    console.error('Sync user error:', error);
    res.status(500).json({ message: error.message || 'Failed to sync Stream user' });
  }
});

module.exports = router;
