"use strict";

const {
  createSemanticSignals,
} = require("./semanticSignals");

const {
  mapSemanticSignalsToCapabilities,
} = require("./semanticCapabilityMapper");

const BASE = [
  "coreIdentity",
  "talkioSoul",
  "humanRealism",
];

const tests = [
  {
    name: "High-confidence decision",
    signals: createSemanticSignals({
      asksForDecision: true,
      confidence: 0.95,
      source: "semantic-shadow",
    }),
    expected: [
      ...BASE,
      "reasoning",
      "judgment",
    ],
    expectedApplied: true,
    expectedReason:
      "semantic_signals_applied",
  },

  {
    name: "Explanation without decision",
    signals: createSemanticSignals({
      asksForExplanation: true,
      confidence: 0.9,
      source: "semantic-shadow",
    }),
    expected: [
      ...BASE,
      "reasoning",
    ],
    expectedApplied: true,
    expectedReason:
      "semantic_signals_applied",
  },

  {
    name: "Emotional overload",
    signals: createSemanticSignals({
      emotionalOverload: true,
      confidence: 0.91,
      source: "semantic-shadow",
    }),
    expected: [
      ...BASE,
      "nervousSystem",
    ],
    expectedApplied: true,
    expectedReason:
      "semantic_signals_applied",
  },

  {
    name: "Moral and relational conflict",
    signals: createSemanticSignals({
      moralConflict: true,
      relationalContext: true,
      confidence: 0.94,
      source: "semantic-shadow",
    }),
    expected: [
      ...BASE,
      "moralReflection",
      "relationalIntelligence",
    ],
    expectedApplied: true,
    expectedReason:
      "semantic_signals_applied",
  },

  {
    name: "Pattern reflection",
    signals: createSemanticSignals({
      patternReflection: true,
      confidence: 0.93,
      source: "semantic-shadow",
    }),
    expected: [
      ...BASE,
      "reasoning",
      "observation",
      "wisdom",
    ],
    expectedApplied: true,
    expectedReason:
      "semantic_signals_applied",
  },

  {
    name: "Trust concern",
    signals: createSemanticSignals({
      trustConcern: true,
      confidence: 0.89,
      source: "semantic-shadow",
    }),
    expected: [
      ...BASE,
      "trustSafe",
    ],
    expectedApplied: true,
    expectedReason:
      "semantic_signals_applied",
  },

  {
    name: "Low confidence falls back",
    signals: createSemanticSignals({
      asksForDecision: true,
      confidence: 0.4,
      source: "semantic-shadow",
    }),
    expected: BASE,
    expectedApplied: false,
    expectedReason: "low_confidence",
  },

  {
    name: "Invalid signals fall back",
    signals: {
      confidence: 0.9,
    },
    expected: BASE,
    expectedApplied: false,
    expectedReason: "invalid_signals",
  },

  {
    name: "Combined signals do not duplicate",
    signals: createSemanticSignals({
      asksForDecision: true,
      asksForExplanation: true,
      patternReflection: true,
      confidence: 0.96,
      source: "semantic-shadow",
    }),
    expected: [
      ...BASE,
      "reasoning",
      "judgment",
      "observation",
      "wisdom",
    ],
    expectedApplied: true,
    expectedReason:
      "semantic_signals_applied",
  },
];

let failures = 0;

for (const test of tests) {
  const result =
    mapSemanticSignalsToCapabilities(
      test.signals
    );

  const capabilitiesPassed =
    JSON.stringify(result.capabilities) ===
    JSON.stringify(test.expected);

  const metadataPassed =
    result.applied ===
      test.expectedApplied &&
    result.reason ===
      test.expectedReason;

  const passed =
    capabilitiesPassed &&
    metadataPassed;

  console.log(
    `\n${passed ? "✅" : "❌"} ${test.name}`
  );

  console.log(
    "Capabilities:",
    result.capabilities
  );

  if (!passed) {
    failures += 1;

    console.log(
      "Expected capabilities:",
      test.expected
    );

    console.log(
      "Applied:",
      result.applied,
      "Expected:",
      test.expectedApplied
    );

    console.log(
      "Reason:",
      result.reason,
      "Expected:",
      test.expectedReason
    );
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} semantic mapper test(s) failed.`
  );

  process.exit(1);
}

console.log(
  "\nAll semantic mapper tests passed."
);