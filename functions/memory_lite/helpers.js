// functions/memory_lite/helpers.js

const admin = require("firebase-admin");
const {
  STARTING_SCORE,
  REINFORCEMENT_BOOST,
} = require("./config");
const { MEMORY_STATUS } = require("./types");

if (!admin.apps.length) {
  admin.initializeApp();
}

function getDb() {
  return admin.firestore();
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function sanitizeKey(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildMemoryId(type, key) {
  return `${sanitizeKey(type)}_${sanitizeKey(key)}`;
}

function userDoc(userId) {
  return getDb().collection("users").doc(userId);
}

function memoryCollection(userId) {
  return userDoc(userId).collection("memory");
}

function memoryDoc(userId, memoryId) {
  return memoryCollection(userId).doc(memoryId);
}

function conversationStateDoc(userId) {
  return userDoc(userId).collection("conversation_state").doc("current");
}

function memoryMetaDoc(userId) {
  return userDoc(userId).collection("memory_meta").doc("main");
}

async function ensureUserBase(userId, timezone = "Asia/Manila") {
  const ref = userDoc(userId);
  await ref.set(
    {
      timezone,
      memoryEnabled: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function upsertMemory(userId, candidate) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const id = buildMemoryId(candidate.type, candidate.key);
  const ref = memoryDoc(userId, id);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      type: candidate.type,
      key: candidate.key,
      value: candidate.value,
      source: candidate.source,
      tier: candidate.tier,
      confidence: candidate.confidence,
      importance: candidate.importance,
      retentionScore: STARTING_SCORE[candidate.tier] || 40,
      reinforcementCount: 0,
      tags: candidate.tags || [],
      status: MEMORY_STATUS.ACTIVE,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      lastReinforcedAt: now,
    });
    return { id, created: true };
  }

  const existing = snap.data() || {};
  const nextScore = clamp(
    Number(existing.retentionScore || 0) + REINFORCEMENT_BOOST.explicit_repeat
  );

  await ref.set(
    {
      value: candidate.value,
      source: candidate.source,
      tier: candidate.tier,
      confidence: Math.max(Number(existing.confidence || 0), Number(candidate.confidence || 0)),
      importance: Math.max(Number(existing.importance || 0), Number(candidate.importance || 0)),
      tags: Array.from(new Set([...(existing.tags || []), ...(candidate.tags || [])])),
      retentionScore: nextScore,
      reinforcementCount: Number(existing.reinforcementCount || 0) + 1,
      status: MEMORY_STATUS.ACTIVE,
      updatedAt: now,
      lastUsedAt: now,
      lastReinforcedAt: now,
    },
    { merge: true }
  );

  return { id, created: false };
}

async function getActiveMemories(userId) {
  const snap = await memoryCollection(userId)
    .where("status", "==", MEMORY_STATUS.ACTIVE)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

async function markMemoryUsed(userId, memoryId) {
  await memoryDoc(userId, memoryId).set(
    {
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

module.exports = {
  getDb,
  clamp,
  sanitizeKey,
  buildMemoryId,
  userDoc,
  memoryCollection,
  memoryDoc,
  conversationStateDoc,
  memoryMetaDoc,
  ensureUserBase,
  upsertMemory,
  getActiveMemories,
  markMemoryUsed,
};