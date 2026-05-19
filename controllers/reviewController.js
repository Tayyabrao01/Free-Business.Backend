const Review = require("../models/Review");
const Property = require("../models/Property");

const createReview = async (req, res) => {
  try {
    const { property, rating, comment } = req.body;
    if (!property || rating === undefined) {
      return res.status(400).json({ message: "Property and rating are required" });
    }

    const propertyRecord = await Property.findById(property);
    if (!propertyRecord) {
      return res.status(404).json({ message: "Property not found" });
    }

    const existingReview = await Review.findOne({ property, user: req.user._id });
    if (existingReview) {
      return res.status(400).json({ message: "You have already reviewed this property" });
    }

    const review = await Review.create({
      property,
      user: req.user._id,
      rating,
      comment,
    });

    return res.status(201).json({ message: "Review created successfully", review });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create review", error: error.message });
  }
};

const getReviewsByProperty = async (req, res) => {
  try {
    const reviews = await Review.find({ property: req.params.propertyId }).populate("user", "name profileImage");
    return res.status(200).json(reviews);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch reviews", error: error.message });
  }
};

const getReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id).populate("user", "name profileImage");
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }
    return res.status(200).json(review);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch review", error: error.message });
  }
};

const updateReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (review.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ message: "You are not authorized to update this review" });
    }

    const { rating, comment } = req.body;
    review.rating = rating ?? review.rating;
    review.comment = comment ?? review.comment;
    await review.save();

    return res.status(200).json({ message: "Review updated successfully", review });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update review", error: error.message });
  }
};

const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (review.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ message: "You are not authorized to delete this review" });
    }

    await review.deleteOne();
    return res.status(200).json({ message: "Review deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete review", error: error.message });
  }
};

module.exports = {
  createReview,
  getReviewsByProperty,
  getReview,
  updateReview,
  deleteReview,
};
