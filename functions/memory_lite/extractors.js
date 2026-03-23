// functions/memory/extractors.js

const {
  MEMORY_TYPES,
  MEMORY_SOURCES,
  MEMORY_TIERS,
} = require("./types");

const RELATIONSHIP_TAGS = {
  girlfriend: ["relationship", "partner"],
  boyfriend: ["relationship", "partner"],
  wife: ["relationship", "partner"],
  husband: ["relationship", "partner"],

  mother: ["family"],
  father: ["family"],
  mom: ["family"],
  dad: ["family"],
  daughter: ["family"],
  son: ["family"],
  sister: ["family"],
  brother: ["family"],
  aunt: ["family"],
  uncle: ["family"],
  cousin: ["family"],
  grandma: ["family"],
  grandpa: ["family"],
  grandmother: ["family"],
  grandfather: ["family"],
  niece: ["family"],
  nephew: ["family"],

  "best friend": ["friend"],
  friend: ["friend"],
  neighbor: ["neighbor"],
  roommate: ["home"],

  coworker: ["work", "coworker"],
  colleague: ["work", "coworker"],
  boss: ["work"],
  manager: ["work"],
  teammate: ["team"],
  classmate: ["school"],
};

function cleanName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function extractPeopleMemories(text) {
  const candidates = [];
  const input = String(text || "");

const patterns = [
  { regex: /my girlfriend is ([A-Za-z][A-Za-z' -]+)/i, relationship: "girlfriend", tier: MEMORY_TIERS.CORE, tags: ["relationship", "partner"] },
  { regex: /my boyfriend is ([A-Za-z][A-Za-z' -]+)/i, relationship: "boyfriend", tier: MEMORY_TIERS.CORE, tags: ["relationship", "partner"] },
  { regex: /my wife is ([A-Za-z][A-Za-z' -]+)/i, relationship: "wife", tier: MEMORY_TIERS.CORE, tags: ["relationship", "partner"] },
  { regex: /my husband is ([A-Za-z][A-Za-z' -]+)/i, relationship: "husband", tier: MEMORY_TIERS.CORE, tags: ["relationship", "partner"] },

  { regex: /my mother is ([A-Za-z][A-Za-z' -]+)/i, relationship: "mother", tier: MEMORY_TIERS.CORE, tags: ["family"] },
  { regex: /my father is ([A-Za-z][A-Za-z' -]+)/i, relationship: "father", tier: MEMORY_TIERS.CORE, tags: ["family"] },
  { regex: /my mom is ([A-Za-z][A-Za-z' -]+)/i, relationship: "mom", tier: MEMORY_TIERS.CORE, tags: ["family"] },
  { regex: /my dad is ([A-Za-z][A-Za-z' -]+)/i, relationship: "dad", tier: MEMORY_TIERS.CORE, tags: ["family"] },
  { regex: /my daughter is ([A-Za-z][A-Za-z' -]+)/i, relationship: "daughter", tier: MEMORY_TIERS.CORE, tags: ["family"] },
  { regex: /my son is ([A-Za-z][A-Za-z' -]+)/i, relationship: "son", tier: MEMORY_TIERS.CORE, tags: ["family"] },

  { regex: /my sister is ([A-Za-z][A-Za-z' -]+)/i, relationship: "sister", tier: MEMORY_TIERS.IMPORTANT, tags: ["family"] },
  { regex: /my brother is ([A-Za-z][A-Za-z' -]+)/i, relationship: "brother", tier: MEMORY_TIERS.IMPORTANT, tags: ["family"] },
  { regex: /my aunt is ([A-Za-z][A-Za-z' -]+)/i, relationship: "aunt", tier: MEMORY_TIERS.IMPORTANT, tags: ["family"] },
  { regex: /my uncle is ([A-Za-z][A-Za-z' -]+)/i, relationship: "uncle", tier: MEMORY_TIERS.IMPORTANT, tags: ["family"] },
  { regex: /my cousin is ([A-Za-z][A-Za-z' -]+)/i, relationship: "cousin", tier: MEMORY_TIERS.IMPORTANT, tags: ["family"] },
  { regex: /my grandma is ([A-Za-z][A-Za-z' -]+)/i, relationship: "grandma", tier: MEMORY_TIERS.IMPORTANT, tags: ["family"] },
  { regex: /my grandpa is ([A-Za-z][A-Za-z' -]+)/i, relationship: "grandpa", tier: MEMORY_TIERS.IMPORTANT, tags: ["family"] },
  { regex: /my grandmother is ([A-Za-z][A-Za-z' -]+)/i, relationship: "grandmother", tier: MEMORY_TIERS.IMPORTANT, tags: ["family"] },
  { regex: /my grandfather is ([A-Za-z][A-Za-z' -]+)/i, relationship: "grandfather", tier: MEMORY_TIERS.IMPORTANT, tags: ["family"] },
  { regex: /my niece is ([A-Za-z][A-Za-z' -]+)/i, relationship: "niece", tier: MEMORY_TIERS.IMPORTANT, tags: ["family"] },
  { regex: /my nephew is ([A-Za-z][A-Za-z' -]+)/i, relationship: "nephew", tier: MEMORY_TIERS.IMPORTANT, tags: ["family"] },

  { regex: /my best friend is ([A-Za-z][A-Za-z' -]+)/i, relationship: "best friend", tier: MEMORY_TIERS.IMPORTANT, tags: ["friend"] },
  { regex: /my friend is ([A-Za-z][A-Za-z' -]+)/i, relationship: "friend", tier: MEMORY_TIERS.IMPORTANT, tags: ["friend"] },
  { regex: /my neighbor is ([A-Za-z][A-Za-z' -]+)/i, relationship: "neighbor", tier: MEMORY_TIERS.IMPORTANT, tags: ["neighbor"] },
  { regex: /my roommate is ([A-Za-z][A-Za-z' -]+)/i, relationship: "roommate", tier: MEMORY_TIERS.IMPORTANT, tags: ["home"] },

  { regex: /my coworker is ([A-Za-z][A-Za-z' -]+)/i, relationship: "coworker", tier: MEMORY_TIERS.IMPORTANT, tags: ["work", "coworker"] },
  { regex: /my colleague is ([A-Za-z][A-Za-z' -]+)/i, relationship: "colleague", tier: MEMORY_TIERS.IMPORTANT, tags: ["work", "coworker"] },
  { regex: /my boss is ([A-Za-z][A-Za-z' -]+)/i, relationship: "boss", tier: MEMORY_TIERS.IMPORTANT, tags: ["work"] },
  { regex: /my manager is ([A-Za-z][A-Za-z' -]+)/i, relationship: "manager", tier: MEMORY_TIERS.IMPORTANT, tags: ["work"] },
  { regex: /my teammate is ([A-Za-z][A-Za-z' -]+)/i, relationship: "teammate", tier: MEMORY_TIERS.IMPORTANT, tags: ["team"] },
  { regex: /my classmate is ([A-Za-z][A-Za-z' -]+)/i, relationship: "classmate", tier: MEMORY_TIERS.IMPORTANT, tags: ["school"] },
];

  for (const p of patterns) {
    const match = input.match(p.regex);
    if (!match) continue;

    const personName = cleanName(match[1]);
    const key = `person_${personName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

    candidates.push({
      type: MEMORY_TYPES.PERSON,
      key,
      value: `${personName} is the user's ${p.relationship}`,
      source: MEMORY_SOURCES.USER_EXPLICIT,
      tier: p.tier,
      confidence: 0.98,
      importance: p.tier === MEMORY_TIERS.CORE ? 0.95 : 0.85,
      tags: [...p.tags, personName],
    });
  }

  // Contextual person facts:
  // "Mark is my coworker in finance"
  const contextualMatch = input.match(
    /([A-Za-z][A-Za-z' -]+)\s+is my\s+(girlfriend|boyfriend|wife|husband|mother|father|mom|dad|daughter|son|sister|brother|aunt|uncle|cousin|grandma|grandpa|grandmother|grandfather|niece|nephew|best friend|friend|neighbor|roommate|coworker|colleague|boss|manager|teammate|classmate)(.*)/i
);

  if (contextualMatch) {
    const personName = cleanName(contextualMatch[1]);
    const relationship = contextualMatch[2].toLowerCase();
    const extra = String(contextualMatch[3] || "").trim();
    const key = `person_${personName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

    let tier = MEMORY_TIERS.IMPORTANT;
    if (
  [
    "girlfriend",
    "boyfriend",
    "wife",
    "husband",
    "mother",
    "father",
    "mom",
    "dad",
    "daughter",
    "son",
  ].includes(relationship)
) {
  tier = MEMORY_TIERS.CORE;
}

    candidates.push({
  type: MEMORY_TYPES.PERSON,
  key,
  value: extra
  ? `${personName} is the user's ${relationship} ${extra.trim()}`.trim()
  : `${personName} is the user's ${relationship}`,
  source: MEMORY_SOURCES.USER_EXPLICIT,
  tier,
  confidence: 0.98,
  importance: tier === MEMORY_TIERS.CORE ? 0.95 : 0.85,
  tags: [...(RELATIONSHIP_TAGS[relationship] || []), relationship, personName],
});
  }

  return candidates;
}

function extractPreferenceMemories(text) {
  const lower = String(text || "").toLowerCase();
  const candidates = [];

  if (
    lower.includes("i prefer short replies") ||
    lower.includes("keep replies short") ||
    lower.includes("i like short replies")
  ) {
    candidates.push({
      type: MEMORY_TYPES.PREFERENCE,
      key: "reply_style_short",
      value: "User prefers short replies",
      source: MEMORY_SOURCES.USER_EXPLICIT,
      tier: MEMORY_TIERS.IMPORTANT,
      confidence: 0.95,
      importance: 0.8,
      tags: ["tone", "communication"],
    });
  }

  if (
    lower.includes("i prefer calm replies") ||
    lower.includes("be calm") ||
    lower.includes("calm tone")
  ) {
    candidates.push({
      type: MEMORY_TYPES.PREFERENCE,
      key: "reply_style_calm",
      value: "User prefers calm replies",
      source: MEMORY_SOURCES.USER_EXPLICIT,
      tier: MEMORY_TIERS.IMPORTANT,
      confidence: 0.9,
      importance: 0.8,
      tags: ["tone", "communication"],
    });
  }

  return candidates;
}

function extractRoutineMemories(text) {
  const lower = String(text || "").toLowerCase();
  const candidates = [];

  if (lower.includes("bone broth") && (lower.includes("morning") || lower.includes("7am"))) {
    candidates.push({
      type: MEMORY_TYPES.ROUTINE,
      key: "morning_bone_broth",
      value: "User drinks bone broth in the morning",
      source: MEMORY_SOURCES.USER_EXPLICIT,
      tier: MEMORY_TIERS.IMPORTANT,
      confidence: 0.92,
      importance: 0.82,
      tags: ["health", "morning", "routine"],
    });
  }

  if (lower.includes("gym") && (lower.includes("every monday") || lower.includes("mon"))) {
    candidates.push({
      type: MEMORY_TYPES.ROUTINE,
      key: "gym_monday_routine",
      value: "User has a Monday gym routine",
      source: MEMORY_SOURCES.USER_EXPLICIT,
      tier: MEMORY_TIERS.IMPORTANT,
      confidence: 0.88,
      importance: 0.8,
      tags: ["fitness", "routine", "monday"],
    });
  }

  return candidates;
}

function extractGoalMemories(text) {
  const lower = String(text || "").toLowerCase();
  const candidates = [];

  if (lower.includes("i want to lose weight")) {
    candidates.push({
      type: MEMORY_TYPES.GOAL,
      key: "fitness_lose_weight",
      value: "User wants to lose weight",
      source: MEMORY_SOURCES.USER_EXPLICIT,
      tier: MEMORY_TIERS.IMPORTANT,
      confidence: 0.95,
      importance: 0.85,
      tags: ["fitness", "goal"],
    });
  }

  if (lower.includes("i want to save money")) {
    candidates.push({
      type: MEMORY_TYPES.GOAL,
      key: "finance_save_money",
      value: "User wants to save money",
      source: MEMORY_SOURCES.USER_EXPLICIT,
      tier: MEMORY_TIERS.IMPORTANT,
      confidence: 0.95,
      importance: 0.85,
      tags: ["finance", "goal"],
    });
  }

  return candidates;
}

function extractMemoryCandidates(userText) {
  return [
    ...extractPeopleMemories(userText),
    ...extractPreferenceMemories(userText),
    ...extractRoutineMemories(userText),
    ...extractGoalMemories(userText),
  ];
}

module.exports = {
  extractPeopleMemories,
  extractPreferenceMemories,
  extractRoutineMemories,
  extractGoalMemories,
  extractMemoryCandidates,
};