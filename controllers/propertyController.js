const Property = require("../models/Property");
const { recordPropertyCompletion } = require("../services/rewardTrackingService");

const createProperty = async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      propertyType,
      purpose,
      bedrooms,
      bathrooms,
      area,
      address,
      city,
      images,
      isFeatured,
      status,
    } = req.body;

    if (!title || !description || price === undefined || !propertyType || !purpose) {
      return res.status(400).json({
        message: "Please provide title, description, price, propertyType, and purpose",
      });
    }

    const property = await Property.create({
      owner: req.user._id,
      title,
      description,
      price,
      propertyType,
      purpose,
      bedrooms,
      bathrooms,
      area,
      address,
      city,
      images: Array.isArray(images) ? images : [],
      isFeatured: isFeatured ?? false,
      status: status ?? "available",
    });

    return res.status(201).json({ message: "Property created successfully", property });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create property", error: error.message });
  }
};

const getAllProperties = async (req, res) => {
  try {
    const filter = {};
    const { city, purpose, propertyType, status } = req.query;

    if (city) filter.city = city;
    if (purpose) filter.purpose = purpose;
    if (propertyType) filter.propertyType = propertyType;
    if (status) filter.status = status;

    const properties = await Property.find(filter)
      .populate("owner", "name email role profileImage")
      .sort({ createdAt: -1 });

    return res.status(200).json(properties);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch properties", error: error.message });
  }
};

const getSingleProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id).populate("owner", "name email role profileImage");
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    return res.status(200).json(property);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch property", error: error.message });
  }
};

const updateProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    if (property.owner.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ message: "You are not authorized to update this property" });
    }

    const {
      title,
      description,
      price,
      propertyType,
      purpose,
      bedrooms,
      bathrooms,
      area,
      address,
      city,
      images,
      isFeatured,
      status,
    } = req.body;

    property.title = title ?? property.title;
    property.description = description ?? property.description;
    property.price = price ?? property.price;
    property.propertyType = propertyType ?? property.propertyType;
    property.purpose = purpose ?? property.purpose;
    property.bedrooms = bedrooms ?? property.bedrooms;
    property.bathrooms = bathrooms ?? property.bathrooms;
    property.area = area ?? property.area;
    property.address = address ?? property.address;
    property.city = city ?? property.city;
    property.images = images ?? property.images;
    property.isFeatured = isFeatured ?? property.isFeatured;
    const previousStatus = property.status;
    property.status = status ?? property.status;

    await property.save();

    let commissionInfo = null;
    const completedStatuses = ["sold", "rented"];
    if (
      completedStatuses.includes(property.status) &&
      previousStatus === "available" &&
      property.owner
    ) {
      const purpose = property.status === "rented" ? "rent" : "sale";
      commissionInfo = await recordPropertyCompletion(
        property.owner,
        purpose,
        property.price
      );
    }

    return res.status(200).json({
      message: "Property updated successfully",
      property,
      commission: commissionInfo?.commission || 0,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update property", error: error.message });
  }
};

const deleteProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    if (property.owner.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ message: "You are not authorized to delete this property" });
    }

    await property.deleteOne();
    return res.status(200).json({ message: "Property deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete property", error: error.message });
  }
};

module.exports = {
  createProperty,
  getAllProperties,
  getSingleProperty,
  updateProperty,
  deleteProperty,
};
