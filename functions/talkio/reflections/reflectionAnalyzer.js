"use strict";

const MAX_MESSAGE_CHARS = 1000;   // Reduced slightly to keep tokens tight
const MAX_TOTAL_CHARS = 18000;    // The "Sweet Spot" for cost/quality
const MIN_USER_MESSAGES = 6;      // Don't waste money on 3-message weeks
const MIN_USER_CHARS = 450;       // Ensure there's enough content to reflect on

function normalizeMessage(raw = {}) {
  const role = raw.role === "assistant" ? "assistant" : raw.role === "user" ? "user" : "";
  // Token Efficiency: replace(/\s+/g, " ") is great, it saves tokens!
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

  // ELIGIBILITY CHECK: Prevents wasting money on empty weeks
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

  // EFFECTIVENESS FIX: Work BACKWARDS from the end of the week 
  // to ensure the most recent context is included.
  const selected = [];
  let totalChars = 0;

  // We reverse, add messages until full, then reverse back to chronological
  const reversedNormalized = [...normalized].reverse();

  for (const message of reversedNormalized) {
    const line = `${message.role === "user" ? "USER" : "TALKIO"}: ${message.content}`;
    
    if (totalChars + line.length > MAX_TOTAL_CHARS) {
      break; // Stop if we exceed our budget
    }
    
    selected.push(line);
    totalChars += line.length + 1;
  }

  return {
    eligible: true,
    reason: "ready",
    messageCount: normalized.length,
    userMessageCount: userMessages.length,
    userCharacterCount,
    // Return them in the correct order for the AI
    conversationText: selected.reverse().join("\n"),
  };
}

module.exports = {
  prepareWeeklyConversation,
  MIN_USER_MESSAGES,
  MIN_USER_CHARS,
};