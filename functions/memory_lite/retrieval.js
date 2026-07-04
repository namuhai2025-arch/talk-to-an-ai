// functions/memory/retrieval.js

const { getActiveMemories } = require("./helpers");
const { MAX_RETRIEVED_MEMORY_ITEMS } = require("./config");

function normalize(s) {
  return String(s || "").toLowerCase();
}

function scoreMemory(memory, message) {
  const msg = normalize(message);
  let score = 0;

  const value = normalize(memory.value);
  const key = normalize(memory.key);
  const tags = Array.isArray(memory.tags) ? memory.tags.map(normalize) : [];

  const messageWords = msg.split(/\s+/).filter(Boolean);

  for (const word of messageWords) {
    if (word.length < 3) continue;
    if (value.includes(word)) score += 2;
    if (key.includes(word)) score += 2;
    if (tags.some((t) => t.includes(word))) score += 3;
  }

  score += Math.round(Number(memory.retentionScore || 0) / 20);

  if (memory.tier === "core") score += 2;
  if (memory.type === "person" && (msg.includes("girlfriend") || msg.includes("friend") || msg.includes("coworker") || msg.includes("family"))) {
    score += 4;
  }
  if (memory.type === "goal" && (msg.includes("goal") || msg.includes("plan") || msg.includes("help me"))) {
    score += 3;
  }

  return score;
}

async function getRelevantMemory(userId, message, limit = MAX_RETRIEVED_MEMORY_ITEMS) {
  const memories = await getActiveMemories(userId);

  return memories
    .map((m) => ({ ...m, _score: scoreMemory(m, message) }))
    .filter((m) => m._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

function formatMemoryForPrompt(memories, summary) {
  const lines = [];

  if (memories && memories.length) {
  lines.push("Relevant user memory:");

  for (const m of memories) {
    lines.push(`- ${m.type}: ${m.value}`);
  }
}

  if (summary && String(summary).trim()) {
    lines.push("");
    lines.push("Recent conversation context:");
    lines.push(String(summary).trim());
  }

  return lines.join("\n");
}

module.exports = {
  getRelevantMemory,
  formatMemoryForPrompt,
};