const path = require("path");
const { loadEnv } = require("./config/loadEnv");
const { loadEmailConfig } = require("./config/loadEmailConfig");

const envLoadResult = loadEnv();
const emailConfigLoadResult = loadEmailConfig();

const express = require("express");
const { isFirebaseAdminConfigured } = require("./config/firebaseAdmin");
const {
  isBrevoConfigured,
  isEmailConfigured,
  getEmailConfigStatus,
  getBrevoApiKey,
  getBrevoSenderEmail,
} = require("./services/emailService");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const { ensureUploadsDir } = require("./controllers/imageController");
const { getStreamServerClient } = require("./services/streamChatService");
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

const otpSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many OTP requests. Please wait a minute.",
    error: "Too many OTP requests. Please wait a minute.",
  },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many OTP verification attempts. Try again shortly." },
});

app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "X-FB-Client",
      "X-FB-Platform",
    ],
  })
);
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("CDN-Cache-Control", "no-store");
  res.set("Surrogate-Control", "no-store");
  next();
});
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
  const freshEmailConfig = loadEmailConfig();
  const emailStatus = getEmailConfigStatus();
  const brevoKey = getBrevoApiKey();
  const streamConfigured = Boolean(getStreamServerClient());
  res.json({
    ok: true,
    version: "2.7.5",
    streamConfigured,
    streamApiKeyPresent: Boolean(process.env.STREAM_API_KEY),
    streamApiSecretPresent: Boolean(process.env.STREAM_API_SECRET),
    chatFix: "2.4.2",
    avatarFix: "2.4.3",
    hostingerFix: "2.4.4",
    uploadFix: "2.4.5",
    passwordAndGroups: "2.5.0",
    firebaseAdmin: isFirebaseAdminConfigured(),
    brevo: emailStatus.brevo,
    email: emailStatus.email,
    emailConfig: {
      ...emailStatus,
      brevoKeyLength: brevoKey.length,
      senderEmail: getBrevoSenderEmail() || null,
      envFileFound: Boolean(envLoadResult.loadedFrom),
      envLoadedFrom: envLoadResult.loadedFrom,
      emailConfigReady: freshEmailConfig.ready,
      emailConfigAppliedFrom: freshEmailConfig.applied.map((item) => item.source),
      emailConfigScan: freshEmailConfig.scanned,
      recommendedFile: freshEmailConfig.recommendedFile,
      serverCwd: process.cwd(),
      serverDir: __dirname,
      hint: emailStatus.deliverabilityWarning
        ? emailStatus.deliverabilityWarning
        : emailStatus.brevo
          ? `Brevo ready. Sending from: ${(emailStatus.activeSenders || []).join(', ') || 'unknown'}`
          : freshEmailConfig.scanned.some((item) => item.filePath.endsWith("email.config.js") && item.exists)
            ? "email.config.js found but BREVO_API_KEY is empty or still placeholder — edit and restart"
            : "Copy config/email.config.example.js to config/email.config.js, paste Brevo key, restart",
    },
    features: {
      social: true,
      groups: true,
      rewards: true,
      stream: streamConfigured,
      directChannelRoute: true,
      groupSyncRoute: true,
    },
  });
});

app.use("/api", generalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/otp/send-otp", otpSendLimiter);
app.use("/api/otp/resend-otp", otpSendLimiter);
app.use("/api/otp/verify-otp", otpVerifyLimiter);
app.use("/api/auth/otp/verify", otpVerifyLimiter);

app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/properties", require("./routes/propertyRoutes"));
app.use("/api/agents", require("./routes/agentRoutes"));
app.use("/api/inquiries", require("./routes/inquiryRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/images", require("./routes/imageRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/otp", require("./routes/otpRoutes"));
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
  const emailConfig = getEmailConfigStatus();
  console.log(`Server running on port ${PORT}`);
  console.log("API version: 2.7.5 (chat never wiped on calls + ringing fixes)");
  console.log("API features: social, groups, rewards, stream, chat-status");
  console.log(
    `Email: ${emailConfigLoadResult.ready ? "configured" : "NOT configured"} | Brevo key length: ${emailConfigLoadResult.brevoKeyLength} | recommended: ${emailConfigLoadResult.recommendedFile}`
  );
});
