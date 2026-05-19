"use strict";

const admin = require("firebase-admin");
const { db } = require("../lib/firebase");

function personDocId(person = {}) {
  const role = String(person.role || "unknown").toLowerCase().replace(/\s+/g, "_");
  const name = String(person.name || "").toLowerCase().replace(/\s+/g, "_");
  return name ? `${role}__${name}` : role;
}

function emotionalDocId(item = {}) {
  return String(item.key || item.type || item.label || "emotional_pattern")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

async function upsertPeopleMemory(uid, people = []) {
  if (!uid || !Array.isArray(people) || people.length === 0) return;

  const batch = db.batch();

  for (const person of people) {
    const ref = db
      .collection("users")
      .doc(uid)
      .collection("memory")
      .doc("people_root") // optional anchor doc
      .collection("items")
      .doc(personDocId(person));

    batch.set(
      ref,
      {
        role: person.role || "",
        name: person.name || "",
        aliases: person.alias ? admin.firestore.FieldValue.arrayUnion(person.alias) : [],
        mentionCount: admin.firestore.FieldValue.increment(1),
        confidence: person.confidence || 0.7,
        safeToReference: true,
        lastMentionedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
}

async function upsertStyleMemory(uid, expressions = []) {
  if (!uid || !Array.isArray(expressions) || expressions.length === 0) return;

  const batch = db.batch();

  for (const expr of expressions) {
    const id = String(expr.normalized || expr.text || "")
      .toLowerCase()
      .replace(/\s+/g, "_");

    if (!id) continue;

    const ref = db
      .collection("users")
      .doc(uid)
      .collection("memory")
      .doc("style_root")
      .collection("items")
      .doc(id);

    batch.set(
      ref,
      {
        text: expr.text,
        normalized: expr.normalized,
        usageCount: admin.firestore.FieldValue.increment(1),
        confidence: expr.confidence || 0.7,
        safeToMirror: !!expr.safeToMirror,
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
}

async function upsertEmotionalMemory(uid, memories = []) {
  if (!uid || !Array.isArray(memories) || memories.length === 0) return;

  const batch = db.batch();

  for (const memory of memories) {
    const id = String(
      memory.key ||
      memory.label ||
      memory.type ||
      memory.value ||
      ""
    )
      .toLowerCase()
      .replace(/\s+/g, "_")
      .slice(0, 80);

    if (!id) continue;

    const ref = db
      .collection("users")
      .doc(uid)
      .collection("memory")
      .doc("emotional_root")
      .collection("items")
      .doc(id);

    batch.set(
      ref,
      {
        type: memory.type || "emotional_pattern",
        value: memory.value || "",
        confidence: memory.confidence || 0.75,
        mentionCount: admin.firestore.FieldValue.increment(1),
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
}

async function upsertEmotionalMemory(uid, memories = []) {
  if (!uid || !Array.isArray(memories) || memories.length === 0) return;

  const batch = db.batch();

  for (const item of memories) {
    const id = emotionalDocId(item);
    if (!id) continue;

    const ref = db
      .collection("users")
      .doc(uid)
      .collection("memory")
      .doc("emotional_root")
      .collection("items")
      .doc(id);

    batch.set(
      ref,
      {
        type: item.type || "emotional_pattern",
        key: item.key || id,
        label: item.label || "",
        value: item.value || "",
        tags: Array.isArray(item.tags) ? item.tags : [],
        mentionCount: admin.firestore.FieldValue.increment(1),
        confidence: item.confidence || 0.7,
        safeToReference: item.safeToReference !== false,
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
}

module.exports = {
  upsertPeopleMemory,
  upsertStyleMemory,
  upsertEmotionalMemory,
};