const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

// Get all messages
router.get('/', authMiddleware, async (req, res) => {
  try {
    const messages = await Message.find()
      .populate('sender', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json(messages.reverse());
  } catch (error) {
    console.error('GET /messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send a new message. Accepts { receiverId, content } and creates/fetches a conversation.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { receiverId, content } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (!receiverId) {
      return res.status(400).json({ error: 'receiverId is required' });
    }

    const senderId = req.user._id;

    // Find existing conversation between sender and receiver, or create one
    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId], $size: 2 }
    });

    if (!conversation) {
      conversation = new Conversation({ participants: [senderId, receiverId] });
      await conversation.save();
    }

    const message = new Message({
      conversation: conversation._id,
      sender: senderId,
      receiver: receiverId,
      content: content.trim()
    });

    await message.save();
    conversation.lastMessage = content.trim();
    conversation.lastMessageTime = new Date();
    await conversation.save();

    await message.populate('sender', 'name email');
    res.status(201).json(message);
  } catch (error) {
    console.error('POST /messages error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Delete a message
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await message.deleteOne();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

module.exports = router;