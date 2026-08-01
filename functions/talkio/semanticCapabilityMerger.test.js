"use strict";

const {
  mergeSemanticCapabilities,
} = require(
  "./semanticCapabilityMerger"
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(name, fn) {
  try {
    fn();
    console.log(`\n✅ ${name}`);
  } catch (error) {
    console.error(`\n❌ ${name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

const BASE = [
  "coreIdentity",
  "talkioSoul",
  "humanRealism",
];

run(
  "Preserves V3 capabilities",
  () => {
    const result =
      mergeSemanticCapabilities({
        v3Capabilities: BASE,
      });

    assert(
      JSON.stringify(
        result.finalCapabilities
      ) === JSON.stringify(BASE),
      "V3 capabilities changed."
    );

    assert(
      result.promoted === false,
      "Semantic capabilities must not be promoted yet."
    );
  }
);

run(
  "Does not promote semantic additions",
  () => {
    const result =
      mergeSemanticCapabilities({
        v3Capabilities: BASE,
        semanticResult: {
          consulted: true,
          semanticCapabilities: [
            "reasoning",
            "judgment",
          ],
        },
      });

    assert(
      !result.finalCapabilities.includes(
        "reasoning"
      ),
      "Reasoning was promoted too early."
    );

    assert(
      !result.finalCapabilities.includes(
        "judgment"
      ),
      "Judgment was promoted too early."
    );

    assert(
      result.reason ===
        "semantic_observed_only",
      "Unexpected merger reason."
    );
  }
);

run(
  "Removes duplicate V3 capabilities",
  () => {
    const result =
      mergeSemanticCapabilities({
        v3Capabilities: [
          ...BASE,
          "coreIdentity",
        ],
      });

    assert(
      result.finalCapabilities.length ===
        BASE.length,
      "Duplicate capabilities remain."
    );
  }
);

run(
  "Handles invalid inputs safely",
  () => {
    const result =
      mergeSemanticCapabilities({
        v3Capabilities: null,
        semanticResult: {
          semanticCapabilities:
            "judgment",
        },
      });

    assert(
      Array.isArray(
        result.finalCapabilities
      ),
      "Expected an array."
    );

    assert(
      result.finalCapabilities.length === 0,
      "Invalid input should produce an empty capability list."
    );
  }
);

if (process.exitCode) {
  console.error(
    "\nSemantic capability merger tests failed."
  );
} else {
  console.log(
    "\nAll semantic capability merger tests passed."
  );
}