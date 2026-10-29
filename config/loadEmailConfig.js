const fs = require("fs");
const path = require("path");

const EMAIL_KEYS = [
  "BREVO_API_KEY",
  "SENDINBLUE_API_KEY",
  "BREVO_SENDER_EMAIL",
  "BREVO_TRANSACTIONAL_SENDER",
  "BREVO_REPLY_TO",
  "BREVO_SMTP_LOGIN",
  "BREVO_SMTP_KEY",
  "BREVO_SMTP_PORT",
  "SMTP_FROM",
  "APP_NAME",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_PORT",
  "SMTP_SECURE",
];

const isPlaceholder = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  return (
    text.includes("paste-your") ||
    text.includes("your-brevo") ||
    text.includes("your_real") ||
    text === "change_me"
  );
};

const applyEntry = (key, value, source) => {
  if (!key || value === undefined || value === null) {
    return false;
  }
  const next = String(value).trim().replace(/^['"]|['"]$/g, "");
  if (!next || isPlaceholder(next)) {
    return false;
  }
  process.env[key] = next;
  return { key, source };
};

const parseKeyValueText = (content) => {
  const entries = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^\uFEFF/, "");
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }
    if (trimmed.startsWith("{")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries.push([key, value]);
  }
  return entries;
};

const parseJsonObject = (content) => {
  const trimmed = content.trim().replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("{")) {
    return null;
  }
  return JSON.parse(trimmed);
};

const getRootDir = () => path.join(__dirname, "..");

const getCandidateFiles = () => {
  const rootDir = getRootDir();
  const cwd = process.cwd();
  return [
    path.join(__dirname, "email.config.js"),
    path.join(rootDir, "email.config.js"),
    path.join(rootDir, "secrets.json"),
    path.join(rootDir, "config", "secrets.json"),
    path.join(cwd, "secrets.json"),
    path.join(cwd, "config", "secrets.json"),
    path.join(rootDir, ".env"),
    path.join(cwd, ".env"),
  ].filter((value, index, list) => list.indexOf(value) === index);
};

const loadEmailConfig = () => {
  const applied = [];
  const scanned = [];

  for (const filePath of getCandidateFiles()) {
    const item = { filePath, exists: fs.existsSync(filePath) };
    if (!item.exists) {
      scanned.push(item);
      continue;
    }

    try {
      if (filePath.endsWith("email.config.js")) {
        delete require.cache[require.resolve(filePath)];
        const config = require(filePath);
        for (const [key, value] of Object.entries(config || {})) {
          const result = applyEntry(key, value, filePath);
          if (result) applied.push(result);
        }
        item.valid = true;
        item.type = "js";
        item.keys = Object.keys(config || {});
      } else {
        const raw = fs.readFileSync(filePath, "utf8");
        let data = null;
        try {
          data = parseJsonObject(raw);
        } catch (jsonError) {
          data = null;
        }

        if (data && typeof data === "object") {
          for (const [key, value] of Object.entries(data)) {
            const result = applyEntry(key, value, filePath);
            if (result) applied.push(result);
          }
          item.valid = true;
          item.type = "json";
          item.keys = Object.keys(data);
        } else {
          const pairs = parseKeyValueText(raw);
          for (const [key, value] of pairs) {
            const result = applyEntry(key, value, filePath);
            if (result) applied.push(result);
          }
          item.valid = pairs.length > 0;
          item.type = "env";
          item.keys = pairs.map(([key]) => key);
          if (!item.valid) {
            item.parseError = "No KEY=value lines found";
          }
        }
      }
    } catch (error) {
      item.valid = false;
      item.parseError = error.message;
    }

    scanned.push(item);
  }

  const brevoKey = String(process.env.BREVO_API_KEY || "").trim();
  const sender = String(process.env.BREVO_SENDER_EMAIL || process.env.SMTP_FROM || "").trim();

  return {
    applied,
    scanned,
    brevoKeyLength: brevoKey.length,
    senderEmail: sender || null,
    ready: brevoKey.length > 20,
    recommendedFile: path.join(__dirname, "email.config.js"),
  };
};

module.exports = { loadEmailConfig, EMAIL_KEYS };
