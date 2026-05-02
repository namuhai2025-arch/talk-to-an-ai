"use strict";

/**
 * Talkio Emotional Spectrum Engine
 *
 * Detects:
 * - distress states
 * - positive states
 * - neutral states
 * - mixed emotions
 * - emotional intensity
 *
 * Important:
 * This layer does NOT write replies.
 * It only guides the Talkio brain.
 */

function normalizeText(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(text, patterns) {
  let score = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) score += 1;
  }
  return score;
}

const EMOTION_PATTERNS = {
  worry: [
    /\bwhat if\b/i,
    /\boverthink/i,
    /\bworried\b/i,
    /\banxious\b/i,
    /\bnot sure\b/i,
    /\bi don't know what to do\b/i,
  ],

  fear: [
    /\bscared\b/i,
    /\bafraid\b/i,
    /\bterrified\b/i,
    /\bpanic/i,
    /\bunsafe\b/i,
    /\bi can't breathe\b/i,
  ],

  anger: [
    /\bangry\b/i,
    /\bmad\b/i,
    /\bpissed\b/i,
    /\bfrustrated\b/i,
    /\bi hate\b/i,
    /\bso unfair\b/i,
  ],

  grief: [
    /\bgrief\b/i,
    /\blost\b/i,
    /\bmiss them\b/i,
    /\bgone\b/i,
    /\bempty\b/i,
    /\bheavy\b/i,
  ],

  stress: [
    /\bstressed\b/i,
    /\boverwhelmed\b/i,
    /\btoo much\b/i,
    /\bpressure\b/i,
    /\bexhausted\b/i,
    /\bburned out\b/i,
    /\bi can't handle\b/i,
  ],

  shame: [
    /\bwhat's wrong with me\b/i,
    /\bi'm the problem\b/i,
    /\bi feel broken\b/i,
    /\bi'm not enough\b/i,
    /\bi hate myself\b/i,
    /\bi'm ashamed\b/i,
  ],

  loneliness: [
    /\balone\b/i,
    /\blonely\b/i,
    /\bnobody cares\b/i,
    /\bno one understands\b/i,
    /\bi don't matter\b/i,
    /\bi feel invisible\b/i,
  ],

  numbness: [
    /\bnumb\b/i,
    /\bi feel nothing\b/i,
    /\bi don't care anymore\b/i,
    /\bdisconnected\b/i,
    /\bnot real\b/i,
  ],

  joy: [
    /\bhappy\b/i,
    /\bexcited\b/i,
    /\bso good\b/i,
    /\bamazing\b/i,
    /\bjoy\b/i,
    /\bglad\b/i,
    /\byay\b/i,
    /\byess+\b/i,
    /😊|😄|😁|🥹|😂|❤️|🔥|🎉/,
  ],

  gratitude: [
    /\bgrateful\b/i,
    /\bthankful\b/i,
    /\bblessed\b/i,
    /\bappreciate\b/i,
    /\bthank you\b/i,
    /\bthanks\b/i,
  ],

  pride: [
    /\bproud\b/i,
    /\bi did it\b/i,
    /\bi made it\b/i,
    /\bfinally\b/i,
    /\bpassed\b/i,
    /\bgot the job\b/i,
    /\bwin\b/i,
  ],

  relief: [
    /\brelieved\b/i,
    /\bfinally over\b/i,
    /\bthank god\b/i,
    /\bi can breathe\b/i,
    /\bit worked out\b/i,
  ],

  calm: [
    /\bcalm\b/i,
    /\bpeaceful\b/i,
    /\blight\b/i,
    /\bsettled\b/i,
    /\bokay today\b/i,
    /\bnothing heavy\b/i,
  ],

  curiosity: [
    /\bi wonder\b/i,
    /\bcurious\b/i,
    /\bwhat do you think\b/i,
    /\bcan you explain\b/i,
    /\bhow does\b/i,
  ],
};

const POSITIVE_EMOTIONS = new Set([
  "joy",
  "gratitude",
  "pride",
  "relief",
  "calm",
  "curiosity",
]);

const DISTRESS_EMOTIONS = new Set([
  "worry",
  "fear",
  "anger",
  "grief",
  "stress",
  "shame",
  "loneliness",
  "numbness",
]);

function detectIntensity(userMessage, text, totalScore) {
  let intensity = 0;

  if (/[!?]{2,}/.test(userMessage)) intensity += 1;
  if (/[A-Z]{5,}/.test(userMessage)) intensity += 1;
  if (/\b(always|never|everyone|nobody|nothing)\b/i.test(text)) intensity += 1;
  if (/\b(i can't|i cannot|i don't know|i'm tired|too much)\b/i.test(text)) intensity += 1;
  if (userMessage.length > 280) intensity += 1;
  if (totalScore >= 3) intensity += 1;

  if (intensity >= 4) return "very_high";
  if (intensity === 3) return "high";
  if (intensity === 2) return "medium";
  if (totalScore > 0) return "low";

  return "minimal";
}

function detectToneFamily(scores) {
  let positiveScore = 0;
  let distressScore = 0;

  for (const [emotion, score] of Object.entries(scores)) {
    if (POSITIVE_EMOTIONS.has(emotion)) positiveScore += score;
    if (DISTRESS_EMOTIONS.has(emotion)) distressScore += score;
  }

  if (positiveScore > 0 && distressScore > 0) return "mixed";
  if (positiveScore > distressScore) return "positive";
  if (distressScore > positiveScore) return "distress";
  if (positiveScore > 0) return "positive";

  return "neutral";
}

function detectEmotions(userMessage = "") {
  const text = normalizeText(userMessage);

  const scores = {};
  let totalScore = 0;

  for (const [emotion, patterns] of Object.entries(EMOTION_PATTERNS)) {
    scores[emotion] = countMatches(text, patterns);
    totalScore += scores[emotion];
  }

  const ranked = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  const primaryEmotion = ranked[0]?.[0] || "neutral";
  const secondaryEmotion = ranked[1]?.[0] || null;
  const intensity = detectIntensity(userMessage, text, totalScore);
  const toneFamily = detectToneFamily(scores);

  const isMixed =
    toneFamily === "mixed" ||
    (
      secondaryEmotion &&
      POSITIVE_EMOTIONS.has(primaryEmotion) !== POSITIVE_EMOTIONS.has(secondaryEmotion)
    );

  return {
    primaryEmotion,
    secondaryEmotion,
    toneFamily,
    intensity,
    isMixed,
    scores,
  };
}

function chooseResponseMode(emotionResult) {
  const {
    primaryEmotion,
    toneFamily,
    intensity,
    isMixed,
  } = emotionResult;

  if (intensity === "very_high" || intensity === "high") {
    if (primaryEmotion === "joy" || primaryEmotion === "pride") return "uplift";
    if (primaryEmotion === "anger") return "steady";
    return "stabilize";
  }

  if (isMixed) return "hold_complexity";

  if (toneFamily === "positive") {
    if (primaryEmotion === "joy") return "uplift";
    if (primaryEmotion === "pride") return "uplift";
    if (primaryEmotion === "gratitude") return "receive";
    if (primaryEmotion === "relief") return "settle";
    if (primaryEmotion === "calm") return "soft_reflect";
    if (primaryEmotion === "curiosity") return "clear_answer";
  }

  if (primaryEmotion === "fear") return "ground";
  if (primaryEmotion === "stress") return "ground";
  if (primaryEmotion === "anger") return "steady";
  if (primaryEmotion === "grief") return "hold_space";
  if (primaryEmotion === "worry") return "narrow";
  if (primaryEmotion === "shame") return "stabilize";
  if (primaryEmotion === "loneliness") return "reflect";
  if (primaryEmotion === "numbness") return "hold_space";

  return "reflect";
}

function buildEmotionalGuidanceBlock(userMessage = "") {
  const emotionResult = detectEmotions(userMessage);
  const responseMode = chooseResponseMode(emotionResult);

  const emotionalGuidanceBlock = `
EMOTIONAL SPECTRUM ENGINE

Detected tone family: ${emotionResult.toneFamily}
Detected primary emotion: ${emotionResult.primaryEmotion}
Detected secondary emotion: ${emotionResult.secondaryEmotion || "none"}
Mixed emotional state: ${emotionResult.isMixed ? "yes" : "no"}
Intensity: ${emotionResult.intensity}
Recommended response mode: ${responseMode}

Use this only as guidance.
Do not announce emotion labels.
Do not say "you are feeling X" with certainty.
Do not make the reply sound diagnostic.
Let the Talkio brain respond naturally.

MODE BEHAVIOR

- reflect:
  acknowledge clearly, stay natural, deepen gently

- soft_reflect:
  mirror calm or lightness without making it dramatic

- uplift:
  celebrate with the user
  match positive energy without sounding fake
  do not overanalyze joy
  do not rush into advice

- receive:
  warmly receive gratitude
  keep it humble, grounded, and brief

- settle:
  honor relief
  let the nervous system come down
  do not immediately add pressure

- clear_answer:
  answer clearly and helpfully
  keep warmth but prioritize clarity

- ground:
  reduce emotional intensity
  use short steady sentences
  anchor the present moment

- stabilize:
  respond directly and calmly
  do not reinforce identity collapse
  separate pain from identity

- steady:
  validate the boundary or frustration
  do not fuel blame
  keep the reply firm but non-reactive

- hold_space:
  slow down
  give emotional room
  do not rush meaning or solutions

- narrow:
  reduce the scope
  focus on one manageable part

- hold_complexity:
  recognize that more than one emotion may be present
  do not flatten the moment into only happy or only sad
  hold both sides gently

GENERAL RULES

Never over-question.
Ask at most one question only when useful.
Do not turn every positive moment into a lesson.
Do not turn every painful moment into advice.
Stay human, specific, and present.
`.trim();

  return {
    emotionResult,
    responseMode,
    emotionalGuidanceBlock,
  };
}

module.exports = {
  detectEmotions,
  chooseResponseMode,
  buildEmotionalGuidanceBlock,
};