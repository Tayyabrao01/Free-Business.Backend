const express = require("express");
const {
  createPayment,
  getPayments,
  getPayment,
  updatePaymentStatus,
} = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/", authMiddleware, createPayment);
router.get("/", authMiddleware, getPayments);
router.get("/:id", authMiddleware, getPayment);
router.put("/:id/status", authMiddleware, authorizeRoles("admin"), updatePaymentStatus);

module.exports = router;
