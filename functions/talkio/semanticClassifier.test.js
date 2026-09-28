"use strict";

const {
  SEMANTIC_CLASSIFIER_PROMPT,
  normalizeClassifierMessage,
  classifySemanticSignals,
  createSemanticClassifier,
} = require("./semanticClassifier");

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
    "Classifier prompt contains exact schema",
    async () => {
      const requiredFields = [
        "detectedLanguage",
        "isMixedLanguage",
        "asksForDecision",
        "asksForExplanation",
        "emotionalOverload",
        "moralConflict",
        "trustConcern",
        "patternReflection",
        "relationalContext",
        "confidence",
      ];

      for (const field of requiredFields) {
        if (
          !SEMANTIC_CLASSIFIER_PROMPT.includes(
            `"${field}"`
          )
        ) {
          throw new Error(
            `Missing classifier field: ${field}`
          );
        }
      }
    }
  );

  await run(
    "Message normalization trims text",
    async () => {
      const result =
        normalizeClassifierMessage(
          "   Kumusta?   "
        );

      if (result !== "Kumusta?") {
        throw new Error(
          `Unexpected normalized message: ${result}`
        );
      }
    }
  );

  await run(
    "Message normalization limits length",
    async () => {
      const result =
        normalizeClassifierMessage(
          "a".repeat(5000)
        );

      if (result.length !== 4000) {
        throw new Error(
          `Expected 4000 characters, received ${result.length}`
        );
      }
    }
  );

  await run(
    "Empty message is rejected",
    async () => {
      let error = null;

      try {
        await classifySemanticSignals({
          userMessage: "   ",
          modelGenerate: async () => "",
        });
      } catch (caught) {
        error = caught;
      }

      if (
        !(error instanceof TypeError) ||
        !error.message.includes(
          "user message"
        )
      ) {
        throw new Error(
          "Expected empty-message TypeError."
        );
      }
    }
  );

  await run(
    "Missing modelGenerate is rejected",
    async () => {
      let error = null;

      try {
        await classifySemanticSignals({
          userMessage: "Hello",
        });
      } catch (caught) {
        error = caught;
      }

      if (
        !(error instanceof TypeError) ||
        !error.message.includes(
          "modelGenerate"
        )
      ) {
        throw new Error(
          "Expected modelGenerate TypeError."
        );
      }
    }
  );

  await run(
    "Existing model contract is used",
    async () => {
      let capturedRequest = null;

      const expectedRaw =
        '{"detectedLanguage":"ceb"}';

      const raw =
        await classifySemanticSignals({
          userMessage:
            "Wala ko kabalo unsay buhaton.",
          languageMeta: {
            primaryLanguage: "ceb",
          },

          modelGenerate:
            async (request) => {
              capturedRequest = request;
              return expectedRaw;
            },
        });

      if (raw !== expectedRaw) {
        throw new Error(
          "Classifier did not return raw model output."
        );
      }

      if (
        !capturedRequest ||
        typeof capturedRequest.systemPrompt !==
          "string" ||
        !Array.isArray(
          capturedRequest.messages
        )
      ) {
        throw new Error(
          "Existing modelGenerate contract was not used."
        );
      }

      const content =
        capturedRequest.messages[0]?.content;

      if (
        !content.includes(
          "Wala ko kabalo unsay buhaton."
        ) ||
        !content.includes("ceb")
      ) {
        throw new Error(
          "Message or language hint was not included."
        );
      }
    }
  );

  await run(
    "Unknown language hint is used safely",
    async () => {
      let capturedRequest = null;

      await classifySemanticSignals({
        userMessage:
          "Part of me wants to leave.",
        modelGenerate:
          async (request) => {
            capturedRequest = request;
            return "{}";
          },
      });

      const content =
        capturedRequest.messages[0]?.content;

      if (
        !content.includes(
          "OPTIONAL LANGUAGE HINT"
        ) ||
        !content.includes("unknown")
      ) {
        throw new Error(
          "Unknown language hint missing."
        );
      }
    }
  );

  await run(
    "Factory creates compatible classifier",
    async () => {
      let calls = 0;

      const classify =
        createSemanticClassifier({
          modelGenerate:
            async () => {
              calls += 1;
              return '{"ok":true}';
            },
        });

      const raw = await classify({
        userMessage:
          "Hindi ko alam ang gagawin ko.",
        languageMeta: {
          primaryLanguage: "tl",
        },
      });

      if (
        calls !== 1 ||
        raw !== '{"ok":true}'
      ) {
        throw new Error(
          "Factory classifier did not call modelGenerate correctly."
        );
      }
    }
  );

  await run(
    "Factory rejects missing modelGenerate",
    async () => {
      let error = null;

      try {
        createSemanticClassifier();
      } catch (caught) {
        error = caught;
      }

      if (
        !(error instanceof TypeError)
      ) {
        throw new Error(
          "Expected factory TypeError."
        );
      }
    }
  );

  if (process.exitCode) {
    console.error(
      "\nSemantic classifier tests failed."
    );
  } else {
    console.log(
      "\nAll semantic classifier tests passed."
    );
  }
})();