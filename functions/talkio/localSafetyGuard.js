"use strict";

/**
 * Final deterministic safety guard.
 *
 * This function:
 * - does not call a model
 * - does not classify the user's message
 * - does not append hard-coded English safety text
 * - preserves Talkio's multilingual reply
 *
 * High-risk block decisions are handled earlier in
 * generateTalkioReply.js through:
 *
 * - safety.riskLevel
 * - safety.shouldRedirect
 * - action
 * - blocked
 */
function applySafetyGuard({
  reply,
  behavioralSafety,
} = {}) {
  const text = String(reply || "").trim();

  if (!text) {
    return "";
  }

  const riskLevel =
    behavioralSafety?.riskLevel || "none";

  const category =
    behavioralSafety?.category || "none";

  const shouldRedirect =
    behavioralSafety?.shouldRedirect === true;

  /*
   * High-risk self-harm and violence responses are normally returned
   * before this function is reached.
   *
   * If one reaches this point because the model classified the message
   * inconsistently, preserve the generated reply rather than adding
   * hard-coded English text.
   */
  if (
    riskLevel === "high" &&
    shouldRedirect &&
    (
      category === "self_harm" ||
      category === "violence"
    )
  ) {
    return text;
  }

  /*
   * Medium-risk categories such as manipulation, harassment,
   * exploitation, deception, and revenge should receive the model's
   * accountability or supportive-redirect reply.
   */
  return text;
}

module.exports = {
  applySafetyGuard,
};