const express = require('express');
const User = require('../models/User');
const { sendOTPEmail } = require('../services/emailService');
const {
  normalizeEmail,
  isValidEmail,
  generateOtpCode,
  saveOtp,
  verifyOtp,
  clearOtp,
  OTP_TTL_MS,
} = require('../services/otpService');

const router = express.Router();

const toE164ish = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withPlus = raw.startsWith('+') ? raw : `+${raw}`;
  return withPlus.replace(/(?!^\+)[^\d]/g, '');
};

const validateRegisterPayload = async (payload = {}) => {
  const { name, email, password, phone, whatsappNumber, location, referralCode } = payload;

  if (!name?.trim() || !email?.trim() || !password) {
    return { ok: false, error: 'Please provide name, email and password in payload' };
  }
  if (String(password).length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters' };
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = toE164ish(phone);
  const normalizedWhatsapp = toE164ish(whatsappNumber || phone);
  const userLocation = (location && String(location).trim()) || 'Not specified';

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return { ok: false, error: 'Email already registered. Please log in.' };
  }

  if (normalizedPhone) {
    const existingPhoneUser = await User.findOne({
      $or: [{ phone: normalizedPhone }, { whatsappNumber: normalizedWhatsapp }],
    });
    if (existingPhoneUser) {
      return { ok: false, error: 'Phone number already registered.' };
    }
  }

  return {
    ok: true,
    payload: {
      name: name.trim(),
      password,
      phone: normalizedPhone || '',
      whatsappNumber: normalizedWhatsapp || '',
      location: userLocation,
      referralCode: referralCode?.trim()?.toUpperCase() || '',
    },
  };
};

const handleSendOtp = async (req, res, { isResend = false } = {}) => {
  try {
    const { email, purpose = 'verification', payload } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    let storedPayload = payload || {};

    if (purpose === 'register') {
      const validation = await validateRegisterPayload(payload || {});
      if (!validation.ok) {
        return res.status(400).json({ message: validation.error, error: validation.error });
      }
      storedPayload = validation.payload;
    }

    if (isResend) {
      await clearOtp({ email: normalizedEmail, purpose });
    }

    const otpCode = generateOtpCode();

    const result = await sendOTPEmail(normalizedEmail, otpCode, purpose);

    if (!result.success) {
      const msg = result.error || 'Failed to send OTP email';
      return res.status(500).json({ message: msg, error: msg });
    }

    await saveOtp({
      email: normalizedEmail,
      purpose,
      code: otpCode,
      payload: storedPayload,
    });

    return res.json({
      success: true,
      message: isResend ? 'OTP resent successfully' : 'OTP sent successfully',
      expiresIn: `${Math.round(OTP_TTL_MS / 60000)} minutes`,
      provider: result.provider || 'email',
    });
  } catch (error) {
    console.error(isResend ? 'Resend OTP error:' : 'Send OTP error:', error);
    const msg = error.message || 'Failed to send OTP';
    return res.status(500).json({ message: msg, error: msg });
  }
};

router.post('/send-otp', (req, res) => handleSendOtp(req, res));

router.post('/resend-otp', (req, res) => handleSendOtp(req, res, { isResend: true }));

router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, purpose = 'verification' } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const result = await verifyOtp({
      email,
      otp,
      purpose,
    });

    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({
      success: true,
      message: 'OTP verified successfully',
      purpose: result.purpose,
      payload: result.payload,
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

module.exports = router;
