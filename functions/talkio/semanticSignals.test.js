"use strict";

const {
  SEMANTIC_SIGNAL_VERSION,
  createSemanticSignals,
  validateSemanticSignals,
} = require("./semanticSignals");

const tests = [
  {
    name: "Default signals are valid",
    run() {
      const signals =
        createSemanticSignals();

      const validation =
        validateSemanticSignals(signals);

      return {
        passed:
          signals.version ===
            SEMANTIC_SIGNAL_VERSION &&
          validation.valid === true,
        actual: {
          signals,
          validation,
        },
      };
    },
  },

  {
    name: "Overrides are preserved",
    run() {
      const signals =
        createSemanticSignals({
          detectedLanguage: "tl",
          isMixedLanguage: true,
          asksForDecision: true,
          confidence: 0.92,
          source: "semantic-shadow",
        });

      return {
        passed:
          signals.detectedLanguage === "tl" &&
          signals.isMixedLanguage === true &&
          signals.asksForDecision === true &&
          signals.confidence === 0.92 &&
          signals.source ===
            "semantic-shadow",
        actual: signals,
      };
    },
  },

  {
    name: "Invalid confidence is rejected",
    run() {
      const signals =
        createSemanticSignals({
          confidence: 1.5,
        });

      const validation =
        validateSemanticSignals(signals);

      return {
        passed:
          validation.valid === false &&
          validation.errors.some(
            (error) =>
              error.includes("confidence")
          ),
        actual: validation,
      };
    },
  },

  {
    name: "Invalid boolean is rejected",
    run() {
      const signals =
        createSemanticSignals({
          moralConflict: "yes",
        });

      const validation =
        validateSemanticSignals(signals);

      return {
        passed:
          validation.valid === false &&
          validation.errors.some(
            (error) =>
              error.includes("moralConflict")
          ),
        actual: validation,
      };
    },
  },

  {
    name: "Invalid input object is rejected",
    run() {
      const validation =
        validateSemanticSignals(null);

      return {
        passed:
          validation.valid === false,
        actual: validation,
      };
    },
  },
];

let failures = 0;

for (const test of tests) {
  const result = test.run();

  console.log(
    `\n${result.passed ? "✅" : "❌"} ${test.name}`
  );

  if (!result.passed) {
    failures += 1;
    console.log("Actual:", result.actual);
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} semantic signal test(s) failed.`
  );

  process.exit(1);
}

console.log(
  "\nAll semantic signal tests passed."
);