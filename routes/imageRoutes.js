const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  createImage,
  createImageFromBase64,
  getImages,
  getImage,
  getImagesByProperty,
  updateImage,
  deleteImage,
} = require("../controllers/imageController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName =
      (file.originalname || "photo.jpg")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-.]/g, "") || "photo.jpg";
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const handleMulterError = (err, req, res, next) => {
  if (!err) {
    return next();
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "Image is too large. Use a photo under 5 MB." });
  }
  return res.status(400).json({ message: err.message || "Invalid image upload" });
};

router.post("/upload", authMiddleware, upload.single("image"), handleMulterError, createImage);
router.post("/upload-base64", authMiddleware, createImageFromBase64);
router.get("/", authMiddleware, getImages);
router.get("/property/:propertyId", getImagesByProperty);
router.get("/:id", authMiddleware, getImage);
router.put("/:id", authMiddleware, updateImage);
router.delete("/:id", authMiddleware, deleteImage);

module.exports = router;
