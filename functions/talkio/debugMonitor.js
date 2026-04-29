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
  debugLog(label, {
    uid,
    dynamicMode,
    path,
    state: humanState?.state || null,
    drift: humanState?.drift || null,
    movementShift: humanState?.movementShift || null,
    replyPreview: String(reply || "").slice(0, 300),
    replyLength: String(reply || "").length,
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