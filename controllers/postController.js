const Post = require("../models/Post");
const Activity = require("../models/Activity");
const { incrementPostsCount } = require("../services/rewardTrackingService");

// Get all posts
const getPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("author", "name email")
      .populate("likes", "name")
      .populate("comments.user", "name")
      .sort({ createdAt: -1 });
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch posts", error: error.message });
  }
};

// Create a new post
const createPost = async (req, res) => {
  try {
    const { content, imageUrl } = req.body;
    const author = req.user._id;

    if (!content) {
      return res.status(400).json({ message: "Content is required" });
    }

    const post = await Post.create({
      content,
      imageUrl,
      author,
    });

    await incrementPostsCount(author);

    try {
      await Activity.create({
        user: author,
        action: 'post',
        targetType: 'post',
        targetId: post._id,
      });
    } catch (activityError) {
      console.error('Post activity log error:', activityError.message);
    }

    const populatedPost = await Post.findById(post._id).populate("author", "name email");

    res.status(201).json(populatedPost);
  } catch (error) {
    res.status(500).json({ message: "Failed to create post", error: error.message });
  }
};

// Delete a post
const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this post" });
    }

    await Post.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Post deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete post", error: error.message });
  }
};

// Like a post
const likePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.likes.includes(req.user._id)) {
      return res.status(400).json({ message: "Post already liked" });
    }

    post.likes.push(req.user._id);
    await post.save();

    res.status(200).json({ message: "Post liked successfully", likes: post.likes });
  } catch (error) {
    res.status(500).json({ message: "Failed to like post", error: error.message });
  }
};

// Unlike a post
const unlikePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (!post.likes.includes(req.user._id)) {
      return res.status(400).json({ message: "Post not liked yet" });
    }

    post.likes = post.likes.filter((id) => id.toString() !== req.user._id.toString());
    await post.save();

    res.status(200).json({ message: "Post unliked successfully", likes: post.likes });
  } catch (error) {
    res.status(500).json({ message: "Failed to unlike post", error: error.message });
  }
};

// Comment on a post
const commentOnPost = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const newComment = {
      user: req.user._id,
      text,
    };

    post.comments.push(newComment);
    await post.save();

    // Populate user name before returning
    await post.populate("comments.user", "name");

    res.status(201).json({ message: "Comment added successfully", comments: post.comments });
  } catch (error) {
    res.status(500).json({ message: "Failed to comment on post", error: error.message });
  }
};

module.exports = {
  getPosts,
  createPost,
  deletePost,
  likePost,
  unlikePost,
  commentOnPost,
};