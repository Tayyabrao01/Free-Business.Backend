const nodemailer = require('nodemailer');

const isEmailConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
  if (!isEmailConfigured()) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendPasswordResetEmail = async (toEmail, code) => {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@freebusinessgip.com';
  const appName = process.env.APP_NAME || 'Free Business';

  if (!isEmailConfigured()) {
    console.warn(`[password-reset] SMTP not set. Reset code for ${toEmail}: ${code}`);
    return { sent: false, logged: true };
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from,
    to: toEmail,
    subject: `${appName} — Password reset code`,
    text: `Your password reset code is: ${code}\n\nThis code expires in 15 minutes.\nIf you did not request this, ignore this email.`,
    html: `<p>Your password reset code is:</p><p style="font-size:24px;font-weight:bold">${code}</p><p>This code expires in 15 minutes.</p>`,
  });

  return { sent: true };
};

module.exports = { isEmailConfigured, sendPasswordResetEmail };
