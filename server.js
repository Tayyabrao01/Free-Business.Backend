const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const { ensureUploadsDir } = require("./controllers/imageController");

dotenv.config();
connectDB();
ensureUploadsDir();

const app = express();

// Hostinger/nginx forwards X-Forwarded-For — required for express-rate-limit
app.set("trust proxy", 1);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many auth attempts, please try again in a minute." },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many OTP verification attempts. Try again shortly." },
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (_req, res) => {
  res.json({ message: "Real Estate API is running" });
});

app.get("/privacy", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Free Business Privacy Policy</title></head><body style="font-family:sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.6">
<h1>Privacy Policy</h1>
<p>Free Business collects account data (name, email), profile content, messages via Stream, and reward activity to operate the app.</p>
<p>You may delete your account in the app (Profile → Delete account) or email <a href="mailto:support@freebusinessgip.com">support@freebusinessgip.com</a>.</p>
<p>Last updated: May 2026</p>
</body></html>`);
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    version: "2.5.0",
    chatFix: "2.4.2",
    avatarFix: "2.4.3",
    hostingerFix: "2.4.4",
    uploadFix: "2.4.5",
    passwordAndGroups: "2.5.0",
    features: {
      social: true,
      groups: true,
      rewards: true,
      stream: true,
      directChannelRoute: true,
      groupSyncRoute: true,
    },
  });
});

app.use("/api", generalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/auth/otp/verify", otpVerifyLimiter);

app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/properties", require("./routes/propertyRoutes"));
app.use("/api/agents", require("./routes/agentRoutes"));
app.use("/api/inquiries", require("./routes/inquiryRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/images", require("./routes/imageRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/posts", require("./routes/postRoutes"));
app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api/conversations", require("./routes/conversationRoutes"));
app.use("/api/rewards", require("./routes/rewardRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/admin/rewards", require("./routes/adminRewards"));
app.use("/api/social", require("./routes/socialRoutes"));
app.use("/api", require("./routes/streamToken"));

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong", error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("API version: 2.5.0 (password reset + WhatsApp groups)");
  console.log("API features: social, groups, rewards, stream, chat-status");
});
