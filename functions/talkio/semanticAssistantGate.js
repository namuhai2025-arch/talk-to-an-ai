"use strict";

/*
|--------------------------------------------------------------------------
| V4 Semantic Assistant Gate
|--------------------------------------------------------------------------
|
| Decides whether the existing V3 router may benefit from semantic help.
|
| This module:
| - does not call a model
| - does not build prompts
| - does not alter capabilities
| - does not replace V3
|
| V3 remains the primary router.
|
*/

const BASE_CAPABILITIES = Object.freeze([
  "coreIdentity",
  "talkioSoul",
  "humanRealism",
]);

const SPECIALIZED_CAPABILITIES = Object.freeze([
  "reasoning",
  "judgment",
  "moralReflection",
  "nervousSystem",
  "trustSafe",
  "observation",
  "wisdom",
]);

const MIN_NON_ENGLISH_WORDS = 3;
const MIN_BASE_ONLY_WORDS = 6;

function normalizeCapabilities(capabilities) {
  if (!Array.isArray(capabilities)) {
    return [];
  }

  return [
    ...new Set(
      capabilities.filter(
        (capability) =>
          typeof capability === "string" &&
          capability.trim().length > 0
      )
    ),
  ];
}

function containsNonAsciiText(text = "") {
  return /[^\u0000-\u007f]/.test(
    String(text || "")
  );
}

function looksMixedLanguage({
  userMessage = "",
  languageMeta = {},
} = {}) {
  if (
    languageMeta?.mixed === true ||
    languageMeta?.isMixedLanguage === true
  ) {
    return true;
  }

  const detectedLanguages =
    Array.isArray(
      languageMeta?.detectedLanguages
    )
      ? languageMeta.detectedLanguages
      : [];

  return detectedLanguages.length > 1;
}

function hasSpecializedCapability(
  capabilities
) {
  return capabilities.some(
    (capability) =>
      SPECIALIZED_CAPABILITIES.includes(
        capability
      )
  );
}

function shouldConsultSemanticAssistant({
  userMessage = "",
  v3Capabilities = [],
  languageMeta = {},
} = {}) {
  const text =
    typeof userMessage === "string"
      ? userMessage.trim()
      : "";

  const capabilities =
    normalizeCapabilities(
      v3Capabilities
    );

  const wordCount =
    text.split(/\s+/).filter(Boolean)
      .length;

  if (!text) {
    return {
      consult: false,
      reason: "empty_message",
      confidence: 1,
    };
  }

  const mixedLanguage =
    looksMixedLanguage({
      userMessage: text,
      languageMeta,
    });

  if (
    mixedLanguage &&
    wordCount >= MIN_NON_ENGLISH_WORDS
  ) {
    return {
      consult: true,
      reason: "mixed_language",
      confidence: 0.9,
    };
  }

  if (
    containsNonAsciiText(text) &&
    wordCount >= MIN_NON_ENGLISH_WORDS
  ) {
    return {
      consult: true,
      reason:
        "non_english_or_unicode_text",
      confidence: 0.8,
    };
  }

  /*
   * A clear V3 specialist route is sufficient
   * for ordinary-language messages.
   */
  if (
    hasSpecializedCapability(
      capabilities
    )
  ) {
    return {
      consult: false,
      reason:
        "v3_specialized_route_found",
      confidence: 0.9,
    };
  }

  if (
    capabilities.includes(
      "relationalIntelligence"
    )
  ) {
    return {
      consult: false,
      reason:
        "v3_relational_route_found",
      confidence: 0.85,
    };
  }

  /*
   * If V3 returned only the base capabilities for a
   * substantial message, the meaning may be indirect
   * or outside the current English regex vocabulary.
   */
  const baseOnly =
    capabilities.length ===
      BASE_CAPABILITIES.length &&
    BASE_CAPABILITIES.every(
      (capability) =>
        capabilities.includes(capability)
    );

  if (
    baseOnly &&
    wordCount >= MIN_BASE_ONLY_WORDS
  ) {
    return {
      consult: true,
      reason:
        "substantial_message_base_route_only",
      confidence: 0.75,
    };
  }

  return {
    consult: false,
    reason: "v3_route_sufficient",
    confidence: 0.85,
  };
}

module.exports = {
  BASE_CAPABILITIES,
  SPECIALIZED_CAPABILITIES,
  MIN_NON_ENGLISH_WORDS,
  MIN_BASE_ONLY_WORDS,
  normalizeCapabilities,
  containsNonAsciiText,
  looksMixedLanguage,
  hasSpecializedCapability,
  shouldConsultSemanticAssistant,
};