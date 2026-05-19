const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// Get all conversations or a specific conversation with a user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const withUser = req.query.with;
    if (withUser) {
      // Find a conversation between the current user and the `with` user
      const conversation = await Conversation.findOne({
        participants: { $all: [req.user._id, withUser], $size: 2 }
      }).populate('participants', 'name email');

      if (!conversation) {
        return res.json({ conversation: null, messages: [] });
      }

      const messages = await Message.find({ conversation: conversation._id })
        .populate('sender', 'name email')
        .sort({ createdAt: 1 });

      return res.json({ conversation, messages });
    }

    const conversations = await Conversation.find({
      participants: req.user._id
    }).populate('participants', 'name email');
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a conversation
router.get('/:conversationId/messages', authMiddleware, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId).populate('participants', 'name email');
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const messages = await Message.find({ conversation: req.params.conversationId })
      .populate('sender', 'name email')
      .sort({ createdAt: 1 });

    res.json({ conversation, messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send message (creates conversation if needed)
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    const senderId = req.user._id;
    
    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId], $size: 2 }
    });
    
    if (!conversation) {
      conversation = new Conversation({ participants: [senderId, receiverId] });
      await conversation.save();
    }
    
    if (content && content.trim()) {
      const message = new Message({
        conversation: conversation._id,
        sender: senderId,
        receiver: receiverId,
        content: content.trim()
      });
      await message.save();
      
      conversation.lastMessage = content;
      conversation.lastMessageTime = new Date();
      await conversation.save();
      
      await message.populate('sender', 'name email');
      return res.status(201).json(message);
    }
    
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;