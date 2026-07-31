"use strict";

const {
  detectCapabilities,
} = require("./router");

const tests = [
  {
    name: "Greeting",
    input: {
      userMessage: "Hey",
      conversation: [],
      memory: {},
    },
    expected: [
      "coreIdentity",
      "talkioSoul",
      "humanRealism",
    ],
  },

  {
    name: "Judgment",
    input: {
      userMessage: "What should I do about my dad?",
      conversation: [],
      memory: {},
    },
    expected: [
      "coreIdentity",
      "talkioSoul",
      "humanRealism",
      "reasoning",
      "judgment",
    ],
  },

  {
    name: "Nervous system",
    input: {
      userMessage:
        "My chest feels tight and I can't calm down.",
      conversation: [],
      memory: {},
    },
    expected: [
      "coreIdentity",
      "talkioSoul",
      "humanRealism",
      "nervousSystem",
    ],
  },

  {
  name: "Moral reflection",
  input: {
    userMessage:
      "I cheated on my partner and I know it was wrong. What should I do?",
    conversation: [],
    memory: {},
  },
  expected: [
    "coreIdentity",
    "talkioSoul",
    "humanRealism",
    "reasoning",
    "judgment",
    "moralReflection",
  ],
},

{
  name: "Ordinary relationship conflict",
  input: {
    userMessage:
      "My partner and I argued about money last night.",
    conversation: [],
    memory: {},
  },
  expected: [
    "coreIdentity",
    "talkioSoul",
    "humanRealism",
  ],
}, 
  {
  name: "Moral statement without decision",
  input: {
    userMessage:
      "I lied to my wife and I feel guilty.",
    conversation: [],
    memory: {},
  },
  expected: [
    "coreIdentity",
    "talkioSoul",
    "humanRealism",
    "moralReflection",
  ],
},

{
  name: "Not every mistake is moral reflection",
  input: {
    userMessage:
      "I made a mistake in my spreadsheet.",
    conversation: [],
    memory: {},
  },
  expected: [
    "coreIdentity",
    "talkioSoul",
    "humanRealism",
  ],
},

  {
    name: "Ongoing relational conversation",
    input: {
      userMessage:
        "I'm doing a little better today.",
      conversation: [
        {
          role: "user",
          content:
            "Moving has been difficult.",
        },
        {
          role: "assistant",
          content:
            "How are you settling in?",
        },
      ],
      memory: {},
    },
    expected: [
      "coreIdentity",
      "talkioSoul",
      "humanRealism",
      "relationalIntelligence",
    ],
  },

  {
    name: "Trust and privacy",
    input: {
      userMessage:
        "Why should I trust you with this?",
      conversation: [],
      memory: {},
    },
    expected: [
      "coreIdentity",
      "talkioSoul",
      "humanRealism",
      "trustSafe",
    ],
  },

  {
    name: "Observation and wisdom",
    input: {
      userMessage:
        "Why do I always do this?",
      conversation: [
        {
          role: "user",
          content:
            "I keep avoiding the conversation.",
        },
        {
          role: "assistant",
          content:
            "What makes you pull back?",
        },
        {
          role: "user",
          content:
            "I worry they will be angry.",
        },
        {
          role: "assistant",
          content:
            "So conflict feels risky.",
        },
      ],
      memory: {},
    },
    expected: [
      "coreIdentity",
      "talkioSoul",
      "humanRealism",
      "reasoning",
      "observation",
      "relationalIntelligence",
      "wisdom",
    ],
  },
];

let failures = 0;

for (const test of tests) {
  const actual =
    detectCapabilities(test.input);

  const passed =
    JSON.stringify(actual) ===
    JSON.stringify(test.expected);

  console.log(
    `\n${passed ? "✅" : "❌"} ${test.name}`
  );

  console.log("Actual:  ", actual);
  console.log("Expected:", test.expected);

  if (!passed) {
    failures += 1;
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} routing test(s) failed.`
  );

  process.exit(1);
}

console.log(
  "\nAll routing tests passed."
);