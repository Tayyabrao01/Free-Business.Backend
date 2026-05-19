const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");

const createConversation = async (req, res) => {
  try {
    const { participantId, propertyId } = req.body;
    const currentUserId = req.user._id.toString();

    if (!participantId) {
      return res.status(400).json({ message: "Agent participant is required" });
    }

    if (participantId.toString() === currentUserId) {
      return res.status(400).json({ message: "Cannot start a conversation with yourself" });
    }

    const participants = [currentUserId, participantId].sort();

    const existing = await Conversation.findOne({
      participants,
      property: propertyId || null,
    })
      .populate("participants", "name email profileImage role")
      .populate("property");

    if (existing) {
      return res.status(200).json({ message: "Conversation already exists", conversation: existing });
    }

    const conversation = await Conversation.create({
      participants,
      property: propertyId || null,
    });

    const populatedConversation = await Conversation.findById(conversation._id)
      .populate("participants", "name email profileImage role")
      .populate("property");

    return res.status(201).json({ message: "Conversation created", conversation: populatedConversation });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create conversation", error: error.message });
  }
};

const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id })
      .populate("participants", "name email profileImage role")
      .populate("property")
      .populate({ path: "lastMessage", populate: { path: "author", select: "name" } })
      .sort({ updatedAt: -1 });

    return res.status(200).json(conversations);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch conversations", error: error.message });
  }
};

const getConversationMessages = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate("participants", "name email profileImage role")
      .populate("property");

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!conversation.participants.some((participant) => participant._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: "Access denied" });
    }

    const messages = await Message.find({ conversation: conversation._id })
      .populate("author", "name profileImage role")
      .sort({ createdAt: 1 });

    return res.status(200).json({ conversation, messages });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch messages", error: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const author = req.user._id;
    const conversationId = req.params.id;

    if (!content) {
      return res.status(400).json({ message: "Content is required" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!conversation.participants.some((participant) => participant.toString() === author.toString())) {
      return res.status(403).json({ message: "Access denied" });
    }

    const message = await Message.create({
      conversation: conversation._id,
      content,
      author,
    });

    conversation.lastMessage = message._id;
    await conversation.save();

    const populatedMessage = await Message.findById(message._id).populate("author", "name profileImage role");

    return res.status(201).json(populatedMessage);
  } catch (error) {
    return res.status(500).json({ message: "Failed to send message", error: error.message });
  }
};

module.exports = {
  createConversation,
  getConversations,
  getConversationMessages,
  sendMessage,
};
