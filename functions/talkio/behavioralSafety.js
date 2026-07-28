"use strict";

// ======================================================
// Talkio Local Behavioral Safety Analyzer
//
// Purpose:
// - Detect explicit harmful intent without another AI call.
// - Distinguish emotional pain from intent to harm.
// - Preserve the structured safety result expected by
//   generateTalkioReply.js.
//
// Important:
// - This is a local deterministic safety layer.
// - It does not replace the model's structured safety classification.
// - It provides a safe fallback when the model response is unavailable
//   or malformed.
// ======================================================

// ==============================
// Shared helpers
// ==============================

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(text, patterns = []) {
  return patterns.some((pattern) =>
    pattern.test(text)
  );
}

function createResult({
  riskLevel = "none",
  category = "none",
  shouldRedirect = false,
  recommendedMode = "normal",
  reason = "safe_default",
} = {}) {
  return {
    riskLevel,
    category,
    shouldRedirect,
    recommendedMode,
    reason,
  };
}

// ==============================
// Self-harm detection
// ==============================

/**
 * Detect explicit self-harm or suicide intent.
 *
 * These patterns require stronger language than ordinary:
 * - sadness
 * - loneliness
 * - exhaustion
 * - fear
 * - hopelessness
 * - emotional pain
 */
function detectSelfHarmIntent(text) {
  const immediateIntentPatterns = [
    /\bi (?:am|'m) going to kill myself\b/i,
    /\bi(?:'m| am) about to kill myself\b/i,
    /\bi will kill myself\b/i,
    /\bi want to kill myself\b/i,
    /\bi want to end my life\b/i,
    /\bi(?:'m| am) going to end my life\b/i,
    /\bi plan to kill myself\b/i,
    /\bi have a plan to kill myself\b/i,
    /\bi(?:'m| am) going to hurt myself\b/i,
    /\bi want to hurt myself\b/i,
    /\bi might hurt myself\b/i,
    /\bi cannot keep myself safe\b/i,
    /\bi can't keep myself safe\b/i,
    /\bi am not safe from myself\b/i,
  ];

  if (
    matchesAny(
      text,
      immediateIntentPatterns
    )
  ) {
    return createResult({
      riskLevel: "high",
      category: "self_harm",
      shouldRedirect: true,
      recommendedMode:
        "crisis_support",
      reason:
        "explicit_self_harm_intent",
    });
  }

  const deathWishPatterns = [
    /\bi don't want to live\b/i,
    /\bi do not want to live\b/i,
    /\bi wish i were dead\b/i,
    /\bi wish i was dead\b/i,
    /\bi want to die\b/i,
    /\bthere is no reason to live\b/i,
    /\blife is not worth living\b/i,
    /\beveryone would be better without me\b/i,
  ];

  if (
    matchesAny(
      text,
      deathWishPatterns
    )
  ) {
    return createResult({
      riskLevel: "high",
      category: "self_harm",
      shouldRedirect: true,
      recommendedMode:
        "crisis_support",
      reason:
        "suicidal_or_death_wish_language",
    });
  }

  return null;
}

// ==============================
// Violence detection
// ==============================

/**
 * Detect explicit intent to physically harm another person.
 *
 * These patterns focus on the user's own intent.
 * They should not flag someone merely describing violence
 * another person committed.
 */
function detectViolentIntent(text) {
  const immediatePatterns = [
    /\bi(?:'m| am) going to kill (?:him|her|them|someone|somebody|that person)\b/i,
    /\bi will kill (?:him|her|them|someone|somebody|that person)\b/i,
    /\bi want to kill (?:him|her|them|someone|somebody|that person)\b/i,
    /\bi plan to kill (?:him|her|them|someone|somebody|that person)\b/i,

    /\bi(?:'m| am) going to attack (?:him|her|them|someone|somebody)\b/i,
    /\bi will attack (?:him|her|them|someone|somebody)\b/i,

    /\bi(?:'m| am) going to hurt (?:him|her|them|someone|somebody)\b/i,
    /\bi will hurt (?:him|her|them|someone|somebody)\b/i,
    /\bi want to physically hurt (?:him|her|them|someone|somebody)\b/i,

    /\bi(?:'m| am) planning an attack\b/i,
    /\bi have a plan to attack\b/i,
  ];

  if (
    matchesAny(
      text,
      immediatePatterns
    )
  ) {
    return createResult({
      riskLevel: "high",
      category: "violence",
      shouldRedirect: true,
      recommendedMode:
        "crisis_support",
      reason:
        "explicit_violent_intent",
    });
  }

  const revengeViolencePatterns = [
    /\bi want revenge and i(?:'m| am) going to hurt\b/i,
    /\bi need to make (?:him|her|them|someone|somebody) suffer\b/i,
    /\bi want (?:him|her|them|someone|somebody) to suffer and i will\b/i,
  ];

  if (
    matchesAny(
      text,
      revengeViolencePatterns
    )
  ) {
    return createResult({
      riskLevel: "high",
      category: "violence",
      shouldRedirect: true,
      recommendedMode:
        "crisis_support",
      reason:
        "planned_revenge_or_attack",
    });
  }

  return null;
}

// ==============================
// Manipulation and abuse detection
// ==============================

/**
 * Detect intent to manipulate, harass, exploit, deceive,
 * stalk, scam, or otherwise abuse another person.
 *
 * These are generally harmful but not necessarily immediate
 * physical-danger cases.
 */
function detectManipulativeOrAbusiveIntent(
  text
) {
  const manipulationPatterns = [
    /\bhow (?:do|can) i manipulate\b/i,
    /\bhelp me manipulate\b/i,
    /\bi want to manipulate\b/i,
    /\bhow (?:do|can) i control (?:him|her|them|someone|somebody)\b/i,
    /\bhow (?:do|can) i make (?:him|her|them|someone|somebody) dependent on me\b/i,
    /\bhow (?:do|can) i emotionally control\b/i,
    /\bhow (?:do|can) i gaslight\b/i,
    /\bhelp me gaslight\b/i,
  ];

  if (
    matchesAny(
      text,
      manipulationPatterns
    )
  ) {
    return createResult({
      riskLevel: "medium",
      category: "manipulation",
      shouldRedirect: true,
      recommendedMode:
        "accountability",
      reason:
        "explicit_manipulation_intent",
    });
  }

  const harassmentPatterns = [
    /\bhelp me harass\b/i,
    /\bhow (?:do|can) i harass\b/i,
    /\bi want to keep harassing\b/i,
    /\bhow (?:do|can) i stalk\b/i,
    /\bhelp me stalk\b/i,
    /\bi want to stalk\b/i,
  ];

  if (
    matchesAny(
      text,
      harassmentPatterns
    )
  ) {
    return createResult({
      riskLevel: "medium",
      category: "harassment",
      shouldRedirect: true,
      recommendedMode:
        "accountability",
      reason:
        "explicit_harassment_or_stalking_intent",
    });
  }

  const exploitationPatterns = [
    /\bhow (?:do|can) i exploit\b/i,
    /\bhelp me exploit\b/i,
    /\bi want to exploit\b/i,
    /\bhow (?:do|can) i take advantage of\b/i,
    /\bhelp me take advantage of\b/i,
  ];

  if (
    matchesAny(
      text,
      exploitationPatterns
    )
  ) {
    return createResult({
      riskLevel: "medium",
      category: "exploitation",
      shouldRedirect: true,
      recommendedMode:
        "accountability",
      reason:
        "explicit_exploitation_intent",
    });
  }

  const deceptionPatterns = [
    /\bhelp me deceive\b/i,
    /\bhow (?:do|can) i deceive\b/i,
    /\bhelp me trick (?:him|her|them|someone|somebody)\b/i,
    /\bhow (?:do|can) i trick (?:him|her|them|someone|somebody)\b/i,
    /\bhelp me scam\b/i,
    /\bhow (?:do|can) i scam\b/i,
  ];

  if (
    matchesAny(
      text,
      deceptionPatterns
    )
  ) {
    return createResult({
      riskLevel: "medium",
      category: "deception",
      shouldRedirect: true,
      recommendedMode:
        "accountability",
      reason:
        "explicit_deception_or_scam_intent",
    });
  }

  return null;
}

// ==============================
// Revenge detection
// ==============================

/**
 * Detect revenge intent that does not yet include a direct
 * or immediate physical threat.
 */
function detectRevengeIntent(text) {
  const patterns = [
    /\bhelp me get revenge\b/i,
    /\bhow (?:do|can) i get revenge\b/i,
    /\bi want revenge on\b/i,
    /\bi need to ruin (?:him|her|them|someone|somebody)\b/i,
    /\bi want to destroy (?:his|her|their) life\b/i,
    /\bhow (?:do|can) i make (?:him|her|them|someone|somebody) pay\b/i,
  ];

  if (
    matchesAny(
      text,
      patterns
    )
  ) {
    return createResult({
      riskLevel: "medium",
      category: "revenge",
      shouldRedirect: true,
      recommendedMode:
        "supportive_redirect",
      reason:
        "explicit_revenge_intent",
    });
  }

  return null;
}

// ==============================
// Main analyzer
// ==============================

/**
 * Perform local behavioral safety analysis.
 *
 * This remains async so generateTalkioReply.js does not
 * need a caller change.
 */
async function analyzeBehavioralSafety({
  latestUserMessage,
} = {}) {
  const text = normalizeText(
    latestUserMessage
  );

  if (!text) {
    return createResult({
      reason: "empty_message",
    });
  }

  const detectors = [
    detectSelfHarmIntent,
    detectViolentIntent,
    detectManipulativeOrAbusiveIntent,
    detectRevengeIntent,
  ];

  for (const detector of detectors) {
    const result = detector(text);

    if (result) {
      return result;
    }
  }

  return createResult({
    riskLevel: "none",
    category: "none",
    shouldRedirect: false,
    recommendedMode: "normal",
    reason:
      "no_explicit_harmful_intent_detected",
  });
}

module.exports = {
  analyzeBehavioralSafety,
};