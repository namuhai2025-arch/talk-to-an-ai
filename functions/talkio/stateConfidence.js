"use strict";

/**
 * Confidence scorer for heuristic state detection.
 * Higher confidence = we trust heuristics more.
 * Lower confidence = escalate to model-based classification.
 */

const { normalizeText, wordCount } = require("./responseScorer");

function detectLikelyNonEnglish(message = "") {
  const text = String(message || "").trim();

  if (!text) return false;

  // Very light heuristic:
  // If message contains lots of non-ascii letters, treat as potentially outside base library.
  const nonAscii = (text.match(/[^\u0000-\u007F]/g) || []).length;
  const totalChars = text.length || 1;

  if (nonAscii / totalChars > 0.15) return true;

  // Common English/Tagalog/Bisaya-ish hints reduce non-English suspicion
  const lower = normalizeText(text);
  const baseHints = [
    "what", "should", "do", "idk", "nothing", "tired", "help",
    "ano", "gagawin", "ko", "wala", "lang", "kapoy", "ambot",
    "unsa", "buhaton", "okay", "sige", "pero", "kasi", "naman"
  ];

  const hasBaseHint = baseHints.some((w) => lower.includes(w));
  return !hasBaseHint && /[a-z]/i.test(text);
}

function scoreHeuristicConfidence({
  latestUserMessage = "",
  heuristicState = {},
}) {
  const msg = normalizeText(latestUserMessage);
  const wc = wordCount(msg);

  let confidence = 0.5;
  const reasons = [];

  if (!msg) {
    return {
      confidence: 0,
      shouldEscalate: true,
      reasons: ["empty_message"],
    };
  }

  // Strong direct matches from heuristic
  if (heuristicState.asksWhatToDo) {
    confidence += 0.25;
    reasons.push("strong_directive_match");
  }

  if (heuristicState.overwhelmed) {
    confidence += 0.2;
    reasons.push("strong_overwhelm_match");
  }

  if (heuristicState.shortInput) {
    confidence += 0.1;
    reasons.push("short_input_detected");
  }

  if (heuristicState.lowEnergy) {
    confidence += 0.1;
    reasons.push("low_energy_detected");
  }

  // Ambiguity penalties
  if (wc <= 2) {
    confidence -= 0.15;
    reasons.push("very_short_message");
  }

  if (wc >= 20) {
    confidence -= 0.05;
    reasons.push("long_message_more_semantic");
  }

  if (detectLikelyNonEnglish(latestUserMessage)) {
    confidence -= 0.2;
    reasons.push("likely_non_base_language");
  }

  // Vague messages should escalate more often
  const vagueMessages = new Set([
    "idk",
    "ewan",
    "ambot",
    "nothing",
    "wala",
    "meh",
    "...",
    ".",
    "ok",
    "okay",
  ]);

  if (vagueMessages.has(msg)) {
    confidence -= 0.15;
    reasons.push("vague_message");
  }

  // Clamp
  confidence = Math.max(0, Math.min(1, confidence));

  // Escalate when confidence is weak
  const shouldEscalate = confidence < 0.62;

  return {
    confidence,
    shouldEscalate,
    reasons,
  };
}

module.exports = {
  detectLikelyNonEnglish,
  scoreHeuristicConfidence,
};