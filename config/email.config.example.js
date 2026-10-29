/**
 * Copy this file to email.config.js in the SAME folder (config/)
 * and paste your real Brevo API key. Then restart the Node app.
 *
 * Path on server:
 * /home/u138716735/domains/apps.freebusinessgip.com/nodejs/config/email.config.js
 *
 * IMPORTANT FOR INBOX DELIVERY:
 * 1. Use noreply@freebusinessgip.com (NOT Gmail/Yahoo personal email)
 * 2. In Brevo: Domains -> authenticate freebusinessgip.com (SPF + DKIM + DMARC)
 * 3. In Brevo: Senders -> verify noreply@freebusinessgip.com
 * 4. Optional SMTP relay (often better deliverability):
 *    Brevo -> SMTP & API -> copy SMTP login + SMTP key (xsmtpsib-...)
 */
module.exports = {
  BREVO_API_KEY: "xkeysib-paste-your-brevo-api-key-here",
  BREVO_SENDER_EMAIL: "noreply@freebusinessgip.com",
  BREVO_REPLY_TO: "support@freebusinessgip.com",
  BREVO_SMTP_LOGIN: "",
  BREVO_SMTP_KEY: "",
  APP_NAME: "Free Business",
};
