const express = require("express");
const {
  createReview,
  getReviewsByProperty,
  getReview,
  updateReview,
  deleteReview,
} = require("../controllers/reviewController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, createReview);
router.get("/property/:propertyId", getReviewsByProperty);
router.get("/:id", getReview);
router.put("/:id", authMiddleware, updateReview);
router.delete("/:id", authMiddleware, deleteReview);

module.exports = router;
