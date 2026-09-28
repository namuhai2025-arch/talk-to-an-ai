"use strict";

const admin = require("firebase-admin");
const { db } = require("../../lib/firebase");

function reflectionCollection(uid) {
  return db.collection("users").doc(uid).collection("weekly_reflections");
}

function messageCollection(uid) {
  return db.collection("users").doc(uid).collection("conversation_messages");
}

async function saveConversationTurn({
  uid,
  userMessage,
  assistantMessage,
  source = "chat",
  language = "",
  safety = null,
}) {
  if (!uid || !userMessage) return;

  const batch = db.batch();
  const collection = messageCollection(uid);
  const now = admin.firestore.Timestamp.now();

  const userRef = collection.doc();
  batch.set(userRef, {
    role: "user",
    content: String(userMessage).trim().slice(0, 12000),
    source: String(source || "chat").slice(0, 40),
    language: String(language || "").slice(0, 40),
    createdAt: now,
  });

  if (assistantMessage) {
    const assistantRef = collection.doc();
    batch.set(assistantRef, {
      role: "assistant",
      content: String(assistantMessage).trim().slice(0, 12000),
      source: String(source || "chat").slice(0, 40),
      language: String(language || "").slice(0, 40),
      safety: safety && typeof safety === "object"
        ? {
            riskLevel: String(safety.riskLevel || "none").slice(0, 30),
            category: String(safety.category || "none").slice(0, 40),
          }
        : null,
      createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + 1),
    });
  }

  await batch.commit();
}

async function loadMessagesForPeriod({ uid, startUtc, endUtc, limit = 1000 }) {
  const snapshot = await messageCollection(uid)
    .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(startUtc))
    .where("createdAt", "<", admin.firestore.Timestamp.fromDate(endUtc))
    .orderBy("createdAt", "asc")
    .limit(Math.max(1, Math.min(limit, 2000)))
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function getWeeklyReflection(uid, reflectionId) {
  const snapshot = await reflectionCollection(uid).doc(reflectionId).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function saveWeeklyReflection({ uid, reflectionId, data }) {
  await reflectionCollection(uid).doc(reflectionId).set(
    {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt:
        data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function listWeeklyReflections(uid, limit = 12) {
  const snapshot = await reflectionCollection(uid)
    .orderBy("periodStart", "desc")
    .limit(Math.max(1, Math.min(limit, 52)))
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

module.exports = {
  saveConversationTurn,
  loadMessagesForPeriod,
  getWeeklyReflection,
  saveWeeklyReflection,
  listWeeklyReflections,
};