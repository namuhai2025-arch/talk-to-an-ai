"use strict";

const GENERIC_PATTERNS = [
  "that sounds hard",
  "that sounds really hard",
  "that sounds difficult",
  "that sounds tough",
  "that sounds heavy",
  "it sounds like",
  "i understand how you feel",
  "i'm here for you",
  "im here for you",
  "thank you for sharing that",
  "how does that make you feel",
  "you are so strong",
  "that must be difficult",
];

const THERAPISTY_PATTERNS = [
  "hold space",
  "process your emotions",
  "valid feelings",
  "safe space",
  "thank you for sharing",
  "how does that make you feel",
  "your feelings are valid",
];

const OVERPOLISHED_PATTERNS = [
  "profound",
  "beautifully said",
  "powerful",
  "incredible",
  "deeply meaningful",
  "remarkable",
  "what a beautiful",
];

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s?]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPunctuation(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countQuestions(text = "") {
  return (String(text).match(/\?/g) || []).length;
}

function splitSentences(text = "") {
  return String(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(text = "") {
  const cleaned = stripPunctuation(text);
  if (!cleaned) return 0;
  return cleaned.split(" ").filter(Boolean).length;
}

function overlapRatio(a = "", b = "") {
  const aWords = new Set(stripPunctuation(a).split(" ").filter(Boolean));
  const bWords = new Set(stripPunctuation(b).split(" ").filter(Boolean));

  if (!aWords.size || !bWords.size) return 0;

  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap++;
  }

  return overlap / Math.min(aWords.size, bWords.size);
}

function firstSentencePrefix(text = "", maxLen = 40) {
  const first = splitSentences(text)[0] || "";
  return first.slice(0, maxLen).toLowerCase().trim();
}

function startsSimilarly(a = "", b = "") {
  const aStart = firstSentencePrefix(a);
  const bStart = firstSentencePrefix(b);
  return Boolean(aStart && bStart && aStart === bStart);
}

function includesAny(text = "", patterns = []) {
  const normalized = normalizeText(text);
  return patterns.some((p) => normalized.includes(normalizeText(p)));
}

function extractUsefulUserWords(text = "") {
  const blacklist = new Set([
    "what", "should", "this", "that", "have", "with", "from", "your", "just",
    "really", "thing", "things", "feel", "feels", "feeling", "make", "made",
    "been", "still", "like", "dont", "don't", "cant", "can't", "wont", "won't",
    "has", "had", "would", "could", "there", "them", "they", "then",
    "because", "about", "into", "when", "where", "which", "than", "more",
    "some", "much", "very", "even", "only", "also", "today", "tonight",
    "lang", "naman", "talaga", "kasi", "pero", "basta", "nga", "jud",
    "kaayo", "gyud", "unsa", "kani", "karon", "ra", "lagi",
  ]);

  return stripPunctuation(text)
    .split(" ")
    .filter(Boolean)
    .filter((w) => w.length >= 4 && !blacklist.has(w));
}

function detectUserState(latestUserMessage = "") {
  const msg = normalizeText(latestUserMessage);
  const wc = wordCount(msg);

  const shortInput = wc > 0 && wc <= 3;

  const asksWhatToDo =
    msg.includes("what should i do") ||
    msg.includes("what do i do") ||
    msg.includes("what now") ||
    msg.includes("unsa akong buhaton") ||
    msg.includes("unsa man akong buhaton") ||
    msg.includes("ano gagawin ko") ||
    msg.includes("anong gagawin ko");

  const overwhelmed =
    msg.includes("i cant take this anymore") ||
    msg.includes("i can't take this anymore") ||
    msg.includes("everything is too much") ||
    msg.includes("im done") ||
    msg.includes("i'm done") ||
    msg.includes("i give up") ||
    msg.includes("wala na") ||
    msg.includes("di na kaya") ||
    msg.includes("hindi ko na kaya");

  const lowEnergyExamples = new Set([
    "idk",
    "nothing",
    "just tired",
    "tired",
    "kapoy",
    "wala",
    "ambot",
    "ewan",
    "meh",
    "okay",
    "ok",
  ]);

  const lowEnergy = shortInput || lowEnergyExamples.has(msg);

  return {
    shortInput,
    asksWhatToDo,
    overwhelmed,
    lowEnergy,
    wordCount: wc,
  };
}

function detectProgressSignals(reply = "") {
  const text = normalizeText(reply);

  const actionCue =
    /\b(try|start|pick|pause|breathe|focus|for now|next step|one small thing|just do|step back|slow down)\b/i.test(
      text
    );

  const groundingCue =
    /\b(right now|for now|from your side|in front of you|one thing|small step)\b/i.test(
      text
    );

  const narrowingCue =
    /\b(is it|more like|the part that|what part|which part)\b/i.test(text);

  return {
    hasActionCue: actionCue,
    hasGroundingCue: groundingCue,
    hasNarrowingCue: narrowingCue,
  };
}

function scoreReply({
  reply,
  latestUserMessage,
  previousAssistantReply = "",
  turnIndex = 0,
  userStateOverride = null,
}) {
  let specificity = 20;
  let repetition = 20;
  let questionControl = 15;
  let progression = 20;
  let toneFit = 15;
  let identityFit = 10;

  const normalizedReply = normalizeText(reply);
  const normalizedUser = normalizeText(latestUserMessage);
  const replyWords = wordCount(reply);
  const questions = countQuestions(reply);
  const similarity = overlapRatio(reply, previousAssistantReply);
  const userState = userStateOverride || detectUserState(latestUserMessage);
  const userWords = extractUsefulUserWords(normalizedUser);
  const matchedUserWords = userWords.filter((w) =>
    normalizedReply.includes(w)
  );

  const { hasActionCue, hasGroundingCue, hasNarrowingCue } =
    detectProgressSignals(reply);

  if (userWords.length > 0 && matchedUserWords.length === 0) specificity -= 8;
  if (includesAny(reply, GENERIC_PATTERNS)) specificity -= 8;
  if (replyWords < 4) specificity -= 4;
  if (replyWords > 55 && userState.shortInput) specificity -= 3;

  if (similarity > 0.5) repetition -= 15;
  if (similarity > 0.7) repetition -= 10;
  if (startsSimilarly(reply, previousAssistantReply)) repetition -= 10;

  if (questions > 1) questionControl -= 12;
  if (questions >= 1 && userState.lowEnergy) questionControl -= 12;
  if (questions >= 1 && userState.asksWhatToDo) questionControl -= 12;

  if (userState.asksWhatToDo && !hasActionCue) progression -= 20;
  if (userState.overwhelmed && !hasGroundingCue && replyWords > 35) progression -= 6;
  if (!hasActionCue && !hasGroundingCue && !hasNarrowingCue && similarity > 0.5) {
    progression -= 6;
  }
  if (turnIndex >= 2 && !hasActionCue && !hasGroundingCue && questions === 0 && replyWords < 8) {
    progression -= 4;
  }

  if (userState.shortInput && replyWords > 28) toneFit -= 8;
  if (userState.lowEnergy && replyWords > 35) toneFit -= 5;
  if (userState.overwhelmed && replyWords > 45) toneFit -= 5;

  if (includesAny(reply, THERAPISTY_PATTERNS)) identityFit -= 6;
  if (includesAny(reply, OVERPOLISHED_PATTERNS)) identityFit -= 4;
  if (/!\s*!/.test(reply) || /!!!/.test(reply)) identityFit -= 2;

  specificity = Math.max(0, specificity);
  repetition = Math.max(0, repetition);
  questionControl = Math.max(0, questionControl);
  progression = Math.max(0, progression);
  toneFit = Math.max(0, toneFit);
  identityFit = Math.max(0, identityFit);

  const total =
    specificity +
    repetition +
    questionControl +
    progression +
    toneFit +
    identityFit;

  const reasons = [];
  if (specificity < 12) reasons.push("too_generic");
  if (repetition < 12) reasons.push("too_repetitive");
  if (questionControl < 10) reasons.push("too_many_questions");
  if (progression < 12) reasons.push("not_moving_forward");
  if (toneFit < 10) reasons.push("tone_mismatch");
  if (identityFit < 7) reasons.push("identity_drift");

  return {
    total,
    breakdown: {
      specificity,
      repetition,
      questionControl,
      progression,
      toneFit,
      identityFit,
    },
    reasons,
    meta: {
      replyWords,
      questions,
      similarity,
      userState,
    },
    shouldRewrite: total < 80,
    shouldDiscard: total < 65,
  };
}

module.exports = {
  GENERIC_PATTERNS,
  THERAPISTY_PATTERNS,
  OVERPOLISHED_PATTERNS,
  normalizeText,
  stripPunctuation,
  countQuestions,
  splitSentences,
  wordCount,
  overlapRatio,
  startsSimilarly,
  detectUserState,
  detectProgressSignals,
  scoreReply,
};