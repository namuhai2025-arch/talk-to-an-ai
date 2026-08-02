"use strict";

const MAX_MESSAGE_CHARS = 1200;
const MAX_TOTAL_CHARS = 28000;
const MIN_USER_MESSAGES = 3;
const MIN_USER_CHARS = 180;

function normalizeMessage(raw = {}) {
  const role = raw.role === "assistant" ? "assistant" : raw.role === "user" ? "user" : "";
  const content = typeof raw.content === "string" ? raw.content.replace(/\s+/g, " ").trim() : "";

  if (!role || !content) return null;

  return {
    role,
    content: content.slice(0, MAX_MESSAGE_CHARS),
    createdAt: raw.createdAt || null,
  };
}

function prepareWeeklyConversation(messages = []) {
  const normalized = (Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter(Boolean);

  const userMessages = normalized.filter((message) => message.role === "user");
  const userCharacterCount = userMessages.reduce(
    (total, message) => total + message.content.length,
    0
  );

  if (
    userMessages.length < MIN_USER_MESSAGES ||
    userCharacterCount < MIN_USER_CHARS
  ) {
    return {
      eligible: false,
      reason: "insufficient_activity",
      messageCount: normalized.length,
      userMessageCount: userMessages.length,
      userCharacterCount,
      conversationText: "",
    };
  }

  // Keep chronological context while limiting cost and accidental overexposure.
  const selected = [];
  let totalChars = 0;

  for (const message of normalized) {
    const line = `${message.role === "user" ? "USER" : "TALKIO"}: ${message.content}`;
    if (totalChars + line.length > MAX_TOTAL_CHARS) break;
    selected.push(line);
    totalChars += line.length + 1;
  }

  return {
    eligible: true,
    reason: "ready",
    messageCount: normalized.length,
    userMessageCount: userMessages.length,
    userCharacterCount,
    conversationText: selected.join("\n"),
  };
}

module.exports = {
  prepareWeeklyConversation,
  MIN_USER_MESSAGES,
  MIN_USER_CHARS,
};