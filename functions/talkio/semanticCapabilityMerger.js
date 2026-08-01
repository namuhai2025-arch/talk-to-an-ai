"use strict";

/*
 * Step 11.1
 *
 * Central decision boundary between the existing V3 router
 * and future V4 semantic recommendations.
 *
 * In this first version, V3 remains fully authoritative.
 * Semantic capabilities are inspected but never promoted.
 */

function normalizeCapabilities(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter(
        (capability) =>
          typeof capability === "string" &&
          capability.trim()
      )
    ),
  ];
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

  return {
    /*
     * Step 11.1 deliberately preserves V3 behavior.
     */
    finalCapabilities: [
      ...normalizedV3,
    ],

    v3Capabilities:
      normalizedV3,

    semanticCapabilities,

    addedCapabilities: [],

    promoted: false,

    reason:
      semanticResult?.consulted === true
        ? "semantic_observed_only"
        : "semantic_not_consulted",
  };
}

module.exports = {
  mergeSemanticCapabilities,
};