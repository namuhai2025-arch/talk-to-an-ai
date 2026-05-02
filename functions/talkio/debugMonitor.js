"use strict";

const TALKIO_DEBUG =
  process.env.TALKIO_DEBUG === "true" ||
  process.env.NODE_ENV !== "production";

function safeJson(data = {}) {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function debugLog(label, data = {}) {
  if (!TALKIO_DEBUG) return;

  console.log("[TalkioDebug]", label, safeJson(data));
}

function trackReplyLifecycle({
  label,
  uid = "anonymous",
  dynamicMode = "unknown",
  humanState = null,
  reply = "",
  usedRepair = false,
  usedRecovery = false,
  path = "unknown",
  error = null,
}) {
  const emotionResult = humanState?.emotionResult || {};

  debugLog(label, {
    uid,
    dynamicMode,
    path,

    // 🔥 NEW (aligned with Emotional Spectrum Engine)
    toneFamily: emotionResult?.toneFamily || null,
    primaryEmotion: emotionResult?.primaryEmotion || null,
    secondaryEmotion: emotionResult?.secondaryEmotion || null,
    intensity: emotionResult?.intensity || null,
    responseMode: humanState?.responseMode || dynamicMode || null,

    // 🧾 Reply info
    replyPreview: String(reply || "").slice(0, 300),
    replyLength: String(reply || "").length,

    // 🔧 Pipeline info
    usedRepair,
    usedRecovery,

    error: error ? error?.message || String(error) : null,
    at: new Date().toISOString(),
  });
}

module.exports = {
  debugLog,
  trackReplyLifecycle,
};