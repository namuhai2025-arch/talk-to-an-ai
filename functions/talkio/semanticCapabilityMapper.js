"use strict";

const {
  validateSemanticSignals,
} = require("./semanticSignals");

const BASE_CAPABILITIES = Object.freeze([
  "coreIdentity",
  "talkioSoul",
  "humanRealism",
]);

function mapSemanticSignalsToCapabilities(
  signals,
  {
    minimumConfidence = 0.7,
  } = {}
) {
  const validation =
    validateSemanticSignals(signals);

  if (!validation.valid) {
    return {
      capabilities: [...BASE_CAPABILITIES],
      applied: false,
      reason: "invalid_signals",
      errors: validation.errors,
    };
  }

  if (signals.confidence < minimumConfidence) {
    return {
      capabilities: [...BASE_CAPABILITIES],
      applied: false,
      reason: "low_confidence",
      errors: [],
    };
  }

  const capabilities = [
    ...BASE_CAPABILITIES,
  ];

  if (signals.asksForDecision) {
    capabilities.push(
      "reasoning",
      "judgment"
    );
  }

  if (
    signals.asksForExplanation &&
    !signals.asksForDecision
  ) {
    capabilities.push("reasoning");
  }

  if (signals.emotionalOverload) {
    capabilities.push("nervousSystem");
  }

  if (signals.moralConflict) {
    capabilities.push("moralReflection");
  }

  if (signals.trustConcern) {
    capabilities.push("trustSafe");
  }

  if (signals.patternReflection) {
    capabilities.push(
      "reasoning",
      "observation",
      "wisdom"
    );
  }

  if (signals.relationalContext) {
    capabilities.push(
      "relationalIntelligence"
    );
  }

  return {
    capabilities: [
      ...new Set(capabilities),
    ],
    applied: true,
    reason: "semantic_signals_applied",
    errors: [],
  };
}

module.exports = {
  BASE_CAPABILITIES,
  mapSemanticSignalsToCapabilities,
};