"use strict";

/**
 * Builds a small multilingual user-state classification prompt.
 * Keep this short to reduce token cost.
 */

function buildUserStateClassifierPrompt(message = "") {
  return `
Analyze the user's message and return JSON only.

User message:
"${String(message).trim()}"

Return exactly this JSON shape:
{
  "intent": "venting|advice|comfort|casual|playful|testing|withdrawn|unclear",
  "energy": "low|normal|high|chaotic",
  "intensity": "low|medium|high",
  "asksWhatToDo": true,
  "overwhelmed": false,
  "shortInput": false,
  "lowEnergy": false
}

Rules:
- Detect meaning, not keywords
- Work across any language
- If uncertain, choose the closest valid label
- Output valid JSON only
- No markdown
- No explanation
`.trim();
}

module.exports = {
  buildUserStateClassifierPrompt,
};