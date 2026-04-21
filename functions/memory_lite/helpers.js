"use strict";

const { db } = require("../lib/firebase");

async function loadRelationalMemory(uid, limit = 5) {
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("memory")
    .doc("people_root")
    .collection("items")
    .orderBy("mentionCount", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function loadStyleMemory(uid, limit = 5) {
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("memory")
    .doc("style_root")
    .collection("items")
    .where("safeToMirror", "==", true)
    .limit(limit)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function buildMemoryPromptBlock({ people = [], style = [] }) {
  const lines = [];

  if (people.length) {
    lines.push("RELATIONAL MEMORY:");
    for (const person of people) {
      const role = person.role || "person";
      const name = person.name ? ` (${person.name})` : "";
      lines.push(`- ${role}${name}`);
    }
  }

  if (style.length) {
    lines.push("");
    lines.push("STYLE MEMORY:");
    for (const expr of style) {
      lines.push(`- ${expr.text}`);
    }
  }

  if (!lines.length) return "";

  lines.push("");
  lines.push("Use memory only when relevant.");
  lines.push("Do not force references.");
  lines.push("Use familiar expressions lightly and naturally.");
  lines.push("Do not use playful style in crisis, grief, panic, or heavy emotional moments.");

  return lines.join("\n");
}

module.exports = {
  loadRelationalMemory,
  loadStyleMemory,
  buildMemoryPromptBlock,
};