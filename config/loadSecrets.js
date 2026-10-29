const fs = require("fs");
const path = require("path");

const getCandidatePaths = () => {
  const rootDir = path.join(__dirname, "..");
  const cwd = process.cwd();

  return [
    path.join(__dirname, "secrets.json"),
    path.join(rootDir, "secrets.json"),
    path.join(cwd, "config", "secrets.json"),
    path.join(cwd, "secrets.json"),
    path.join(rootDir, "config", "secrets.json"),
  ].filter((value, index, list) => list.indexOf(value) === index);
};

let loadResult = null;

const parseSecretsFile = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();

  if (!raw) {
    throw new Error("File is empty");
  }

  if (raw.startsWith("{")) {
    return JSON.parse(raw);
  }

  // Also allow KEY=value lines (like .env) inside secrets.json
  const data = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
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
    if (key) {
      data[key] = value;
    }
  }

  if (!Object.keys(data).length) {
    throw new Error("No valid KEY=value lines found");
  }

  return data;
};

const applySecrets = (data) => {
  const applied = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) {
      continue;
    }
    const next = String(value).trim().replace(/^['"]|['"]$/g, "");
    if (!next || next.includes("paste-your") || next.includes("your-brevo")) {
      continue;
    }
    process.env[key] = next;
    applied.push(key);
  }
  return applied;
};

const scanSecretsFiles = () => {
  const candidates = getCandidatePaths();
  const scanned = candidates.map((filePath) => {
    const exists = fs.existsSync(filePath);
    if (!exists) {
      return { filePath, exists: false };
    }

    try {
      const data = parseSecretsFile(filePath);
      const hasBrevo = Boolean(String(data.BREVO_API_KEY || "").trim());
      return {
        filePath,
        exists: true,
        valid: true,
        keys: Object.keys(data),
        hasBrevoKey: hasBrevo,
        brevoKeyLength: String(data.BREVO_API_KEY || "").trim().length,
      };
    } catch (error) {
      return {
        filePath,
        exists: true,
        valid: false,
        parseError: error.message,
      };
    }
  });

  return scanned;
};

const loadSecrets = (force = false) => {
  if (loadResult && !force) {
    return loadResult;
  }

  if (force) {
    loadResult = null;
  }

  const scanned = scanSecretsFiles();
  const validFiles = scanned.filter((item) => item.exists && item.valid);

  if (!validFiles.length) {
    const broken = scanned.find((item) => item.exists && !item.valid);
    loadResult = {
      found: Boolean(broken),
      loadedFrom: broken?.filePath || null,
      parseError: broken?.parseError || null,
      candidates: scanned,
    };
    return loadResult;
  }

  const chosen = validFiles[0];
  try {
    const data = parseSecretsFile(chosen.filePath);
    const applied = applySecrets(data);
    loadResult = {
      found: true,
      loadedFrom: chosen.filePath,
      keys: applied,
      candidates: scanned,
    };
  } catch (error) {
    loadResult = {
      found: true,
      loadedFrom: chosen.filePath,
      parseError: error.message,
      candidates: scanned,
    };
  }

  return loadResult;
};

const getSecretsDiagnostics = () => {
  loadSecrets(true);
  const scanned = scanSecretsFiles();
  const brevoKey = String(process.env.BREVO_API_KEY || "").trim();
  return {
    scanned,
    recommendedPath: path.join(__dirname, "secrets.json"),
    brevoKeyLength: brevoKey.length,
    senderEmail: process.env.BREVO_SENDER_EMAIL || null,
  };
};

module.exports = {
  loadSecrets,
  getSecretsDiagnostics,
  secretsPath: path.join(__dirname, "secrets.json"),
};
