const Agent = require("../models/Agent");

const createAgentProfile = async (req, res) => {
  try {
    const { agencyName, experience, specialization, bio } = req.body;

    const existingAgent = await Agent.findOne({ user: req.user._id });
    if (existingAgent) {
      return res.status(400).json({ message: "Agent profile already exists for this user" });
    }

    const agent = await Agent.create({
      user: req.user._id,
      agencyName,
      experience,
      specialization,
      bio,
    });

    return res.status(201).json({ message: "Agent profile created", agent });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create agent profile", error: error.message });
  }
};

const getAgents = async (_req, res) => {
  try {
    const agents = await Agent.find().populate("user", "name email role profileImage");
    return res.status(200).json(agents);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch agents", error: error.message });
  }
};

const getAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id).populate("user", "name email role profileImage");
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }
    return res.status(200).json(agent);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch agent", error: error.message });
  }
};

const updateAgentProfile = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    if (agent.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ message: "You are not authorized to update this agent profile" });
    }

    const { agencyName, experience, specialization, bio, rating } = req.body;
    agent.agencyName = agencyName ?? agent.agencyName;
    agent.experience = experience ?? agent.experience;
    agent.specialization = specialization ?? agent.specialization;
    agent.bio = bio ?? agent.bio;
    agent.rating = rating ?? agent.rating;

    await agent.save();
    return res.status(200).json({ message: "Agent profile updated", agent });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update agent profile", error: error.message });
  }
};

const deleteAgentProfile = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    if (agent.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ message: "You are not authorized to delete this agent profile" });
    }

    await agent.deleteOne();
    return res.status(200).json({ message: "Agent profile deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete agent profile", error: error.message });
  }
};

module.exports = {
  createAgentProfile,
  getAgents,
  getAgent,
  updateAgentProfile,
  deleteAgentProfile,
};
