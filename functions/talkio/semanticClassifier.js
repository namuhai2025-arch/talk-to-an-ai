"use strict";

/*
|--------------------------------------------------------------------------
| V4 Semantic Classifier
|--------------------------------------------------------------------------
|
| Produces language-independent semantic routing signals.
|
| This module:
| - reuses the existing modelGenerate dependency
| - returns raw model output for the strict parser
| - does not map or merge capabilities
| - does not alter the user-facing reply
|
*/

const SEMANTIC_CLASSIFIER_PROMPT = `
You are a routing classifier.

Analyze the meaning of the user's latest message,
regardless of language, dialect, slang, spelling, or language mixing.

Return exactly one valid JSON object.

Do not include markdown.
Do not include code fences.
Do not include commentary.
Do not reply to the user.

Use this exact schema:

{
  "detectedLanguage": "string",
  "isMixedLanguage": false,
  "asksForDecision": false,
  "asksForExplanation": false,
  "emotionalOverload": false,
  "moralConflict": false,
  "trustConcern": false,
  "patternReflection": false,
  "relationalContext": false,
  "confidence": 0.0
}

Definitions:

- detectedLanguage:
  Best short language code when reasonably known.
  Examples: "en", "tl", "ceb", "es", "fr", "ar".
  Use "unknown" when uncertain.

- isMixedLanguage:
  True when the user naturally combines multiple languages.

- asksForDecision:
  True when the user wants help choosing what to do,
  even when the request is indirect.

- asksForExplanation:
  True when the user wants to understand why something happened,
  what something means, or how to interpret it.

- emotionalOverload:
  True only when the user appears emotionally flooded,
  panicked, spiraling, unable to settle, or severely overwhelmed.
  Ordinary tiredness, sadness, or frustration is not enough.

- moralConflict:
  True when the message meaningfully concerns honesty,
  betrayal, cruelty, exploitation, responsibility, wrongdoing,
  guilt about harming someone, or a serious ethical choice.
  Ordinary disagreement or harmless mistakes are not enough.

- trustConcern:
  True when the user questions privacy, confidentiality,
  data use, safety, or whether the system can be trusted.

- patternReflection:
  True when the user is asking about a recurring personal pattern,
  repeated behavior, or why the same situation keeps happening.

- relationalContext:
  True when understanding an ongoing relationship or prior
  conversation context materially improves the response.

- confidence:
  A number from 0 to 1 representing confidence in the classification.

Be conservative.

Do not infer severe distress, wrongdoing, or moral conflict
from weak or ambiguous language.

Return JSON only.
`.trim();

function normalizeClassifierMessage(
  userMessage = ""
) {
  return String(userMessage || "")
    .trim()
    .slice(0, 4000);
}

async function classifySemanticSignals({
  userMessage = "",
  languageMeta = {},
  modelGenerate,
} = {}) {
  const message =
    normalizeClassifierMessage(
      userMessage
    );

  if (!message) {
    throw new TypeError(
      "Semantic classifier requires a user message."
    );
  }

  if (typeof modelGenerate !== "function") {
    throw new TypeError(
      "Semantic classifier requires modelGenerate."
    );
  }

  const languageHint =
    typeof languageMeta?.primaryLanguage ===
      "string" &&
    languageMeta.primaryLanguage.trim()
      ? languageMeta.primaryLanguage.trim()
      : "unknown";

  return modelGenerate({
    systemPrompt:
      SEMANTIC_CLASSIFIER_PROMPT,

    messages: [
      {
        role: "user",
        content: `
LATEST USER MESSAGE

${message}

OPTIONAL LANGUAGE HINT

${languageHint}
`.trim(),
      },
    ],
  });
}

function createSemanticClassifier({
  modelGenerate,
} = {}) {
  if (typeof modelGenerate !== "function") {
    throw new TypeError(
      "createSemanticClassifier requires modelGenerate."
    );
  }

  return async function classify({
    userMessage = "",
    languageMeta = {},
  } = {}) {
    return classifySemanticSignals({
      userMessage,
      languageMeta,
      modelGenerate,
    });
  };
}

module.exports = {
  SEMANTIC_CLASSIFIER_PROMPT,
  normalizeClassifierMessage,
  classifySemanticSignals,
  createSemanticClassifier,
};