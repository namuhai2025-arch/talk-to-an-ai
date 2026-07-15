"use strict";

const admin = require("firebase-admin");
const {
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const {
  getFirestore,
} = require("firebase-admin/firestore");

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

db.settings({
  ignoreUndefinedProperties: true,
});

module.exports = {
  admin,
  db,
};