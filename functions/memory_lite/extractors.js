"use strict";

const { PERSON_ROLES, SAFE_STYLE_EXPRESSIONS } = require("./config");

function normalizeText(text = "") {
  return String(text || "").trim();
}

function extractPeopleFromMessage(message = "") {
  const text = normalizeText(message);
  const lower = text.toLowerCase();

  const found = [];

  for (const role of PERSON_ROLES) {
    if (lower.includes(role)) {
      found.push({
        role,
        alias: role,
        confidence: 0.75,
      });
    }
  }

  const namedBossMatch = text.match(/\b(?:my\s+)?(boss|manager|friend|coworker|girlfriend|boyfriend|wife|husband)\s+([A-Z][a-z]+)\b/);
  if (namedBossMatch) {
    found.push({
      role: namedBossMatch[1].toLowerCase(),
      name: namedBossMatch[2],
      alias: `my ${namedBossMatch[1].toLowerCase()}`,
      confidence: 0.9,
    });
  }

  return dedupePeople(found);
}

function dedupePeople(items = []) {
  const seen = new Map();

  for (const item of items) {
    const key = `${item.role || ""}:${(item.name || "").toLowerCase()}:${item.alias || ""}`;
    if (!seen.has(key)) seen.set(key, item);
  }

  return Array.from(seen.values());
}

function extractStyleExpressions(message = "") {
  const lower = normalizeText(message).toLowerCase();
  const found = [];

  for (const expr of SAFE_STYLE_EXPRESSIONS) {
    if (lower.includes(expr)) {
      found.push({
        text: expr,
        normalized: expr,
        confidence: 0.8,
        safeToMirror: true,
      });
    }
  }

  return found;
}

module.exports = {
  extractPeopleFromMessage,
  extractStyleExpressions,
};