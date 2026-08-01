"use strict";

/*
|--------------------------------------------------------------------------
| V4 Semantic Capability Merger
|--------------------------------------------------------------------------
|
| V3 remains the foundation and authority.
|
| V4 may only add approved capabilities when:
| - it was consulted
| - its output parsed successfully
| - its semantic confidence is at least 0.95
|
| V4 can never remove or replace a V3 capability.
|
*/

const SEMANTIC_PROMOTION_THRESHOLD = 0.95;

/*
 * Begin with capabilities that enrich reflection
 * without changing safety or moral authority.
 *
 * Deliberately excluded for the first rollout:
 * - judgment
 * - moralReflection
 * - nervousSystem
 * - trustSafe
 */
const APPROVED_SEMANTIC_CAPABILITIES =
  Object.freeze([
    "reasoning",
    "observation",
    "relationalIntelligence",
    "wisdom",
  ]);

function normalizeCapabilities(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter(
          (capability) =>
            typeof capability ===
              "string" &&
            capability.trim()
        )
        .map((capability) =>
          capability.trim()
        )
    ),
  ];
}

function getSemanticConfidence(
  semanticResult
) {
  const confidence =
    semanticResult
      ?.semanticSignals
      ?.confidence;

  return Number.isFinite(confidence)
    ? confidence
    : null;
}

function mergeSemanticCapabilities({
  v3Capabilities,
  semanticResult = null,
} = {}) {
  const normalizedV3 =
    normalizeCapabilities(
      v3Capabilities
    );

  const semanticCapabilities =
    normalizeCapabilities(
      semanticResult
        ?.semanticCapabilities
    );

  const semanticConfidence =
    getSemanticConfidence(
      semanticResult
    );

  const baseResult = {
    finalCapabilities: [
      ...normalizedV3,
    ],

    v3Capabilities:
      normalizedV3,

    semanticCapabilities,

    addedCapabilities: [],

    semanticConfidence,

    promotionThreshold:
      SEMANTIC_PROMOTION_THRESHOLD,

    promoted: false,
  };

  if (
    semanticResult?.consulted !== true
  ) {
    return {
      ...baseResult,
      reason:
        "semantic_not_consulted",
    };
  }

  if (
    semanticResult?.parsed !== true
  ) {
    return {
      ...baseResult,
      reason:
        "semantic_not_parsed",
    };
  }

  if (
    semanticConfidence === null
  ) {
    return {
      ...baseResult,
      reason:
        "semantic_confidence_missing",
    };
  }

  if (
    semanticConfidence <
    SEMANTIC_PROMOTION_THRESHOLD
  ) {
    return {
      ...baseResult,
      reason:
        "semantic_confidence_below_threshold",
    };
  }

  const approvedAdditions =
    semanticCapabilities.filter(
      (capability) =>
        APPROVED_SEMANTIC_CAPABILITIES
          .includes(capability) &&
        !normalizedV3.includes(
          capability
        )
    );

  if (
    approvedAdditions.length === 0
  ) {
    return {
      ...baseResult,
      reason:
        "no_approved_semantic_additions",
    };
  }

  return {
    ...baseResult,

    finalCapabilities: [
      ...normalizedV3,
      ...approvedAdditions,
    ],

    addedCapabilities:
      approvedAdditions,

    promoted: true,

    reason:
      "approved_semantic_capabilities_promoted",
  };
}

module.exports = {
  SEMANTIC_PROMOTION_THRESHOLD,
  APPROVED_SEMANTIC_CAPABILITIES,
  normalizeCapabilities,
  getSemanticConfidence,
  mergeSemanticCapabilities,
};