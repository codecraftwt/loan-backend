// /config/firebaseConfig.js

const admin = require("firebase-admin");
const path = require("path");
require("dotenv").config();

// const serviceAccount = path.resolve(__dirname, "firebase-admin-sdk.json");

// Decode the base64 string from the environment variable
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, "base64").toString(
    "utf-8"
  )
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const messaging = admin.messaging();

module.exports = messaging;
