"use strict";

const {
  createSemanticClassifier,
} = require("./semanticClassifier");

const {
  runSemanticShadow,
} = require("./semanticShadowRunner");

const BASE = [
  "coreIdentity",
  "talkioSoul",
  "humanRealism",
];

async function run(name, fn) {
  try {
    await fn();
    console.log(`\n✅ ${name}`);
  } catch (error) {
    console.error(`\n❌ ${name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await run(
    "Bisaya decision is suggested semantically",
    async () => {
      let modelCalls = 0;
      let capturedRequest = null;

      const modelGenerate =
        async (request) => {
          modelCalls += 1;
          capturedRequest = request;

          return JSON.stringify({
            detectedLanguage: "ceb",
            isMixedLanguage: false,
            asksForDecision: true,
            asksForExplanation: false,
            emotionalOverload: false,
            moralConflict: false,
            trustConcern: false,
            patternReflection: false,
            relationalContext: false,
            confidence: 0.94,
          });
        };

      const classify =
        createSemanticClassifier({
          modelGenerate,
        });

      const v3Capabilities = [
        ...BASE,
      ];

      const result =
        await runSemanticShadow({
          userMessage:
            "Wala na gyud ko kabalo unsay sakto buhaton.",
          v3Capabilities,
          languageMeta: {
            primaryLanguage: "ceb",
            detectedLanguages: [
              "ceb",
            ],
          },
          classify,
        });

      if (modelCalls !== 1) {
        throw new Error(
          `Expected one model call, received ${modelCalls}.`
        );
      }

      if (!result.consulted) {
        throw new Error(
          "Expected semantic consultation."
        );
      }

      if (!result.parsed) {
        throw new Error(
          `Expected parsed result, received ${result.reason}.`
        );
      }

      if (
        !result.semanticCapabilities.includes(
          "reasoning"
        ) ||
        !result.semanticCapabilities.includes(
          "judgment"
        )
      ) {
        throw new Error(
          "Semantic decision capabilities are missing."
        );
      }

      if (
        result.comparison?.addedBySemantic
          ?.includes("reasoning") !==
          true ||
        result.comparison?.addedBySemantic
          ?.includes("judgment") !==
          true
      ) {
        throw new Error(
          "Comparison did not identify semantic additions."
        );
      }

      if (
        JSON.stringify(v3Capabilities) !==
        JSON.stringify(BASE)
      ) {
        throw new Error(
          "V3 capabilities were mutated."
        );
      }

      const content =
        capturedRequest?.messages?.[0]
          ?.content;

      if (
        !content?.includes(
          "Wala na gyud ko kabalo unsay sakto buhaton."
        )
      ) {
        throw new Error(
          "Classifier did not receive the Bisaya message."
        );
      }
    }
  );

  await run(
    "Greeting does not call semantic classifier",
    async () => {
      let modelCalls = 0;

      const classify =
        createSemanticClassifier({
          modelGenerate:
            async () => {
              modelCalls += 1;
              return "{}";
            },
        });

      const result =
        await runSemanticShadow({
          userMessage: "Hi",
          v3Capabilities: BASE,
          classify,
        });

      if (modelCalls !== 0) {
        throw new Error(
          "Greeting should not call the classifier."
        );
      }

      if (
        result.reason !==
        "consultation_not_needed"
      ) {
        throw new Error(
          `Unexpected reason: ${result.reason}`
        );
      }
    }
  );

  await run(
    "Existing V3 judgment route bypasses semantic classifier",
    async () => {
      let modelCalls = 0;

      const classify =
        createSemanticClassifier({
          modelGenerate:
            async () => {
              modelCalls += 1;
              return "{}";
            },
        });

      const result =
        await runSemanticShadow({
          userMessage:
            "What should I do about my job?",
          v3Capabilities: [
            ...BASE,
            "reasoning",
            "judgment",
          ],
          classify,
        });

      if (modelCalls !== 0) {
        throw new Error(
          "Clear V3 route should bypass semantic classification."
        );
      }

      if (
        result.gate?.reason !==
        "v3_specialized_route_found"
      ) {
        throw new Error(
          `Unexpected gate reason: ${result.gate?.reason}`
        );
      }
    }
  );

  await run(
    "Invalid semantic output fails safely",
    async () => {
      const classify =
        createSemanticClassifier({
          modelGenerate:
            async () =>
              "not valid json",
        });

      const result =
        await runSemanticShadow({
          userMessage:
            "Part of me wants to stay, but another part thinks I should leave.",
          v3Capabilities: BASE,
          classify,
        });

      if (result.parsed) {
        throw new Error(
          "Invalid output must not parse."
        );
      }

      if (
        result.reason !== "invalid_json"
      ) {
        throw new Error(
          `Expected invalid_json, received ${result.reason}.`
        );
      }
    }
  );

  if (process.exitCode) {
    console.error(
      "\nSemantic shadow integration tests failed."
    );
  } else {
    console.log(
      "\nAll semantic shadow integration tests passed."
    );
  }
})();