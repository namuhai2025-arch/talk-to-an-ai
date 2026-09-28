"use strict";

const {
  shouldConsultSemanticAssistant,
} = require("./semanticAssistantGate");

const BASE = [
  "coreIdentity",
  "talkioSoul",
  "humanRealism",
];

const tests = [
  {
    name: "Empty message",
    input: {
      userMessage: "",
      v3Capabilities: BASE,
    },
    expected: false,
  },

  {
    name: "Greeting",
    input: {
      userMessage: "Hi",
      v3Capabilities: BASE,
    },
    expected: false,
  },

  {
    name: "Judgment already found",
    input: {
      userMessage: "What should I do?",
      v3Capabilities: [
        ...BASE,
        "reasoning",
        "judgment",
      ],
    },
    expected: false,
  },

  {
    name: "Nervous system already found",
    input: {
      userMessage:
        "I'm panicking.",
      v3Capabilities: [
        ...BASE,
        "nervousSystem",
      ],
    },
    expected: false,
  },

  {
    name: "Relational conversation",
    input: {
      userMessage:
        "I'm feeling a little better today.",
      v3Capabilities: [
        ...BASE,
        "relationalIntelligence",
      ],
    },
    expected: false,
  },

  {
    name: "Taglish",
    input: {
      userMessage:
        "Hindi ko alam if tama pa ba ginagawa ko.",
      v3Capabilities: BASE,
      languageMeta: {
        mixed: true,
        detectedLanguages: [
          "tl",
          "en",
        ],
      },
    },
    expected: true,
  },

  {
    name: "Bisaya",
    input: {
      userMessage:
        "Wala na gyud ko kabalo unsay sakto buhaton.",
      v3Capabilities: BASE,
      languageMeta: {
        detectedLanguages: [
          "ceb",
        ],
      },
    },
    expected: true,
  },

  {
    name: "Indirect English",
    input: {
      userMessage:
        "Part of me wants to stay but another part thinks leaving may be healthier.",
      v3Capabilities: BASE,
    },
    expected: true,
  },

  {
    name: "Short ordinary message",
    input: {
      userMessage: "Thanks.",
      v3Capabilities: BASE,
    },
    expected: false,
  },

  {
    name: "Duplicate capabilities",
    input: {
      userMessage:
        "Should I leave?",
      v3Capabilities: [
        "coreIdentity",
        "coreIdentity",
        "talkioSoul",
        "humanRealism",
      ],
    },
    expected: false,
  },
];

let failures = 0;

for (const test of tests) {
  const result =
    shouldConsultSemanticAssistant(
      test.input
    );

  const passed =
    result.consult === test.expected;

  console.log(
    `\n${passed ? "✅" : "❌"} ${test.name}`
  );

  console.log(result);

  if (!passed) {
    failures++;
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} test(s) failed.`
  );
  process.exit(1);
}

console.log(
  "\nAll semantic assistant gate tests passed."
);