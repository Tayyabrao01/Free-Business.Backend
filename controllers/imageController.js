const fs = require("fs");
const path = require("path");
const Image = require("../models/Image");
const Property = require("../models/Property");

const uploadsDir = path.join(__dirname, "..", "uploads");

const ensureUploadsDir = () => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
};

const saveImageRecord = async (req, res, { imageUrl, filename, mimeType, size, property, caption }) => {
  if (property) {
    const propertyRecord = await Property.findById(property);
    if (!propertyRecord) {
      const filePath = path.join(uploadsDir, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(404).json({ message: "Property not found" });
    }
  }

  const image = await Image.create({
    url: imageUrl,
    filename,
    mimeType,
    size,
    caption,
    property,
    user: req.user._id,
  });

  if (property) {
    const propertyRecord = await Property.findById(property);
    propertyRecord.images = propertyRecord.images || [];
    if (!propertyRecord.images.includes(imageUrl)) {
      propertyRecord.images.push(imageUrl);
      await propertyRecord.save();
    }
  }

  return res.status(201).json({ message: "Image uploaded successfully", image });
};

const createImage = async (req, res) => {
  try {
    ensureUploadsDir();
    if (!req.file) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const { property, caption } = req.body;
    const imageUrl = `/uploads/${req.file.filename}`;

    return saveImageRecord(req, res, {
      imageUrl,
      filename: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      property,
      caption,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to upload image", error: error.message });
  }
};

const createImageFromBase64 = async (req, res) => {
  try {
    ensureUploadsDir();
    const { image, mimeType = "image/jpeg", property, caption } = req.body;

    if (!image || typeof image !== "string") {
      return res.status(400).json({ message: "Image data is required" });
    }

    const buffer = Buffer.from(image, "base64");
    if (!buffer.length) {
      return res.status(400).json({ message: "Invalid image data" });
    }
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ message: "Image is too large. Use a photo under 5 MB." });
    }

    const ext = mimeType.includes("png") ? "png" : "jpg";
    const filename = `${Date.now()}-upload.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);

    const imageUrl = `/uploads/${filename}`;
    return saveImageRecord(req, res, {
      imageUrl,
      filename,
      mimeType,
      size: buffer.length,
      property,
      caption,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to upload image", error: error.message });
  }
};

const getImages = async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { user: req.user._id };
    const images = await Image.find(filter)
      .populate("property", "title price city")
      .populate("user", "name email");
    return res.status(200).json(images);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch images", error: error.message });
  }
};

const getImage = async (req, res) => {
  try {
    const image = await Image.findById(req.params.id)
      .populate("property", "title price city")
      .populate("user", "name email");
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }

    if (req.user.role !== "admin" && image.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to view this image" });
    }

    return res.status(200).json(image);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch image", error: error.message });
  }
};

const getImagesByProperty = async (req, res) => {
  try {
    const images = await Image.find({ property: req.params.propertyId }).populate("user", "name email");
    return res.status(200).json(images);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch property images", error: error.message });
  }
};

const updateImage = async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }

    if (req.user.role !== "admin" && image.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to update this image" });
    }

    const { caption } = req.body;
    image.caption = caption ?? image.caption;
    await image.save();

    return res.status(200).json({ message: "Image updated successfully", image });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update image", error: error.message });
  }
};

const deleteImage = async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }

    if (req.user.role !== "admin" && image.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to delete this image" });
    }

    const filePath = path.join(__dirname, "..", "uploads", image.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (image.property) {
      const property = await Property.findById(image.property);
      if (property) {
        property.images = property.images.filter((imgUrl) => imgUrl !== image.url);
        await property.save();
      }
    }

    await image.deleteOne();
    return res.status(200).json({ message: "Image deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete image", error: error.message });
  }
};

module.exports = {
  createImage,
  createImageFromBase64,
  ensureUploadsDir,
  getImages,
  getImage,
  getImagesByProperty,
  updateImage,
  deleteImage,
};
