"use strict";

const admin = require("firebase-admin");

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
  console.log("📊 Writing Talkio log...");

  const doc = {
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    userMessage: safeString(latestUserMessage, 200),
    draftReply: safeString(draftReply, 300),
    finalReply: safeString(finalReply, 300),
    scoreBefore: scoreBefore?.total || 0,
    scoreAfter: scoreAfter?.total || 0,
    rewriteUsed: Boolean(rewriteUsed),
    rewriteType: rewriteType || null,
    reasons: Array.isArray(reasons) ? reasons : [],
    userState: {
      intent: userState?.intent || "unknown",
      energy: userState?.energy || "unknown",
      intensity: userState?.intensity || "unknown",
      asksWhatToDo: Boolean(userState?.asksWhatToDo),
      overwhelmed: Boolean(userState?.overwhelmed),
      shortInput: Boolean(userState?.shortInput),
      lowEnergy: Boolean(userState?.lowEnergy),
      source: userState?.source || "unknown",
      escalatedToModel: Boolean(userState?.escalatedToModel),
      confidence:
        typeof userState?.confidence === "number" ? userState.confidence : null,
    },
  };

  await db.collection("talkio_logs").add(doc);

  console.log("✅ Talkio log written");
}

module.exports = {
  logTalkioEvent,
};