// functions/memory_lite/commands.js

const admin = require("firebase-admin");
const { memoryCollection } = require("./helpers");

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function detectMemoryCommand(message) {
  const text = normalize(message);

  if (
    text === "what do you remember about me" ||
    text.includes("what do you remember about me") ||
    text.includes("what do you know about me")
  ) {
    return { type: "view_memory" };
  }

  if (text.startsWith("forget ")) {
    return {
      type: "forget_memory",
      target: text.replace(/^forget\s+/, "").trim(),
    };
  }

  if (
    text.includes("don't save this") ||
    text.includes("do not save this") ||
    text.includes("dont save this")
  ) {
    return { type: "do_not_save" };
  }

  if (
    text === "clear my memory" ||
    text.includes("delete my memory") ||
    text.includes("erase my memory")
  ) {
    return { type: "clear_memory" };
  }

  return null;
}

async function getUserMemorySummary(userId) {
  const snap = await memoryCollection(userId)
    .where("status", "==", "active")
    .get();

  const items = snap.docs.map((doc) => doc.data());

  if (!items.length) {
    return "I’m not holding onto any important memory about you yet.";
  }

  const grouped = {
    people: [],
    preferences: [],
    goals: [],
    routines: [],
    other: [],
  };

  for (const item of items) {
    if (item.type === "person") grouped.people.push(item.value);
    else if (item.type === "preference") grouped.preferences.push(item.value);
    else if (item.type === "goal") grouped.goals.push(item.value);
    else if (item.type === "routine") grouped.routines.push(item.value);
    else grouped.other.push(item.value);
  }

  const lines = [];

  if (grouped.people.length) {
    lines.push("People I remember:");
    grouped.people.slice(0, 8).forEach((v) => lines.push(`- ${v}`));
  }

  if (grouped.preferences.length) {
    lines.push("");
    lines.push("Preferences:");
    grouped.preferences.slice(0, 8).forEach((v) => lines.push(`- ${v}`));
  }

  if (grouped.goals.length) {
    lines.push("");
    lines.push("Goals:");
    grouped.goals.slice(0, 8).forEach((v) => lines.push(`- ${v}`));
  }

  if (grouped.routines.length) {
    lines.push("");
    lines.push("Routines:");
    grouped.routines.slice(0, 8).forEach((v) => lines.push(`- ${v}`));
  }

  if (grouped.other.length) {
    lines.push("");
    lines.push("Other important context:");
    grouped.other.slice(0, 8).forEach((v) => lines.push(`- ${v}`));
  }

  return lines.join("\n").trim();
}

async function forgetMatchingMemory(userId, target) {
  const snap = await memoryCollection(userId)
    .where("status", "==", "active")
    .get();

  const normalizedTarget = normalize(target);
  const docs = snap.docs.filter((doc) => {
    const data = doc.data() || {};
    const key = normalize(data.key);
    const value = normalize(data.value);
    const tags = Array.isArray(data.tags) ? data.tags.map(normalize) : [];

    return (
      key.includes(normalizedTarget) ||
      value.includes(normalizedTarget) ||
      tags.some((t) => t.includes(normalizedTarget))
    );
  });

  if (!docs.length) {
    return { found: false, count: 0 };
  }

  const batch = admin.firestore().batch();

  docs.forEach((doc) => {
    batch.set(
      doc.ref,
      {
        status: "archived",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  await batch.commit();

  return { found: true, count: docs.length };
}

async function clearAllMemory(userId) {
  const snap = await memoryCollection(userId)
    .where("status", "==", "active")
    .get();

  if (!snap.docs.length) {
    return 0;
  }

  const batch = admin.firestore().batch();

  snap.docs.forEach((doc) => {
    batch.set(
      doc.ref,
      {
        status: "archived",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  await batch.commit();
  return snap.docs.length;
}

module.exports = {
  detectMemoryCommand,
  getUserMemorySummary,
  forgetMatchingMemory,
  clearAllMemory,
};