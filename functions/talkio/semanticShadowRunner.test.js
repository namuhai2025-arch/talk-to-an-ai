"use strict";

const {
  runSemanticShadow,
} = require("./semanticShadowRunner");

async function run(name, fn) {
  try {
    await fn();
    console.log(`\n✅ ${name}`);
  } catch (err) {
    console.error(`\n❌ ${name}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

const BASE = [
  "coreIdentity",
  "talkioSoul",
  "humanRealism",
];

(async () => {
  await run(
    "No consultation needed",
    async () => {
      const result =
        await runSemanticShadow({
          userMessage: "Hi",
          v3Capabilities: BASE,

          classify: async () => {
            throw new Error(
              "Classifier should never run."
            );
          },
        });

      if (result.consulted !== false) {
        throw new Error(
          "Expected consulted=false"
        );
      }
    }
  );

  await run(
    "Classifier unavailable",
    async () => {
      const result =
        await runSemanticShadow({
          userMessage:
            "Part of me wants to leave, but I am not sure.",
          v3Capabilities: BASE,
        });

      if (
        result.reason !==
        "classifier_unavailable"
      ) {
        throw new Error(
          `Wrong fallback reason: ${result.reason}`
        );
      }
    }
  );

  await run(
    "Classifier throws",
    async () => {
      const result =
        await runSemanticShadow({
          userMessage:
            "Part of me wants to leave, but I am not sure.",
          v3Capabilities: BASE,

          classify: async () => {
            throw new Error("boom");
          },
        });

      if (
        result.reason !==
        "classifier_error"
      ) {
        throw new Error(
          `Expected classifier_error, received ${result.reason}`
        );
      }
    }
  );

  await run(
    "Valid semantic result",
    async () => {
      const result =
        await runSemanticShadow({
          userMessage:
            "Part of me wants to stay but another part wants to leave.",

          v3Capabilities: BASE,

          classify: async () => `
{
  "detectedLanguage": "en",
  "isMixedLanguage": false,
  "confidence": 0.95,
  "asksForDecision": true,
  "asksForExplanation": false,
  "emotionalOverload": false,
  "moralConflict": false,
  "trustConcern": false,
  "patternReflection": false,
  "relationalContext": false
}
`,
        });

      if (!result.parsed) {
        throw new Error(
          `Parser failed unexpectedly: ${result.reason}`
        );
      }

      if (
        !result.semanticCapabilities.includes(
          "judgment"
        )
      ) {
        throw new Error(
          "Judgment capability missing."
        );
      }
    }
  );

  await run(
    "Malformed JSON",
    async () => {
      const result =
        await runSemanticShadow({
          userMessage:
            "Part of me wants to leave, but I am not sure.",
          v3Capabilities: BASE,

          classify: async () =>
            "{bad json",
        });

      if (result.parsed) {
        throw new Error(
          "Malformed JSON should fail."
        );
      }

      if (
        result.reason !== "invalid_json"
      ) {
        throw new Error(
          `Expected invalid_json, received ${result.reason}`
        );
      }
    }
  );

  if (process.exitCode) {
    console.error(
      "\nShadow runner tests failed."
    );
  } else {
    console.log(
      "\nAll semantic shadow runner tests passed."
    );
  }
})();