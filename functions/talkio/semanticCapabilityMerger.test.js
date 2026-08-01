"use strict";

const {
  SEMANTIC_PROMOTION_THRESHOLD,
  mergeSemanticCapabilities,
} = require(
  "./semanticCapabilityMerger"
);

function assert(
  condition,
  message
) {
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
  "Uses 0.95 promotion threshold",
  () => {
    assert(
      SEMANTIC_PROMOTION_THRESHOLD ===
        0.95,
      "Unexpected promotion threshold."
    );
  }
);

run(
  "Preserves V3 when not consulted",
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
      "Unexpected promotion."
    );

    assert(
      result.reason ===
        "semantic_not_consulted",
      "Unexpected reason."
    );
  }
);

run(
  "Does not promote unparsed result",
  () => {
    const result =
      mergeSemanticCapabilities({
        v3Capabilities: BASE,
        semanticResult: {
          consulted: true,
          parsed: false,
          semanticSignals: {
            confidence: 0.99,
          },
          semanticCapabilities: [
            "reasoning",
          ],
        },
      });

    assert(
      result.promoted === false,
      "Unparsed result was promoted."
    );

    assert(
      result.reason ===
        "semantic_not_parsed",
      "Unexpected reason."
    );
  }
);

run(
  "Does not promote below 0.95",
  () => {
    const result =
      mergeSemanticCapabilities({
        v3Capabilities: BASE,
        semanticResult: {
          consulted: true,
          parsed: true,
          semanticSignals: {
            confidence: 0.94,
          },
          semanticCapabilities: [
            "reasoning",
          ],
        },
      });

    assert(
      result.promoted === false,
      "Low-confidence result was promoted."
    );

    assert(
      !result.finalCapabilities
        .includes("reasoning"),
      "Reasoning was added below threshold."
    );

    assert(
      result.reason ===
        "semantic_confidence_below_threshold",
      "Unexpected reason."
    );
  }
);

run(
  "Promotes approved capability at 0.95",
  () => {
    const result =
      mergeSemanticCapabilities({
        v3Capabilities: BASE,
        semanticResult: {
          consulted: true,
          parsed: true,
          semanticSignals: {
            confidence: 0.95,
          },
          semanticCapabilities: [
            "reasoning",
          ],
        },
      });

    assert(
      result.promoted === true,
      "Approved capability was not promoted."
    );

    assert(
      result.finalCapabilities
        .includes("reasoning"),
      "Reasoning was not added."
    );

    assert(
      result.addedCapabilities
        .includes("reasoning"),
      "Added capability was not recorded."
    );
  }
);

run(
  "Promotes multiple approved capabilities",
  () => {
    const result =
      mergeSemanticCapabilities({
        v3Capabilities: BASE,
        semanticResult: {
          consulted: true,
          parsed: true,
          semanticSignals: {
            confidence: 0.98,
          },
          semanticCapabilities: [
            "reasoning",
            "observation",
            "wisdom",
          ],
        },
      });

    assert(
      result.promoted === true,
      "Approved additions were not promoted."
    );

    assert(
      result.addedCapabilities
        .length === 3,
      "Unexpected number of additions."
    );
  }
);

run(
  "Rejects unapproved strong capabilities",
  () => {
    const result =
      mergeSemanticCapabilities({
        v3Capabilities: BASE,
        semanticResult: {
          consulted: true,
          parsed: true,
          semanticSignals: {
            confidence: 0.99,
          },
          semanticCapabilities: [
            "judgment",
            "moralReflection",
            "nervousSystem",
            "trustSafe",
          ],
        },
      });

    assert(
      result.promoted === false,
      "Unapproved capability was promoted."
    );

    assert(
      JSON.stringify(
        result.finalCapabilities
      ) === JSON.stringify(BASE),
      "V3 result was altered."
    );

    assert(
      result.reason ===
        "no_approved_semantic_additions",
      "Unexpected reason."
    );
  }
);

run(
  "Never removes V3 capabilities",
  () => {
    const v3Capabilities = [
      ...BASE,
      "judgment",
    ];

    const result =
      mergeSemanticCapabilities({
        v3Capabilities,
        semanticResult: {
          consulted: true,
          parsed: true,
          semanticSignals: {
            confidence: 0.99,
          },
          semanticCapabilities: [
            "wisdom",
          ],
        },
      });

    assert(
      result.finalCapabilities
        .includes("judgment"),
      "V3 judgment capability was removed."
    );

    assert(
      result.finalCapabilities
        .includes("wisdom"),
      "Approved V4 capability was not added."
    );
  }
);

run(
  "Removes duplicate capabilities",
  () => {
    const result =
      mergeSemanticCapabilities({
        v3Capabilities: [
          ...BASE,
          "coreIdentity",
        ],
        semanticResult: {
          consulted: true,
          parsed: true,
          semanticSignals: {
            confidence: 0.99,
          },
          semanticCapabilities: [
            "reasoning",
            "reasoning",
          ],
        },
      });

    assert(
      result.finalCapabilities
        .filter(
          (capability) =>
            capability === "reasoning"
        ).length === 1,
      "Duplicate semantic capabilities remain."
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
          consulted: true,
          parsed: true,
          semanticSignals: {
            confidence: "high",
          },
          semanticCapabilities:
            "reasoning",
        },
      });

    assert(
      Array.isArray(
        result.finalCapabilities
      ),
      "Expected an array."
    );

    assert(
      result.promoted === false,
      "Invalid result was promoted."
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