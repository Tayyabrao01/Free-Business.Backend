const express = require("express");
const {
  createInquiry,
  getInquiries,
  getInquiry,
  deleteInquiry,
} = require("../controllers/inquiryController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, createInquiry);
router.get("/", authMiddleware, getInquiries);
router.get("/:id", authMiddleware, getInquiry);
router.delete("/:id", authMiddleware, deleteInquiry);

module.exports = router;
