const Inquiry = require("../models/Inquiry");
const Property = require("../models/Property");

const createInquiry = async (req, res) => {
  try {
    const { property, message, phone } = req.body;
    if (!property || !message) {
      return res.status(400).json({ message: "Property and message are required" });
    }

    const propertyRecord = await Property.findById(property);
    if (!propertyRecord) {
      return res.status(404).json({ message: "Property not found" });
    }

    const inquiry = await Inquiry.create({
      property,
      user: req.user._id,
      message,
      phone,
    });

    return res.status(201).json({ message: "Inquiry created successfully", inquiry });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create inquiry", error: error.message });
  }
};

const getInquiries = async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { user: req.user._id };
    const inquiries = await Inquiry.find(filter)
      .populate("property", "title price city")
      .populate("user", "name email phone");
    return res.status(200).json(inquiries);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch inquiries", error: error.message });
  }
};

const getInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id)
      .populate("property", "title price city")
      .populate("user", "name email phone");
    if (!inquiry) {
      return res.status(404).json({ message: "Inquiry not found" });
    }

    if (req.user.role !== "admin" && inquiry.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to view this inquiry" });
    }

    return res.status(200).json(inquiry);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch inquiry", error: error.message });
  }
};

const deleteInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ message: "Inquiry not found" });
    }

    if (req.user.role !== "admin" && inquiry.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to delete this inquiry" });
    }

    await inquiry.deleteOne();
    return res.status(200).json({ message: "Inquiry deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete inquiry", error: error.message });
  }
};

module.exports = {
  createInquiry,
  getInquiries,
  getInquiry,
  deleteInquiry,
};
