"use strict";

const {
  CORE_IDENTITY_PROMPT,
  TALKIO_SOUL_LAYER,
  RELATIONAL_INTELLIGENCE_LAYER,
  HUMAN_REALISM_LAYER,
  REASONING_LAYER,
  OBSERVATION_LAYER,
  WISDOM_LAYER,
  HUMAN_EXPERIENCE_LAYER,
  MORAL_REFLECTION_LAYER,
  NERVOUS_SYSTEM_REGULATION_LAYER,
  JUDGMENT_ENGINE,
  TRUST_SAFE_MODE_PROMPT,
} = require("./prompts");

const PROMPTS = Object.freeze({
  coreIdentity: CORE_IDENTITY_PROMPT,
  talkioSoul: TALKIO_SOUL_LAYER,
  reasoning: REASONING_LAYER,
  observation: OBSERVATION_LAYER,
  wisdom: WISDOM_LAYER,
  humanExperience: HUMAN_EXPERIENCE_LAYER,
  moralReflection: MORAL_REFLECTION_LAYER,
  nervousSystem: NERVOUS_SYSTEM_REGULATION_LAYER,
  judgment: JUDGMENT_ENGINE,
  trustSafe: TRUST_SAFE_MODE_PROMPT,
  relationalIntelligence: RELATIONAL_INTELLIGENCE_LAYER,
  humanRealism: HUMAN_REALISM_LAYER,
  
});

const PROMPT_ORDER = [
  "coreIdentity",
  "talkioSoul",
  "reasoning",
  "observation",
  "wisdom",
  "humanExperience",
  "moralReflection",
  "nervousSystem",
  "judgment",
  "trustSafe",
  "relationalIntelligence",
  "humanRealism" 
];

function buildPrompt(capabilities = []) {
  if (!Array.isArray(capabilities)) {
    throw new TypeError("buildPrompt expected capabilities to be an array");
  }

  const unknownCapabilities = capabilities.filter(
    (name) => !Object.prototype.hasOwnProperty.call(PROMPTS, name)
  );

  if (unknownCapabilities.length > 0) {
    console.warn("unknown_prompt_capabilities", {
      capabilities: unknownCapabilities,
    });
  }

  // 1. Deduplicate requested capabilities
  const uniqueCapabilities = [...new Set(capabilities)];

  // 2. Sort them according to our strict PROMPT_ORDER
  const sortedCapabilities = uniqueCapabilities.sort((a, b) => {
    const indexA = PROMPT_ORDER.indexOf(a);
    const indexB = PROMPT_ORDER.indexOf(b);
    
    // If somehow a capability isn't in PROMPT_ORDER, push it to the top so it doesn't override the ending voice.
    if (indexA === -1) return -1;
    if (indexB === -1) return 1;
    
    return indexA - indexB;
  });

  // 3. Map to text, filter empty, and join
  return sortedCapabilities
    .map((name) => PROMPTS[name])
    .filter(
      (prompt) => typeof prompt === "string" && prompt.trim().length > 0
    )
    .join("\n\n")
    .trim();
}

module.exports = {
  buildPrompt,
};