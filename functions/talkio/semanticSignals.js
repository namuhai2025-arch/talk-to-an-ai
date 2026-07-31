"use strict";

/*
|--------------------------------------------------------------------------
| V4 Semantic Routing Signals
|--------------------------------------------------------------------------
|
| This module defines the language-independent meaning signals used by
| semantic capability routing.
|
| Initial rollout:
| - shadow mode only
| - does not alter production capabilities
| - does not call Gemini yet
| - does not replace the V3 router
|
*/

const SEMANTIC_SIGNAL_VERSION = "v4";

const DEFAULT_SEMANTIC_SIGNALS = Object.freeze({
  version: SEMANTIC_SIGNAL_VERSION,

  detectedLanguage: "unknown",
  isMixedLanguage: false,

  asksForDecision: false,
  asksForExplanation: false,
  emotionalOverload: false,
  moralConflict: false,
  trustConcern: false,
  patternReflection: false,
  relationalContext: false,

  confidence: 0,
  source: "default",
});

function createSemanticSignals(overrides = {}) {
  const input =
    overrides &&
    typeof overrides === "object"
      ? overrides
      : {};

  return {
    ...DEFAULT_SEMANTIC_SIGNALS,
    ...input,
    version: SEMANTIC_SIGNAL_VERSION,
  };
}

function validateSemanticSignals(signals) {
  if (
    !signals ||
    typeof signals !== "object" ||
    Array.isArray(signals)
  ) {
    return {
      valid: false,
      errors: [
        "Semantic signals must be an object.",
      ],
    };
  }

  const errors = [];

  const booleanFields = [
    "isMixedLanguage",
    "asksForDecision",
    "asksForExplanation",
    "emotionalOverload",
    "moralConflict",
    "trustConcern",
    "patternReflection",
    "relationalContext",
  ];

  for (const field of booleanFields) {
    if (typeof signals[field] !== "boolean") {
      errors.push(
        `${field} must be a boolean.`
      );
    }
  }

  if (
    typeof signals.detectedLanguage !== "string" ||
    signals.detectedLanguage.trim().length === 0
  ) {
    errors.push(
      "detectedLanguage must be a non-empty string."
    );
  }

  if (
    typeof signals.confidence !== "number" ||
    !Number.isFinite(signals.confidence) ||
    signals.confidence < 0 ||
    signals.confidence > 1
  ) {
    errors.push(
      "confidence must be a number between 0 and 1."
    );
  }

  if (
    typeof signals.source !== "string" ||
    signals.source.trim().length === 0
  ) {
    errors.push(
      "source must be a non-empty string."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  SEMANTIC_SIGNAL_VERSION,
  DEFAULT_SEMANTIC_SIGNALS,
  createSemanticSignals,
  validateSemanticSignals,
};