const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const parseEnvFile = (content) => {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
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
    if (!key) {
      continue;
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
};

const loadEnv = () => {
  const rootDir = path.join(__dirname, "..");
  const candidates = [
    path.join(rootDir, ".env"),
    path.join(process.cwd(), ".env"),
    path.join(rootDir, "..", ".env"),
  ];

  const existingPaths = candidates.filter((candidate) => fs.existsSync(candidate));
  let loadedFrom = null;

  for (const envPath of existingPaths) {
    dotenv.config({ path: envPath, override: true, quiet: true });
    try {
      parseEnvFile(fs.readFileSync(envPath, "utf8"));
    } catch (error) {
      console.warn(`Could not parse ${envPath}:`, error.message);
    }
    loadedFrom = envPath;
    break;
  }

  if (!loadedFrom) {
    dotenv.config({ quiet: true });
  }

  return {
    loadedFrom,
    candidates,
    existingPaths,
  };
};

module.exports = { loadEnv, parseEnvFile };
