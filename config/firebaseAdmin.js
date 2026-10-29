const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

let firebaseApp = null;

const loadServiceAccountFromFile = () => {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!filePath) {
    return null;
  }
  try {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
    const raw = fs.readFileSync(resolved, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("Invalid FIREBASE_SERVICE_ACCOUNT_PATH:", error.message);
    return null;
  }
};

const parseServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return loadServiceAccountFromFile();
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON:", error.message);
    return loadServiceAccountFromFile();
  }
};

const isFirebaseAdminConfigured = () => Boolean(parseServiceAccount());

const getFirebaseAdmin = () => {
  if (firebaseApp) {
    return admin;
  }

  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) {
    return null;
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin;
};

const verifyFirebaseIdToken = async (idToken) => {
  const sdk = getFirebaseAdmin();
  if (!sdk) {
    throw new Error("Firebase Admin is not configured");
  }
  return sdk.auth().verifyIdToken(idToken);
};

module.exports = {
  getFirebaseAdmin,
  verifyFirebaseIdToken,
  isFirebaseAdminConfigured,
};
