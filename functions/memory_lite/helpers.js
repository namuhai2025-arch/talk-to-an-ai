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

async function loadEmotionalMemory(uid, limit = 5) {
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("memory")
    .doc("emotional_root")
    .collection("items")
    .orderBy("lastSeenAt", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function buildMemoryPromptBlock({ people = [], style = [], emotional = [] }) {
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

  if (emotional.length) {
  lines.push("");
  lines.push("EMOTIONAL CONTINUITY MEMORY:");
  for (const item of emotional) {
    lines.push(`- ${item.label || item.type}: ${item.value}`);
  }
}

  if (!lines.length) return "";

  lines.push("");
  lines.push("Use memory only when emotionally relevant.");
  lines.push("Do not randomly bring up memories.");
  lines.push("Use memories to improve emotional understanding, continuity, and emotional protection.");
  lines.push("If the user is blaming themselves unfairly, gently separate the event from their identity.");
  lines.push("If emotional patterns repeat across conversations, acknowledge the pattern naturally.");
  lines.push("If environmental stress appears connected to the user's emotional state, recognize the connection carefully without sounding clinical.");
  lines.push("Do not over-reference memory.");
  lines.push("Do not sound robotic or analytical.");
  lines.push("Do not use playful style in crisis, grief, panic, shame, humiliation, or emotional breakdown moments.");
 

  return lines.join("\n");
}

module.exports = {
  loadRelationalMemory,
  loadStyleMemory,
  loadEmotionalMemory,
  buildMemoryPromptBlock,
};