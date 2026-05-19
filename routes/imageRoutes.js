const express = require("express");
const multer = require("multer");
const path = require("path");
const {
  createImage,
  getImages,
  getImage,
  getImagesByProperty,
  updateImage,
  deleteImage,
} = require("../controllers/imageController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "..", "uploads"));
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-.]/g, "");
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({ storage });

router.post("/upload", authMiddleware, upload.single("image"), createImage);
router.get("/", authMiddleware, getImages);
router.get("/property/:propertyId", getImagesByProperty);
router.get("/:id", authMiddleware, getImage);
router.put("/:id", authMiddleware, updateImage);
router.delete("/:id", authMiddleware, deleteImage);

module.exports = router;
