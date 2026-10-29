const express = require("express");
const {
  registerUser,
  loginUser,
  verifyOtpLogin,
  sendRegisterOtp,
  verifyRegisterOtp,
  forgotPassword,
  resetPassword,
  changePassword,
} = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", registerUser);
router.post("/register/send-otp", sendRegisterOtp);
router.post("/register/verify", verifyRegisterOtp);
router.post("/login", loginUser);
router.post("/otp/verify", verifyOtpLogin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.put("/change-password", authMiddleware, changePassword);

module.exports = router;
