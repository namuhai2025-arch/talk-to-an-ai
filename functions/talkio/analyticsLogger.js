"use strict";

/**
 * Talkio Analytics Logger
 * -----------------------
 * Writes lightweight logs to Firestore for tuning and debugging.
 */

const admin = require("firebase-admin");

// Ensure initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function safeString(text = "", maxLen = 300) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

async function logTalkioEvent({
  latestUserMessage,
  draftReply,
  finalReply,
  scoreBefore,
  scoreAfter,
  rewriteUsed,
  rewriteType,
  reasons,
  userState,
}) {
  try {
    const doc = {
      timestamp: admin.firestore.FieldValue.serverTimestamp(),

      // Input
      userMessage: safeString(latestUserMessage, 200),

      // Replies
      draftReply: safeString(draftReply, 300),
      finalReply: safeString(finalReply, 300),

      // Scores
      scoreBefore: scoreBefore?.total || 0,
      scoreAfter: scoreAfter?.total || 0,

      // Rewrite info
      rewriteUsed: Boolean(rewriteUsed),
      rewriteType: rewriteType || null,
      reasons: reasons || [],

      // Smart Hybrid insights
      userState: {
        intent: userState?.intent || "unknown",
        energy: userState?.energy || "unknown",
        intensity: userState?.intensity || "unknown",
        asksWhatToDo: Boolean(userState?.asksWhatToDo),
        overwhelmed: Boolean(userState?.overwhelmed),
        shortInput: Boolean(userState?.shortInput),
        source: userState?.source || "unknown",
        escalatedToModel: Boolean(userState?.escalatedToModel),
        confidence: userState?.confidence ?? null,
      },
    };

    await db.collection("talkio_logs").add(doc);
  } catch (err) {
    console.error("Talkio analytics log failed:", err.message);
  }
}

module.exports = {
  logTalkioEvent,
};