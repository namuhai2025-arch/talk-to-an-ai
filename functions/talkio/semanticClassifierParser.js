"use strict";

const {
  createSemanticSignals,
  validateSemanticSignals,
} = require("./semanticSignals");

function extractClassifierText(raw) {
  if (!raw) return "";

  if (typeof raw === "string") {
    return raw.trim();
  }

  if (typeof raw.text === "string") {
    return raw.text.trim();
  }

  if (typeof raw.reply === "string") {
    return raw.reply.trim();
  }

  if (
    Array.isArray(
      raw?.candidates?.[0]?.content?.parts
    )
  ) {
    return raw.candidates[0].content.parts
      .map((part) =>
        typeof part?.text === "string"
          ? part.text
          : ""
      )
      .join("")
      .trim();
  }

  return "";
}

function stripJsonFence(text = "") {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseSemanticClassifierOutput(raw) {
  const text = stripJsonFence(
    extractClassifierText(raw)
  );

  if (!text) {
    return {
      signals: createSemanticSignals({
        source: "semantic-parse-fallback",
      }),
      parsed: false,
      reason: "empty_output",
      errors: [],
    };
  }

  let parsedValue;

  try {
    parsedValue = JSON.parse(text);
  } catch {
    return {
      signals: createSemanticSignals({
        source: "semantic-parse-fallback",
      }),
      parsed: false,
      reason: "invalid_json",
      errors: [],
    };
  }

  if (
    !parsedValue ||
    typeof parsedValue !== "object" ||
    Array.isArray(parsedValue)
  ) {
    return {
      signals: createSemanticSignals({
        source: "semantic-parse-fallback",
      }),
      parsed: false,
      reason: "invalid_object",
      errors: [],
    };
  }

  const signals = createSemanticSignals({
    detectedLanguage:
      typeof parsedValue.detectedLanguage ===
      "string"
        ? parsedValue.detectedLanguage
        : "unknown",

    isMixedLanguage:
      parsedValue.isMixedLanguage,

    asksForDecision:
      parsedValue.asksForDecision,

    asksForExplanation:
      parsedValue.asksForExplanation,

    emotionalOverload:
      parsedValue.emotionalOverload,

    moralConflict:
      parsedValue.moralConflict,

    trustConcern:
      parsedValue.trustConcern,

    patternReflection:
      parsedValue.patternReflection,

    relationalContext:
      parsedValue.relationalContext,

    confidence:
      parsedValue.confidence,

    source: "semantic-classifier",
  });

  const validation =
    validateSemanticSignals(signals);

  if (!validation.valid) {
    return {
      signals: createSemanticSignals({
        source: "semantic-parse-fallback",
      }),
      parsed: false,
      reason: "validation_failed",
      errors: validation.errors,
    };
  }

  return {
    signals,
    parsed: true,
    reason: "parsed",
    errors: [],
  };
}

module.exports = {
  extractClassifierText,
  stripJsonFence,
  parseSemanticClassifierOutput,
};