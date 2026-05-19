const express = require("express");
const {
  createProperty,
  getAllProperties,
  getSingleProperty,
  updateProperty,
  deleteProperty,
} = require("../controllers/propertyController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", getAllProperties);
router.get("/:id", getSingleProperty);
router.post("/", authMiddleware, createProperty);
router.put("/:id", authMiddleware, updateProperty);
router.delete("/:id", authMiddleware, deleteProperty);

module.exports = router;
