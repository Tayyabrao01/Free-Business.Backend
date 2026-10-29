#!/usr/bin/env node
/**
 * Run on Hostinger SSH to verify email env vars load correctly:
 *   cd /path/to/backend && node scripts/check-env.js
 */
const path = require("path");
const { loadEnv } = require("../config/loadEnv");
const { loadSecrets } = require("../config/loadSecrets");
const { getEmailConfigStatus, getBrevoApiKey, getBrevoSenderEmail } = require("../services/emailService");

const result = loadEnv();
const secretsResult = loadSecrets();

console.log("=== Free Business email env check ===");
console.log("Node cwd:", process.cwd());
console.log("Script dir:", __dirname);
console.log("Loaded .env from:", result.loadedFrom || "NONE");
console.log("secrets.json:", secretsResult.found ? secretsResult.loadedFrom : "NOT FOUND");
console.log("Existing .env paths:", result.existingPaths.length ? result.existingPaths : "none found");
console.log("Candidates checked:", result.candidates);
console.log("");
console.log("BREVO_API_KEY length:", getBrevoApiKey().length, "(should be > 20)");
console.log("BREVO_SENDER_EMAIL:", getBrevoSenderEmail() || "(not set)");
console.log("Status:", getEmailConfigStatus());
console.log("");
if (!getBrevoApiKey()) {
  console.log("FIX: Create backend/config/secrets.json on the server with:");
  console.log('  { "BREVO_API_KEY": "xkeysib-...", "BREVO_SENDER_EMAIL": "noreply@freebusinessgip.com" }');
  console.log("Or add BREVO_API_KEY to .env, then redeploy.");
  process.exit(1);
}
console.log("OK — Brevo key is loaded.");
process.exit(0);
