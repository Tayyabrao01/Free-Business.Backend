const Message = require("../models/Message");

// Get all messages
const getMessages = async (req, res) => {
  try {
    const messages = await Message.find().populate("author", "name email").sort({ createdAt: -1 });
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch messages", error: error.message });
  }
};

// Send a new message
const sendMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const author = req.user._id;

    if (!content) {
      return res.status(400).json({ message: "Content is required" });
    }

    const message = await Message.create({
      content,
      author,
    });

    const populatedMessage = await Message.findById(message._id).populate("author", "name email");

    res.status(201).json(populatedMessage);
  } catch (error) {
    res.status(500).json({ message: "Failed to send message", error: error.message });
  }
};

module.exports = {
  getMessages,
  sendMessage,
};