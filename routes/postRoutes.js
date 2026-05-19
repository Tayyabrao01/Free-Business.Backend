const express = require("express");
const { getPosts, createPost, deletePost, likePost, unlikePost, commentOnPost } = require("../controllers/postController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// All routes are protected
router.get("/", authMiddleware, getPosts);
router.post("/", authMiddleware, createPost);
router.delete("/:id", authMiddleware, deletePost);
router.post("/:id/like", authMiddleware, likePost);
router.post("/:id/unlike", authMiddleware, unlikePost);
router.post("/:id/comment", authMiddleware, commentOnPost);

module.exports = router;