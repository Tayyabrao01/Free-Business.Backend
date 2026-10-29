const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const EmailVerification = require('../models/EmailVerification');

const OTP_TTL_MS = 5 * 60 * 1000;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const generateOtpCode = () => String(crypto.randomInt(100000, 999999));

const saveOtp = async ({ email, purpose, code, payload = {} }) => {
  const normalizedEmail = normalizeEmail(email);
  const codeHash = await bcrypt.hash(code, 10);
  const expires = new Date(Date.now() + OTP_TTL_MS);

  await EmailVerification.findOneAndUpdate(
    { email: normalizedEmail, purpose },
    {
      email: normalizedEmail,
      purpose,
      codeHash,
      expires,
      payload,
    },
    { upsert: true, new: true }
  );

  return { email: normalizedEmail, expires };
};

const verifyOtp = async ({ email, otp, purpose }) => {
  const normalizedEmail = normalizeEmail(email);
  const stored = await EmailVerification.findOne({ email: normalizedEmail, purpose });

  if (!stored || !stored.codeHash || !stored.expires) {
    return { valid: false, error: 'OTP not found or expired' };
  }

  if (stored.expires < new Date()) {
    await EmailVerification.deleteOne({ _id: stored._id });
    return { valid: false, error: 'OTP has expired' };
  }

  const codeMatch = await bcrypt.compare(String(otp).trim(), stored.codeHash);
  if (!codeMatch) {
    return { valid: false, error: 'Invalid OTP' };
  }

  await EmailVerification.deleteOne({ _id: stored._id });

  return { valid: true, purpose: stored.purpose, payload: stored.payload || {} };
};

const clearOtp = async ({ email, purpose }) => {
  await EmailVerification.deleteOne({ email: normalizeEmail(email), purpose });
};

module.exports = {
  OTP_TTL_MS,
  normalizeEmail,
  isValidEmail,
  generateOtpCode,
  saveOtp,
  verifyOtp,
  clearOtp,
};
