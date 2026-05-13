"use strict";

const { PERSON_ROLES, SAFE_STYLE_EXPRESSIONS } = require("./config");

function normalizeText(text = "") {
  return String(text || "").trim();
}

function extractPeopleFromMessage(message = "") {
  const text = normalizeText(message);
  const lower = text.toLowerCase();

  const found = [];

  for (const role of PERSON_ROLES) {
    if (lower.includes(role)) {
      found.push({
        role,
        alias: role,
        confidence: 0.75,
      });
    }
  }

  const namedBossMatch = text.match(/\b(?:my\s+)?(boss|manager|friend|coworker|girlfriend|boyfriend|wife|husband)\s+([A-Z][a-z]+)\b/);
  if (namedBossMatch) {
    found.push({
      role: namedBossMatch[1].toLowerCase(),
      name: namedBossMatch[2],
      alias: `my ${namedBossMatch[1].toLowerCase()}`,
      confidence: 0.9,
    });
  }

  return dedupePeople(found);
}

function dedupePeople(items = []) {
  const seen = new Map();

  for (const item of items) {
    const key = `${item.role || ""}:${(item.name || "").toLowerCase()}:${item.alias || ""}`;
    if (!seen.has(key)) seen.set(key, item);
  }

  return Array.from(seen.values());
}

function extractStyleExpressions(message = "") {
  const lower = normalizeText(message).toLowerCase();
  const found = [];

  for (const expr of SAFE_STYLE_EXPRESSIONS) {
    if (lower.includes(expr)) {
      found.push({
        text: expr,
        normalized: expr,
        confidence: 0.8,
        safeToMirror: true,
      });
    }
  }

  return found;
}

function hasAny(lower = "", terms = []) {
  return terms.some((term) => lower.includes(term));
}

function extractEmotionalContinuity(message = "") {
  const text = normalizeText(message);
  const lower = text.toLowerCase();

  const memories = [];

  const addMemory = ({
    type,
    key,
    label,
    value,
    tags = [],
    confidence = 0.72,
  }) => {
    memories.push({
      type,
      key,
      label,
      value,
      tags,
      confidence,
      safeToReference: true,
    });
  };

  const selfDoubtTerms = [
    "not good enough",
    "not enough",
    "not at par",
    "inferior",
    "less than",
    "they are better",
    "better than me",
    "i am wrong",
    "i'm wrong",
    "i failed",
    "i always fail",
    "i mess up",
    "i messed up",
    "i can't do anything right",
  ];

  const judgmentFearTerms = [
    "afraid to speak",
    "scared to speak",
    "afraid to share",
    "scared to share",
    "afraid of what they think",
    "judge me",
    "judged",
    "embarrassed",
    "humiliated",
    "ashamed",
    "my voice",
    "wrong words",
  ];

  const workPressureTerms = [
    "meeting",
    "presentation",
    "boss",
    "manager",
    "coworker",
    "work",
    "office",
    "job",
    "career",
  ];

  const familyStressTerms = [
    "family",
    "mother",
    "mom",
    "father",
    "dad",
    "parents",
    "home",
    "scolded",
    "shouted",
    "yelled",
  ];

  const belongingTerms = [
    "nobody likes me",
    "nobody cares",
    "unwanted",
    "left out",
    "alone",
    "lonely",
    "excluded",
    "not loved",
    "no one cares",
  ];

  const bullyingTerms = [
  "bullied",
  "mocked",
  "made fun of",
  "laughed at",
  "humiliated",
  "picked on",
  "excluded",
  "left out",
  "they ridicule me",
  "they insult me",
  "they embarrass me",
  "they gang up on me",
  "unsafe around them",
  "afraid of them",
  "intimidated",
  "they look down on me",
];

  const independenceTerms = [
    "move out",
    "own place",
    "own home",
    "independent",
    "personal space",
    "away from home",
    "leave home",
  ];

  const reliefTerms = [
    "thank you",
    "thanks",
    "helped",
    "feel lighter",
    "feel better",
    "clears my head",
    "calmer",
    "i feel okay",
    "i needed that",
  ];

  if (hasAny(lower, selfDoubtTerms)) {
    addMemory({
      type: "self_belief",
      key: "self_doubt_under_pressure",
      label: "self-doubt under pressure",
      value:
        "User may become self-critical or feel not good enough when under emotional pressure.",
      tags: ["self_doubt", "confidence", "pressure"],
      confidence: 0.78,
    });
  }

  if (hasAny(lower, judgmentFearTerms)) {
    addMemory({
      type: "emotional_pattern",
      key: "fear_of_being_judged",
      label: "fear of being judged",
      value:
        "User may hold back when worried about being judged, embarrassed, or misunderstood.",
      tags: ["judgment", "confidence", "speaking_up"],
      confidence: 0.76,
    });
  }

  if (hasAny(lower, workPressureTerms) && hasAny(lower, selfDoubtTerms.concat(judgmentFearTerms))) {
    addMemory({
      type: "recurring_stressor",
      key: "work_confidence_pressure",
      label: "work confidence pressure",
      value:
        "Work situations may trigger confidence pressure, especially when the user feels watched, evaluated, or expected to perform.",
      tags: ["work", "confidence", "performance_pressure"],
      confidence: 0.78,
    });
  }

  if (hasAny(lower, familyStressTerms)) {
    addMemory({
      type: "recurring_stressor",
      key: "family_environment_stress",
      label: "family or home stress",
      value:
        "Family or home environment may strongly affect user's emotional state.",
      tags: ["family", "home", "emotional_trigger"],
      confidence: 0.74,
    });
  }

  if (hasAny(lower, belongingTerms)) {
    addMemory({
      type: "emotional_pattern",
      key: "belonging_and_care_wound",
      label: "belonging and care wound",
      value:
        "User may sometimes feel unwanted, uncared for, or outside the circle.",
      tags: ["belonging", "loneliness", "care"],
      confidence: 0.78,
    });
  }

  if (hasAny(lower, independenceTerms)) {
    addMemory({
      type: "growth_goal",
      key: "desire_for_independence",
      label: "desire for independence",
      value:
        "User may want more independence, personal space, or emotional distance from stressful environments.",
      tags: ["independence", "space", "growth"],
      confidence: 0.76,
    });
  }

  if (hasAny(lower, reliefTerms)) {
    addMemory({
      type: "support_preference",
      key: "responds_to_calm_reframing",
      label: "responds to calm reframing",
      value:
        "User seems to respond well to calm reflection, reassurance, and gentle reframing.",
      tags: ["support_style", "reframing", "calm"],
      confidence: 0.72,
    });
  }

  if (hasAny(lower, bullyingTerms)) {
  addMemory({
    type: "recurring_stressor",
    key: "social_humiliation_or_intimidation",
    label: "social humiliation or intimidation",
    value:
      "User may carry emotional stress related to humiliation, intimidation, exclusion, ridicule, or unsafe social environments.",
    tags: [
      "social_pressure",
      "bullying",
      "humiliation",
      "fear",
      "belonging",
    ],
    confidence: 0.8,
  });
}

  return memories;
}

module.exports = {
  extractPeopleFromMessage,
  extractStyleExpressions,
  extractEmotionalContinuity,
};