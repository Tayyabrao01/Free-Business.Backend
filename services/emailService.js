const nodemailer = require('nodemailer');

const { loadEmailConfig } = require('../config/loadEmailConfig');

loadEmailConfig();

const DOMAIN_SENDERS = [
  'noreply@freebusinessgip.com',
  'support@freebusinessgip.com',
];

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
]);

const readEnv = (...keys) => {
  for (const key of keys) {
    const raw = process.env[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    const value = String(raw).trim().replace(/^['"]|['"]$/g, '');
    if (value) {
      return value;
    }
  }
  return '';
};

const getBrevoApiKey = () =>
  readEnv('BREVO_API_KEY', 'SENDINBLUE_API_KEY', 'BREVO_KEY', 'BREVO_API');

const getBrevoSenderEmail = () =>
  readEnv('BREVO_SENDER_EMAIL', 'SMTP_FROM', 'EMAIL_FROM', 'SENDER_EMAIL');

const getReplyToEmail = () =>
  readEnv('BREVO_REPLY_TO', 'REPLY_TO_EMAIL') || 'support@freebusinessgip.com';

const isSmtpConfigured = () =>
  Boolean(readEnv('SMTP_HOST') && readEnv('SMTP_USER') && readEnv('SMTP_PASS'));

const isBrevoSmtpConfigured = () =>
  Boolean(readEnv('BREVO_SMTP_LOGIN') && readEnv('BREVO_SMTP_KEY'));

const isBrevoConfigured = () => Boolean(getBrevoApiKey());

const isEmailConfigured = () =>
  isBrevoConfigured() || isSmtpConfigured() || isBrevoSmtpConfigured();

const isFreeEmailSender = (email) => {
  const domain = String(email || '').split('@')[1]?.toLowerCase();
  return FREE_EMAIL_DOMAINS.has(domain);
};

const getDomainSenderList = () => {
  const customDomainSender = readEnv('BREVO_TRANSACTIONAL_SENDER', 'BREVO_DOMAIN_SENDER');
  return [...new Set([customDomainSender, ...DOMAIN_SENDERS].filter(Boolean))];
};

const getSenderCandidates = () => {
  const appName = readEnv('APP_NAME') || 'Free Business';
  const configured = getBrevoSenderEmail();
  const domainSenders = getDomainSenderList();
  const ordered = [];

  if (configured && !isFreeEmailSender(configured)) {
    ordered.push(configured);
  }

  ordered.push(...domainSenders);

  if (configured && isFreeEmailSender(configured)) {
    ordered.push(configured);
  }

  return [...new Set(ordered.filter(Boolean))].map((email) => ({
    name: appName,
    email,
  }));
};

const getEmailConfigStatus = () => {
  const sender = getBrevoSenderEmail();
  const usesFreeEmailSender = isFreeEmailSender(sender);
  const activeSenders = getSenderCandidates().map((item) => item.email);

  let deliverabilityWarning = null;
  if (usesFreeEmailSender) {
    deliverabilityWarning =
      'Personal email (Gmail/Yahoo) as sender often never reaches inbox. Set BREVO_SENDER_EMAIL to noreply@freebusinessgip.com and authenticate freebusinessgip.com in Brevo (SPF + DKIM).';
  } else if (sender.includes('apps.freebusinessgip.com')) {
    deliverabilityWarning =
      'Use noreply@freebusinessgip.com instead of apps subdomain unless that subdomain is authenticated in Brevo.';
  }

  return {
    brevo: isBrevoConfigured(),
    email: isEmailConfigured(),
    brevoKeyPresent: Boolean(getBrevoApiKey()),
    senderEmailPresent: Boolean(sender),
    smtpConfigured: isSmtpConfigured(),
    brevoSmtpConfigured: isBrevoSmtpConfigured(),
    senderEmail: sender || null,
    activeSenders,
    replyToEmail: getReplyToEmail(),
    usesFreeEmailSender,
    deliverabilityWarning,
    recommendedSender: 'noreply@freebusinessgip.com',
    secretsFileHint: 'Create backend/config/secrets.json on server if hPanel env vars fail',
  };
};

const getTransporter = () => {
  if (!isSmtpConfigured()) {
    return null;
  }
  return nodemailer.createTransport({
    host: readEnv('SMTP_HOST'),
    port: Number(readEnv('SMTP_PORT') || 587),
    secure: readEnv('SMTP_SECURE') === 'true',
    auth: {
      user: readEnv('SMTP_USER'),
      pass: readEnv('SMTP_PASS'),
    },
  });
};

const getBrevoRelayTransporter = () => {
  if (!isBrevoSmtpConfigured()) {
    return null;
  }
  return nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: Number(readEnv('BREVO_SMTP_PORT') || 587),
    secure: false,
    auth: {
      user: readEnv('BREVO_SMTP_LOGIN'),
      pass: readEnv('BREVO_SMTP_KEY'),
    },
  });
};

const getSender = () =>
  getSenderCandidates()[0] || {
    name: readEnv('APP_NAME') || 'Free Business',
    email: 'noreply@freebusinessgip.com',
  };

const purposeSubjects = {
  verification: 'verification',
  register: 'registration',
  password_reset: 'password reset',
  login: 'login',
};

const formatEmailSendError = (errorBody) => {
  let message = errorBody;
  let code = '';

  try {
    const parsed = typeof errorBody === 'string' ? JSON.parse(errorBody) : errorBody;
    message = parsed.message || parsed.error || errorBody;
    code = parsed.code || '';
  } catch (_) {
    // keep raw body
  }

  const text = String(message || '').toLowerCase();
  const codeText = String(code || '').toLowerCase();

  if (text.includes('unrecognised ip') || text.includes('unrecognized ip')) {
    return 'Email service blocked this server. Ask admin to authorize the Hostinger IP in Brevo security settings, then try again.';
  }
  if (codeText === 'unauthorized' || (text.includes('unauthorized') && text.includes('ip'))) {
    return 'Email service blocked this server IP. Ask admin to authorize it in Brevo, then try again.';
  }
  if (
    text.includes('sender') ||
    text.includes('not valid') ||
    text.includes('not verified') ||
    text.includes('domain') ||
    codeText === 'invalid_parameter'
  ) {
    return 'Email sender is not verified in Brevo. Use noreply@freebusinessgip.com and authenticate freebusinessgip.com domain (SPF + DKIM) in Brevo.';
  }

  return String(message || 'Failed to send verification email');
};

const isSenderRelatedError = (errorText) => {
  const text = String(errorText || '').toLowerCase();
  return (
    text.includes('sender') ||
    text.includes('not valid') ||
    text.includes('not verified') ||
    text.includes('domain') ||
    text.includes('invalid_parameter')
  );
};

const buildOtpEmailContent = (otpCode, purpose = 'verification') => {
  const appName = readEnv('APP_NAME') || 'Free Business';
  const action = purposeSubjects[purpose] || purposeSubjects.verification;
  const supportEmail = getReplyToEmail();
  const website = readEnv('APP_WEBSITE', 'COMPANY_WEBSITE') || 'https://freebusinessgip.com';

  const footerLines = [
    appName,
    website,
    `Support: ${supportEmail}`,
  ];

  return {
    subject: `Your ${appName} ${action} code: ${otpCode}`,
    text: [
      `Hello,`,
      '',
      `Use this code to complete your ${action} on ${appName}:`,
      '',
      otpCode,
      '',
      'This code expires in 5 minutes.',
      'If you did not request this, you can safely ignore this email.',
      '',
      ...footerLines,
    ].join('\n'),
    html: [
      `<!DOCTYPE html>`,
      `<html><body style="margin:0;padding:0;background:#f6f6f6;">`,
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f6;padding:24px 0;">`,
      `<tr><td align="center">`,
      `<table role="presentation" width="520" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e8e8e8;border-radius:8px;padding:28px;font-family:Arial,sans-serif;color:#111;">`,
      `<tr><td style="font-size:20px;font-weight:700;padding-bottom:12px;">${appName}</td></tr>`,
      `<tr><td style="font-size:15px;line-height:1.5;padding-bottom:16px;">Use this code to complete your ${action}:</td></tr>`,
      `<tr><td style="font-size:32px;font-weight:700;letter-spacing:8px;padding:12px 0 20px;">${otpCode}</td></tr>`,
      `<tr><td style="font-size:14px;color:#555;line-height:1.5;padding-bottom:8px;">This code expires in 5 minutes.</td></tr>`,
      `<tr><td style="font-size:14px;color:#555;line-height:1.5;padding-bottom:20px;">If you did not request this, you can safely ignore this email.</td></tr>`,
      `<tr><td style="border-top:1px solid #eee;padding-top:16px;font-size:12px;color:#777;line-height:1.6;">`,
      `<a href="${website}" style="color:#777;text-decoration:none;">${website.replace(/^https?:\/\//, '')}</a><br/>`,
      `Need help? <a href="mailto:${supportEmail}" style="color:#777;">${supportEmail}</a>`,
      `</td></tr>`,
      `</table>`,
      `</td></tr></table>`,
      `</body></html>`,
    ].join(''),
  };
};

const sendViaBrevoOnce = async (toEmail, otpCode, purpose, sender) => {
  const content = buildOtpEmailContent(otpCode, purpose);
  const appName = readEnv('APP_NAME') || 'Free Business';

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': getBrevoApiKey(),
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: toEmail }],
      replyTo: { email: getReplyToEmail(), name: `${appName} Support` },
      subject: content.subject,
      htmlContent: content.html,
      textContent: content.text,
      tags: ['otp', purpose, 'transactional'],
      headers: {
        'X-Mailin-custom': JSON.stringify({ type: 'otp', purpose }),
      },
    }),
  });

  const responseText = await response.text();
  let responseBody = {};
  try {
    responseBody = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    responseBody = { raw: responseText };
  }

  if (!response.ok) {
    console.error('[brevo] send failed:', sender.email, response.status, responseText);
    return { success: false, error: formatEmailSendError(responseText) };
  }

  const messageId = responseBody.messageId || responseBody.messageIds?.[0] || null;
  console.log('[brevo] queued:', {
    to: toEmail,
    from: sender.email,
    messageId,
    purpose,
  });

  return {
    success: true,
    provider: 'brevo',
    sender: sender.email,
    messageId,
  };
};

const sendViaBrevo = async (toEmail, otpCode, purpose) => {
  const senders = getSenderCandidates();
  let lastError = 'Failed to send verification email';

  for (let index = 0; index < senders.length; index += 1) {
    const sender = senders[index];
    const result = await sendViaBrevoOnce(toEmail, otpCode, purpose, sender);
    if (result.success) {
      if (index > 0) {
        console.warn(`[brevo] sent using fallback sender ${sender.email}`);
      }
      return result;
    }

    lastError = result.error;
    if (!isSenderRelatedError(result.error)) {
      break;
    }
  }

  return { success: false, error: lastError };
};

const sendViaSmtpTransport = async (transporter, toEmail, otpCode, purpose, sender) => {
  const content = buildOtpEmailContent(otpCode, purpose);

  const info = await transporter.sendMail({
    from: `${sender.name} <${sender.email}>`,
    to: toEmail,
    replyTo: getReplyToEmail(),
    subject: content.subject,
    text: content.text,
    html: content.html,
  });

  return {
    success: true,
    provider: 'smtp',
    sender: sender.email,
    messageId: info.messageId || null,
  };
};

const sendViaBrevoSmtp = async (toEmail, otpCode, purpose) => {
  const transporter = getBrevoRelayTransporter();
  if (!transporter) {
    return { success: false, error: 'Brevo SMTP is not configured' };
  }

  const senders = getSenderCandidates();
  let lastError = 'Failed to send verification email';

  for (const sender of senders) {
    try {
      const result = await sendViaSmtpTransport(transporter, toEmail, otpCode, purpose, sender);
      console.log('[brevo-smtp] sent:', { to: toEmail, from: sender.email, messageId: result.messageId });
      return { ...result, provider: 'brevo-smtp' };
    } catch (error) {
      lastError = error.message || lastError;
      console.error('[brevo-smtp] failed:', sender.email, error.message);
      if (!isSenderRelatedError(lastError)) {
        break;
      }
    }
  }

  return { success: false, error: lastError };
};

const sendViaSmtp = async (toEmail, otpCode, purpose) => {
  const transporter = getTransporter();
  if (!transporter) {
    return { success: false, error: 'SMTP is not configured' };
  }

  try {
    return await sendViaSmtpTransport(transporter, toEmail, otpCode, purpose, getSender());
  } catch (error) {
    console.error('[smtp] send failed:', error.message);
    return { success: false, error: error.message || 'Failed to send verification email' };
  }
};

const sendOTPEmail = async (toEmail, otpCode, purpose = 'verification') => {
  const normalizedEmail = String(toEmail || '').trim().toLowerCase();

  if (!normalizedEmail) {
    return { success: false, error: 'Email is required' };
  }

  if (isBrevoConfigured()) {
    try {
      const result = await sendViaBrevo(normalizedEmail, otpCode, purpose);
      if (result.success) {
        return result;
      }

      if (isBrevoSmtpConfigured()) {
        console.warn('[email] Brevo API failed, trying Brevo SMTP relay:', result.error);
        const smtpResult = await sendViaBrevoSmtp(normalizedEmail, otpCode, purpose);
        if (smtpResult.success) {
          return smtpResult;
        }
      } else if (!isSmtpConfigured()) {
        return result;
      }

      console.warn('[email] Brevo API failed, falling back to SMTP:', result.error);
    } catch (error) {
      console.error('[brevo] exception:', error.message);
      if (!isBrevoSmtpConfigured() && !isSmtpConfigured()) {
        return { success: false, error: error.message || 'Failed to send verification email' };
      }
    }
  }

  if (isBrevoSmtpConfigured()) {
    const smtpResult = await sendViaBrevoSmtp(normalizedEmail, otpCode, purpose);
    if (smtpResult.success || !isSmtpConfigured()) {
      return smtpResult;
    }
  }

  if (isSmtpConfigured()) {
    return sendViaSmtp(normalizedEmail, otpCode, purpose);
  }

  console.warn(`[otp] No email provider configured. OTP for ${normalizedEmail}: ${otpCode}`);
  return { success: true, logged: true, provider: 'console' };
};

const sendPasswordResetEmail = async (toEmail, code) =>
  sendOTPEmail(toEmail, code, 'password_reset');

const sendRegistrationOtpEmail = async (toEmail, code) =>
  sendOTPEmail(toEmail, code, 'register');

module.exports = {
  isEmailConfigured,
  isBrevoConfigured,
  isSmtpConfigured,
  isBrevoSmtpConfigured,
  getEmailConfigStatus,
  getBrevoApiKey,
  getBrevoSenderEmail,
  getSenderCandidates,
  sendOTPEmail,
  sendPasswordResetEmail,
  sendRegistrationOtpEmail,
};
