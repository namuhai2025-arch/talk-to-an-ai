"use strict";

const {
  CORE_IDENTITY_PROMPT,
  TALKIO_SOUL_LAYER,
  RELATIONAL_INTELLIGENCE_LAYER,
  HUMAN_REALISM_LAYER,
  REASONING_LAYER,
  OBSERVATION_LAYER,
  WISDOM_LAYER,
  NERVOUS_SYSTEM_REGULATION_LAYER,
  JUDGMENT_ENGINE,
  TRUST_SAFE_MODE_PROMPT,
} = require("./prompts");

const PROMPTS = Object.freeze({
  coreIdentity: CORE_IDENTITY_PROMPT,
  talkioSoul: TALKIO_SOUL_LAYER,
  humanRealism: HUMAN_REALISM_LAYER,
  relationalIntelligence: RELATIONAL_INTELLIGENCE_LAYER,
  reasoning: REASONING_LAYER,
  observation: OBSERVATION_LAYER,
  wisdom: WISDOM_LAYER,
  nervousSystem: NERVOUS_SYSTEM_REGULATION_LAYER,
  judgment: JUDGMENT_ENGINE,
  trustSafe: TRUST_SAFE_MODE_PROMPT,
});

function buildPrompt(capabilities = []) {
  if (!Array.isArray(capabilities)) {
    throw new TypeError(
      "buildPrompt expected capabilities to be an array"
    );
  }

  const unknownCapabilities = capabilities.filter(
    (name) => !Object.prototype.hasOwnProperty.call(PROMPTS, name)
  );

  if (unknownCapabilities.length > 0) {
    console.warn("unknown_prompt_capabilities", {
      capabilities: unknownCapabilities,
    });
  }

  return [...new Set(capabilities)]
    .map((name) => PROMPTS[name])
    .filter(
      (prompt) =>
        typeof prompt === "string" &&
        prompt.trim().length > 0
    )
    .join("\n\n")
    .trim();
}

module.exports = {
  buildPrompt,
};