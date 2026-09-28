"use strict";

const {
  shouldConsultSemanticAssistant,
} = require("./semanticAssistantGate");

const {
  parseSemanticClassifierOutput,
} = require("./semanticClassifierParser");

const {
  mapSemanticSignalsToCapabilities,
} = require("./semanticCapabilityMapper");

function normalizeCapabilityList(capabilities) {
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

function compareCapabilities({
  v3Capabilities = [],
  semanticCapabilities = [],
} = {}) {
  const v3 = normalizeCapabilityList(
    v3Capabilities
  );

  const semantic = normalizeCapabilityList(
    semanticCapabilities
  );

  const addedBySemantic = semantic.filter(
    (capability) =>
      !v3.includes(capability)
  );

  const missingFromSemantic = v3.filter(
    (capability) =>
      !semantic.includes(capability)
  );

  return {
    agrees:
      addedBySemantic.length === 0 &&
      missingFromSemantic.length === 0,

    addedBySemantic,
    missingFromSemantic,
  };
}

async function runSemanticShadow({
  userMessage = "",
  v3Capabilities = [],
  languageMeta = {},
  classify,
  minimumConfidence = 0.7,
} = {}) {
  const gate =
    shouldConsultSemanticAssistant({
      userMessage,
      v3Capabilities,
      languageMeta,
    });

  if (!gate.consult) {
    return {
      mode: "shadow",
      consulted: false,
      gate,
      parsed: false,
      semanticSignals: null,
      semanticCapabilities: [],
      comparison: null,
      reason: "consultation_not_needed",
    };
  }

  if (typeof classify !== "function") {
    return {
      mode: "shadow",
      consulted: false,
      gate,
      parsed: false,
      semanticSignals: null,
      semanticCapabilities: [],
      comparison: null,
      reason: "classifier_unavailable",
    };
  }

  let rawClassifierOutput;

  try {
    rawClassifierOutput =
      await classify({
        userMessage,
        languageMeta,
      });
  } catch (error) {
    return {
      mode: "shadow",
      consulted: true,
      gate,
      parsed: false,
      semanticSignals: null,
      semanticCapabilities: [],
      comparison: null,
      reason: "classifier_error",
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }

  const parsed =
    parseSemanticClassifierOutput(
      rawClassifierOutput
    );

  if (!parsed.parsed) {
    return {
      mode: "shadow",
      consulted: true,
      gate,
      parsed: false,
      semanticSignals:
        parsed.signals,
      semanticCapabilities: [],
      comparison: null,
      reason: parsed.reason,
      errors: parsed.errors,
    };
  }

  const mapped =
    mapSemanticSignalsToCapabilities(
      parsed.signals,
      {
        minimumConfidence,
      }
    );

  const comparison =
    compareCapabilities({
      v3Capabilities,
      semanticCapabilities:
        mapped.capabilities,
    });

  return {
    mode: "shadow",
    consulted: true,
    gate,
    parsed: true,
    semanticSignals:
      parsed.signals,
    semanticCapabilities:
      mapped.capabilities,
    comparison,
    applied:
      mapped.applied,
    reason:
      mapped.reason,
    errors:
      mapped.errors,
  };
}

module.exports = {
  normalizeCapabilityList,
  compareCapabilities,
  runSemanticShadow,
};