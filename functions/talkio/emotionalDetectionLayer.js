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

function buildStoicEmotionalGuidanceBlock({ emotionResult, responseMode }) {
  return `
STOIC EMOTIONAL GUIDANCE

Detected state:
- primaryEmotion: ${emotionResult?.primaryEmotion || "unclear"}
- toneFamily: ${emotionResult?.toneFamily || "neutral"}
- intensity: ${emotionResult?.intensity || "low"}
- responseMode: ${responseMode || "reflect"}

Respond with calm clarity.

Mode behavior:

reflect:
- name what is happening plainly
- do not over-comfort
- do not use poetic language
- do not ask unless needed

ground:
- reduce the emotional noise
- use short direct sentences
- bring attention to what is real now
- separate feeling from fact

stabilize:
- be firm, calm, and protective
- do not mirror panic
- do not intensify the emotion
- give one clear next anchor

narrow:
- focus on one part only
- do not analyze the whole situation
- make the moment smaller

interrupt_loop:
- do not repeat the user’s spiral
- interrupt the pattern gently
- point to one controllable action or truth

Tone rules:
- no metaphors
- no “that sounds hard”
- no “I understand how you feel”
- no dramatic reassurance
- no therapy-style wording
- no motivational language

Use one clear thought. Keep it grounded.
`.trim();
}

function buildEmotionalGuidanceBlock(latestUserMessage = "") {
  const emotionResult = detectEmotions(latestUserMessage);

  const responseMode = chooseStoicResponseMode(
    emotionResult,
    latestUserMessage
  );

  const emotionalGuidanceBlock = buildStoicEmotionalGuidanceBlock({
    emotionResult,
    responseMode,
  });

  return {
    emotionResult,
    responseMode,
    emotionalGuidanceBlock,
  };
}

function chooseStoicResponseMode(emotionResult = {}, latestUserMessage = "") {
  const text = String(latestUserMessage || "").toLowerCase();

  const intensityMap = {
    very_high: 0.9,
    high: 0.8,
    medium: 0.6,
    low: 0.4,
    minimal: 0.2,
  };

  const intensity = intensityMap[emotionResult?.intensity] || 0.3;

  const primary = String(emotionResult?.primaryEmotion || "").toLowerCase();

  const looping =
  /\b(over and over|keep replaying|can't stop thinking|same thought|again and again|spiral|keep thinking|keeps coming back|can't let it go)\b/i.test(text);

  const confusion =
    /\b(confused|don't know|don’t know|who i am|what to do|lost|unsure)\b/i.test(text);

  const highRisk =
    /\b(kill myself|suicide|end my life|hurt myself|self harm|i want to die)\b/i.test(text);
 
  if (highRisk) return "stabilize";
if (looping) return "interrupt_loop";
if (intensity >= 0.8) return "stabilize";
if (confusion) return "narrow";

if (
  primary === "fear" ||
  primary === "shame" ||
  primary === "stress" ||
  primary === "grief" ||
  primary === "numbness"
) {
  return "ground";
}

if (primary === "anger") {
  return "ground";
}

return "reflect";
}

module.exports = {
  detectEmotions,
  buildEmotionalGuidanceBlock,
};