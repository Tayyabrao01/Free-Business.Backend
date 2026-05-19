const express = require("express");
const {
  createAgentProfile,
  getAgents,
  getAgent,
  updateAgentProfile,
  deleteAgentProfile,
} = require("../controllers/agentController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", getAgents);
router.get("/:id", getAgent);
router.post("/", authMiddleware, createAgentProfile);
router.put("/:id", authMiddleware, updateAgentProfile);
router.delete("/:id", authMiddleware, deleteAgentProfile);

module.exports = router;
