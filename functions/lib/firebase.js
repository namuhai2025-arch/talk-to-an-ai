const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Optional: settings for performance
db.settings({
  ignoreUndefinedProperties: true,
});

module.exports = { admin, db };