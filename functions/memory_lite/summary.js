// functions/memory/summary.js

const admin = require("firebase-admin");
const { conversationStateDoc } = require("./helpers");
const { MAX_SUMMARY_CHARS } = require("./config");

async function getConversationSummary(userId) {
  const snap = await conversationStateDoc(userId).get();
  if (!snap.exists) return "";
  return String((snap.data() || {}).summary || "");
}

async function setConversationSummary(userId, summary) {
  const clean = String(summary || "").trim().slice(0, MAX_SUMMARY_CHARS);

  await conversationStateDoc(userId).set(
    {
      summary: clean,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      version: 1,
    },
    { merge: true }
  );
}

function buildSimpleRollingSummary({ previousSummary, userMessage, assistantReply }) {
  const parts = [];
  if (previousSummary) parts.push(String(previousSummary).trim());
  parts.push(`User: ${String(userMessage || "").trim()}`);
  parts.push(`Talkio: ${String(assistantReply || "").trim()}`);

  const joined = parts.join(" ");
  return joined.length > MAX_SUMMARY_CHARS
    ? joined.slice(joined.length - MAX_SUMMARY_CHARS)
    : joined;
}

module.exports = {
  getConversationSummary,
  setConversationSummary,
  buildSimpleRollingSummary,
};