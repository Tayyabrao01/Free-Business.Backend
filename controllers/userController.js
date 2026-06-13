const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { applyReferralOnRegister } = require("../services/rewardTrackingService");
const { deleteUserAccount } = require("../services/accountDeletionService");
const { verifyFirebaseIdToken } = require("../config/firebaseAdmin");
const { sendPasswordResetEmail } = require("../services/emailService");
const crypto = require("crypto");

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

const toE164ish = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withPlus = raw.startsWith("+") ? raw : `+${raw}`;
  return withPlus.replace(/(?!^\+)[^\d]/g, "");
};

const shapeAuthUser = (user) => ({
  id: user._id,
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  whatsappNumber: user.whatsappNumber,
  location: user.location,
  role: user.role,
  avatar: user.avatar,
  referralCode: user.referralCode,
  currentTier: user.currentTier,
  totalCommission: user.totalCommission,
  referralEarnings: user.referralEarnings,
  followersCount: user.followersCount || 0,
});

// Register a new user
const registerUser = async (req, res) => {
  try {
    const { name, email, password, phone, whatsappNumber, location, role, referralCode } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Please provide name, email and password" });
    }

    const normalizedPhone = toE164ish(phone);
    const normalizedWhatsapp = toE164ish(whatsappNumber);

    if (!normalizedPhone || !normalizedWhatsapp) {
      return res.status(400).json({ message: "Phone number and WhatsApp number are required" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server misconfigured: JWT_SECRET is missing" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const userLocation = (location && String(location).trim()) || "Not specified";

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered. Please log in." });
    }
    const existingPhoneUser = await User.findOne({
      $or: [{ phone: normalizedPhone }, { whatsappNumber: normalizedWhatsapp }],
    });
    if (existingPhoneUser) {
      return res.status(400).json({ message: "Phone/WhatsApp number already registered. Please log in." });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    let user;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        user = await User.create({
          name: name.trim(),
          email: normalizedEmail,
          password: hashedPassword,
          phone: normalizedPhone,
          whatsappNumber: normalizedWhatsapp,
          location: userLocation,
          role: role || "user",
        });
        break;
      } catch (createError) {
        if (createError.code === 11000 && createError.keyPattern?.referralCode && attempt < 4) {
          continue;
        }
        throw createError;
      }
    }

    if (!user) {
      return res.status(500).json({ message: "Could not create user. Please try again." });
    }

    if (referralCode) {
      try {
        await applyReferralOnRegister(user, referralCode);
      } catch (referralError) {
        console.warn("Referral apply failed:", referralError.message);
      }
    }

    const freshUser = await User.findById(user._id).select("-password");

    return res.status(201).json({
      message: "User registered successfully",
      token: generateToken(freshUser._id),
      user: {
        id: freshUser._id,
        _id: freshUser._id,
        name: freshUser.name,
        email: freshUser.email,
        ...shapeAuthUser(freshUser),
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already registered. Please log in." });
    }
    return res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

// Login user
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ message: "Please provide email and password" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Return response with token
    return res.status(200).json({
      message: "Login successful",
      token: generateToken(user._id),
      user: shapeAuthUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: "Login failed", error: error.message });
  }
};

const verifyOtpLogin = async (req, res) => {
  try {
    const {
      idToken,
      name,
      email,
      phone,
      whatsappNumber,
      location,
      referralCode,
    } = req.body || {};

    if (!idToken) {
      return res.status(400).json({ message: "Firebase idToken is required" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server misconfigured: JWT_SECRET is missing" });
    }

    const decoded = await verifyFirebaseIdToken(idToken);
    const firebasePhone = toE164ish(decoded.phone_number || phone);
    if (!firebasePhone) {
      return res.status(400).json({ message: "Phone number is required for OTP login" });
    }

    const normalizedWhatsapp = toE164ish(whatsappNumber || firebasePhone);
    const normalizedEmail = email ? String(email).trim().toLowerCase() : "";
    const userLocation = (location && String(location).trim()) || "Not specified";

    let user = await User.findOne({
      $or: [{ phone: firebasePhone }, { whatsappNumber: firebasePhone }],
    });

    if (!user && normalizedEmail) {
      user = await User.findOne({ email: normalizedEmail });
    }

    const isNewUser = !user;

    if (!user) {
      const fallbackName = decoded.name || decoded.phone_number || "User";
      user = await User.create({
        name: String(name || fallbackName).trim().slice(0, 80),
        email: normalizedEmail || `${decoded.uid}@otp.local`,
        password: await bcrypt.hash(decoded.uid, 10),
        phone: firebasePhone,
        whatsappNumber: normalizedWhatsapp || firebasePhone,
        location: userLocation,
        role: "user",
      });

      if (referralCode) {
        try {
          await applyReferralOnRegister(user, referralCode);
        } catch (referralError) {
          console.warn("Referral apply failed:", referralError.message);
        }
      }
    } else {
      // Merge missing profile pieces for migrated users
      if (!user.phone) user.phone = firebasePhone;
      if (!user.whatsappNumber) user.whatsappNumber = normalizedWhatsapp || firebasePhone;
      if (!user.email || user.email.endsWith("@otp.local")) {
        if (normalizedEmail) user.email = normalizedEmail;
      }
      if (name && !user.name) user.name = String(name).trim().slice(0, 80);
      await user.save();
    }

    const freshUser = await User.findById(user._id).select("-password");
    return res.status(200).json({
      message: isNewUser ? "OTP registration successful" : "OTP login successful",
      token: generateToken(freshUser._id),
      user: shapeAuthUser(freshUser),
    });
  } catch (error) {
    return res.status(401).json({ message: "OTP verification failed", error: error.message });
  }
};

// Get user profile (protected route)
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch profile", error: error.message });
  }
};

// Update user profile (protected route)
const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const userId = req.user._id;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, email },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Profile updated successfully",
      user: {
        id: updatedUser._id,
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        location: updatedUser.location,
        role: updatedUser.role,
        avatar: updatedUser.avatar,
        bio: updatedUser.bio,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password is required to delete your account" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(403).json({ message: "Admin accounts cannot be deleted from the app" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    const userId = user._id;
    await deleteUserAccount(userId);

    return res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete account", error: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+passwordResetCode +passwordResetExpires"
    );

    if (user) {
      const code = String(crypto.randomInt(100000, 999999));
      user.passwordResetCode = await bcrypt.hash(code, 10);
      user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      await sendPasswordResetEmail(normalizedEmail, code);
    }

    return res.status(200).json({
      message:
        "If an account exists for this email, a reset code has been sent. Check your inbox.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to process reset request", error: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: "Email, code, and new password are required" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+password +passwordResetCode +passwordResetExpires"
    );

    if (!user || !user.passwordResetCode || !user.passwordResetExpires) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    if (user.passwordResetExpires < new Date()) {
      return res.status(400).json({ message: "Reset code has expired. Request a new one." });
    }

    const codeMatch = await bcrypt.compare(String(code).trim(), user.passwordResetCode);
    if (!codeMatch) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetCode = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return res.status(200).json({ message: "Password reset successfully. You can log in now." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to reset password", error: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to change password", error: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  verifyOtpLogin,
  forgotPassword,
  resetPassword,
  changePassword,
  getProfile,
  updateProfile,
  deleteAccount,
  getAllUsers,
};

// Get all users (protected)
async function getAllUsers(req, res) {
  try {
    const users = await User.find().select('-password');
    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
}
