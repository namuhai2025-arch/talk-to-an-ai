"use strict";

const {
  extractClassifierText,
  stripJsonFence,
  parseSemanticClassifierOutput,
} = require("./semanticClassifierParser");

const validPayload = {
  detectedLanguage: "tl",
  isMixedLanguage: true,
  asksForDecision: true,
  asksForExplanation: false,
  emotionalOverload: false,
  moralConflict: true,
  trustConcern: false,
  patternReflection: false,
  relationalContext: true,
  confidence: 0.94,
};

const tests = [
  {
    name: "Valid JSON string",
    run() {
      const result =
        parseSemanticClassifierOutput(
          JSON.stringify(validPayload)
        );

      return {
        passed:
          result.parsed === true &&
          result.reason === "parsed" &&
          result.signals.detectedLanguage === "tl" &&
          result.signals.asksForDecision === true &&
          result.signals.moralConflict === true &&
          result.signals.confidence === 0.94,
        actual: result,
      };
    },
  },

  {
    name: "JSON inside markdown fence",
    run() {
      const raw = `\`\`\`json
${JSON.stringify(validPayload)}
\`\`\``;

      const result =
        parseSemanticClassifierOutput(raw);

      return {
        passed:
          result.parsed === true &&
          result.reason === "parsed",
        actual: result,
      };
    },
  },

  {
    name: "Gemini candidates response",
    run() {
      const raw = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text:
                    JSON.stringify(
                      validPayload
                    ),
                },
              ],
            },
          },
        ],
      };

      const result =
        parseSemanticClassifierOutput(raw);

      return {
        passed:
          result.parsed === true &&
          result.signals.relationalContext ===
            true,
        actual: result,
      };
    },
  },

  {
    name: "Text property response",
    run() {
      const raw = {
        text: JSON.stringify(validPayload),
      };

      const result =
        parseSemanticClassifierOutput(raw);

      return {
        passed:
          result.parsed === true &&
          result.reason === "parsed",
        actual: result,
      };
    },
  },

  {
    name: "Empty output falls back",
    run() {
      const result =
        parseSemanticClassifierOutput("");

      return {
        passed:
          result.parsed === false &&
          result.reason === "empty_output" &&
          result.signals.source ===
            "semantic-parse-fallback",
        actual: result,
      };
    },
  },

  {
    name: "Malformed JSON falls back",
    run() {
      const result =
        parseSemanticClassifierOutput(
          '{"asksForDecision": true'
        );

      return {
        passed:
          result.parsed === false &&
          result.reason === "invalid_json",
        actual: result,
      };
    },
  },

  {
    name: "Plain text falls back",
    run() {
      const result =
        parseSemanticClassifierOutput(
          "hello world"
        );

      return {
        passed:
          result.parsed === false &&
          result.reason === "invalid_json",
        actual: result,
      };
    },
  },

  {
    name: "Array output is rejected",
    run() {
      const result =
        parseSemanticClassifierOutput(
          JSON.stringify([
            validPayload,
          ])
        );

      return {
        passed:
          result.parsed === false &&
          result.reason ===
            "invalid_object",
        actual: result,
      };
    },
  },

  {
    name: "Missing fields fail validation",
    run() {
      const result =
        parseSemanticClassifierOutput(
          JSON.stringify({
            detectedLanguage: "en",
            confidence: 0.9,
          })
        );

      return {
        passed:
          result.parsed === false &&
          result.reason ===
            "validation_failed",
        actual: result,
      };
    },
  },

  {
    name: "Confidence above one is rejected",
    run() {
      const result =
        parseSemanticClassifierOutput(
          JSON.stringify({
            ...validPayload,
            confidence: 1.4,
          })
        );

      return {
        passed:
          result.parsed === false &&
          result.reason ===
            "validation_failed" &&
          result.errors.some(
            (error) =>
              error.includes("confidence")
          ),
        actual: result,
      };
    },
  },

  {
    name: "Confidence below zero is rejected",
    run() {
      const result =
        parseSemanticClassifierOutput(
          JSON.stringify({
            ...validPayload,
            confidence: -0.2,
          })
        );

      return {
        passed:
          result.parsed === false &&
          result.reason ===
            "validation_failed",
        actual: result,
      };
    },
  },

  {
    name: "Invalid boolean is rejected",
    run() {
      const result =
        parseSemanticClassifierOutput(
          JSON.stringify({
            ...validPayload,
            moralConflict: "yes",
          })
        );

      return {
        passed:
          result.parsed === false &&
          result.reason ===
            "validation_failed" &&
          result.errors.some(
            (error) =>
              error.includes(
                "moralConflict"
              )
          ),
        actual: result,
      };
    },
  },

  {
    name: "Fence removal helper",
    run() {
      const output = stripJsonFence(
        '```json\n{"ok":true}\n```'
      );

      return {
        passed:
          output === '{"ok":true}',
        actual: output,
      };
    },
  },

  {
    name: "Classifier text extraction helper",
    run() {
      const output =
        extractClassifierText({
          reply: '{"ok":true}',
        });

      return {
        passed:
          output === '{"ok":true}',
        actual: output,
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
    console.log(
      "Actual:",
      result.actual
    );
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} parser test(s) failed.`
  );

  process.exit(1);
}

console.log(
  "\nAll semantic parser tests passed."
);