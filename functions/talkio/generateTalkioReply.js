"use strict";

const { REPLY_PATTERNS } = require("./patterns");

const MIN_REPLY_LENGTH = 8;

function normalizeReply(reply) {
  return String(reply || "").trim();
}

function isGenericWeakReply(text) {
  return REPLY_PATTERNS.genericWeak.test(text);
}

function sanitizeConversationMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages.filter(
    (message) =>
      message &&
      (message.role === "user" ||
        message.role === "assistant" ||
        message.role === "system") &&
      typeof message.content === "string" &&
      message.content.trim()
  );
}

function isBlockedMinimalReply(text) {
  return REPLY_PATTERNS.blockedMinimal.some((pattern) => pattern.test(text));
}

function isMetaLeak(text) {
  return REPLY_PATTERNS.metaLeak.test(text);
}

function isToneUnsafe(reply, state = {}) {
  const text = String(reply || "").toLowerCase();
  const playful = REPLY_PATTERNS.unsafePlayful.test(text);
  return Boolean(state?.isSeriousContext) && playful;
}

function isContextAware(reply, latestUserMessage) {
  const keyWords = String(latestUserMessage || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (keyWords.length === 0) return true;

  const replyText = reply.toLowerCase();
  const match = keyWords.some((word) => replyText.includes(word));

  if (match) return true;

  return /\b(feels|feeling|that sounds|that seems|with everything|given that|ang hirap|pagod|wala na|empty|lost)\b/i.test(
    replyText
  );
}

function countSentences(text) {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function hasSpokenTexture(text) {
  return /\b(yeah|hmm|ah|okay|wait|right|fair|honestly|really)\b/i.test(text);
}

function soundsOverlyPolished(text) {
  return /\bI understand how you feel|that sounds very difficult|thank you for sharing|your feelings are valid|how does that make you feel\b/i.test(
    text
  );
}

function soundsTooAbstract(text) {
  return /\bjourney|process|healing takes time|growth|moving forward|navigate this\b/i.test(
    text
  );
}

function soundsTooFloatyForGround(text) {
  return /\b(adrift|fog|drift|storm|darkness|void|unraveling|crumbling)\b/i.test(
    text
  );
}

function humanRealismScore(reply, latestUserMessage) {
  const text = normalizeReply(reply);
  const userText = String(latestUserMessage || "").toLowerCase();

  let score = 0;

  if (text.length >= 12 && text.length <= 280) score += 1;
  if (countSentences(text) >= 1 && countSentences(text) <= 3) score += 1;
  if (!soundsOverlyPolished(text)) score += 1;
  if (!soundsTooAbstract(text)) score += 1;
  if (hasSpokenTexture(text) || text.includes("—") || text.includes("...")) {
    score += 1;
  }

  const keywords = userText
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);

  if (keywords.some((word) => text.toLowerCase().includes(word))) {
    score += 1;
  }

  return score;
}

function hasDepthSignal(text) {
  return REPLY_PATTERNS.depthSignal.test(text);
}

function hasGroundedObservation(text) {
  return REPLY_PATTERNS.groundedObservation.test(text);
}

function hasActionableGrounding(text) {
  return REPLY_PATTERNS.actionableGrounding.test(text);
}

function depthScore(reply, groundingNeeded) {
  const text = normalizeReply(reply);

  let score = 0;

  if (hasDepthSignal(text)) score += 1;
  if (hasGroundedObservation(text)) score += 1;
  if (groundingNeeded && hasActionableGrounding(text)) score += 1;
  if (!groundingNeeded && text.length >= 24) score += 1;

  return score;
}

function hasEnoughDepth(reply, groundingNeeded) {
  const score = depthScore(reply, groundingNeeded);

  if (groundingNeeded) {
    return score >= 2 && hasActionableGrounding(reply);
  }

  return score >= 1;
}

function isInitialUserMessage(messages) {
  return messages.filter((m) => m.role === "user").length <= 1;
}

function isHumanRealistic(reply, latestUserMessage, groundingNeeded) {
  const score = humanRealismScore(reply, latestUserMessage);
  const threshold = groundingNeeded ? 4 : 3;
  return score >= threshold;
}

function normalizeForSimilarity(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLastAssistantReply(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant" && messages[i]?.content) {
      return String(messages[i].content);
    }
  }
  return "";
}

function isTooSimilarToLastAssistantReply(reply, messages) {
  const lastReply = getLastAssistantReply(messages);
  if (!lastReply) return false;

  const a = normalizeForSimilarity(reply);
  const b = normalizeForSimilarity(lastReply);

  if (!a || !b) return false;
  if (a === b) return true;

  const aWords = new Set(a.split(" ").filter(Boolean));
  const bWords = new Set(b.split(" ").filter(Boolean));

  if (aWords.size === 0 || bWords.size === 0) return false;

  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap++;
  }

  const ratio = overlap / Math.max(aWords.size, bWords.size);
  return ratio >= 0.85;
}

const OPENING_VARIATIONS = {
  soft: ["yeah…", "okay…", "right…", "hmm…"],
  direct: [
    "that’s a tough spot.",
    "that’s a lot at once.",
    "that’s a rough mix.",
  ],
  observational: [
    "sounds like that hit hard.",
    "looks like things escalated quickly.",
    "feels like a lot stacked up there.",
  ],
  grounding: [
    "let’s slow this down.",
    "stay with me for a second.",
    "just focus on one thing first.",
  ],
  none: [""],
};

function pickOpening(responseMode) {
  const bank = {
    reflect: [...OPENING_VARIATIONS.soft, ...OPENING_VARIATIONS.observational],
    ground: [...OPENING_VARIATIONS.grounding, ...OPENING_VARIATIONS.direct],
    stabilize: [...OPENING_VARIATIONS.direct],
    interrupt_loop: [...OPENING_VARIATIONS.observational],
    hold_space: ["", "yeah…", "okay…"],
    narrow: ["", "alright…"],
  };

  const options = bank[responseMode] || OPENING_VARIATIONS.soft;
  return options[Math.floor(Math.random() * options.length)];
}

function isSameOpeningAsLast(text, messages) {
  const last = getLastAssistantReply(messages).toLowerCase();
  if (!last) return false;

  const currentWords = String(text || "").trim().toLowerCase().split(/\s+/);
  const lastWords = String(last || "").trim().toLowerCase().split(/\s+/);

  const currentOpening = currentWords.slice(0, 2).join(" ");
  const lastOpening = lastWords.slice(0, 2).join(" ");

  if (!currentOpening || !lastOpening) return false;
  return currentOpening === lastOpening;
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function maybeAddPause(text, state = {}) {
  const responseMode = state?.responseMode || "reflect";
  if (!text) return text;

  if (responseMode === "ground" || responseMode === "stabilize") {
    return text;
  }

  if (Math.random() < 0.22) {
    return text.replace(/^(\w+)(\s+)/, "$1… ");
  }

  return text;
}

function varySentenceRhythm(text, state = {}) {
  const responseMode = state?.responseMode || "reflect";
  const sentences = splitSentences(text);

  if (sentences.length < 2) return text;

  if (responseMode === "ground" || responseMode === "stabilize") {
    return text;
  }

  if (Math.random() < 0.35) {
    const first = sentences[0];
    const rest = sentences.slice(1).join(" ");
    return `${first}\n\n${rest}`;
  }

  if (Math.random() < 0.25 && sentences.length >= 3) {
    return `${sentences[0]} ${sentences[1]}\n\n${sentences.slice(2).join(" ")}`;
  }

  return text;
}

function softenOverlyEvenTone(text, state = {}) {
  const responseMode = state?.responseMode || "reflect";

  if (responseMode === "ground" || responseMode === "stabilize") {
    return text;
  }

  return String(text || "")
    .replace(/\bIt is\b/g, "It’s")
    .replace(/\bThat is\b/g, "That’s")
    .replace(/\bDo not\b/g, "Don’t");
}

function maybeSwapSpokenLead(text, state = {}) {
  const responseMode = state?.responseMode || "reflect";
  if (responseMode === "ground" || responseMode === "stabilize") {
    return text;
  }

  const swaps = [
    [/^yeah…\s+/i, "yeah… "],
    [/^okay…\s+/i, "okay… "],
    [/^right…\s+/i, "right… "],
  ];

  let result = text;
  for (const [pattern, replacement] of swaps) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

function applyMicroVariation(text, state = {}, messages = []) {
  let result = String(text || "").trim();
  if (!result) return result;

  const opener = pickOpening(state?.responseMode);

  if (opener && Math.random() < 0.6) {
    const candidate =
      opener + " " + result.charAt(0).toLowerCase() + result.slice(1);

    if (!isSameOpeningAsLast(candidate, messages)) {
      result = candidate;
    }
  }

  result = result.replace(
    /\b(that sounds like|that sounds)\b/i,
    Math.random() < 0.5 ? "that feels like" : "it sounds like"
  );

  result = softenOverlyEvenTone(result, state);
  result = maybeAddPause(result, state);
  result = varySentenceRhythm(result, state);
  result = maybeSwapSpokenLead(result, state);

  return result.trim();
}

function isRedundantQuestion(reply, latestUserMessage) {
  const replyText = String(reply || "").toLowerCase();
  const userText = String(latestUserMessage || "").toLowerCase();

  const repeatQuestionPatterns =
    /\b(what('?s| is)\s+(making|causing)|what\s+caused|why\s+do\s+you\s+feel|tell\s+me\s+(a\s+bit\s+)?more\s+about|can\s+you\s+tell\s+me\s+(a\s+bit\s+)?more|what('?s| is)\s+going\s+on|what('?s| is)\s+happening)\b/i;

  const userAlreadyExplained =
    /\b(my gf|left me|breakup|alone|ignored|drunk|bar|tired|pointless|lost|nobody|no one cares|everything feels|i am)\b/i.test(
      userText
    );

  return repeatQuestionPatterns.test(replyText) && userAlreadyExplained;
}

function hasIdentityStabilization(text) {
  return REPLY_PATTERNS.identityStabilization.test(text);
}

function hasGroundModeShape(text) {
  const normalized = String(text || "").trim();
  const sentenceCount = (normalized.match(/[.!?]+/g) || []).length || 1;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return sentenceCount <= 4 && wordCount <= 70;
}

function hasImmediateAnchor(text) {
  return REPLY_PATTERNS.immediateAnchor.test(text);
}

function detectReplyShape(state = {}, latestUserMessage = "") {
  const responseMode = state?.responseMode || "reflect";
  const trajectory = state?.trajectory?.mode || "stable";
  const groundingNeeded = Boolean(state?.groundingNeeded);
  const text = String(latestUserMessage || "").toLowerCase();

  const hasIdentityCollapse =
    /\bi am nobody|i'm nobody|i am nothing|i'm nothing|no one cares|nobody cares|worthless|useless\b/i.test(
      text
    );

  if (hasIdentityCollapse || responseMode === "stabilize") {
    return "short_stabilizing";
  }

  if (groundingNeeded || responseMode === "ground") {
    return "short_grounding";
  }

  if (trajectory === "looping" || responseMode === "interrupt_loop") {
    return "pattern_break";
  }

  if (responseMode === "hold_space") {
    return "low_pressure";
  }

  if (responseMode === "narrow") {
    return "focused";
  }

  return "reflective";
}

function shouldAllowQuestion(state = {}, latestUserMessage = "") {
  const responseMode = state?.responseMode || "reflect";
  const trajectory = state?.trajectory?.mode || "stable";
  const text = String(latestUserMessage || "").toLowerCase();

  const userAlreadyExplained =
    /\b(my gf|left me|breakup|alone|ignored|drunk|bar|tired|pointless|lost|nobody|no one cares|because|after|since|family|mom|mother|argument)\b/i.test(
      text
    );

  if (responseMode === "stabilize") return false;
  if (responseMode === "ground" && userAlreadyExplained) return false;
  if (trajectory === "worsening" && userAlreadyExplained) return false;

  return true;
}

function matchesReplyShape(text, state = {}, latestUserMessage = "") {
  const shape = detectReplyShape(state, latestUserMessage);
  const wordCount = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const sentenceCount = countSentences(text);

  if (shape === "short_grounding") {
    return wordCount <= 55 && sentenceCount <= 3;
  }

  if (shape === "short_stabilizing") {
    return wordCount <= 65 && sentenceCount <= 3;
  }

  if (shape === "pattern_break") {
    return wordCount <= 75 && sentenceCount <= 4;
  }

  if (shape === "low_pressure") {
    return wordCount <= 60 && sentenceCount <= 3;
  }

  if (shape === "focused") {
    return wordCount <= 70 && sentenceCount <= 4;
  }

  return wordCount <= 110 && sentenceCount <= 5;
}

function isUsableReply(reply, messages, latestUserMessage, state = {}) {
  const groundingNeeded = state?.groundingNeeded || false;
  const trajectory = state?.trajectory?.mode || "stable";
  const responseMode = state?.responseMode || "reflect";

  const text = normalizeReply(reply);

  const questionCount = (text.match(/\?/g) || []).length;

if (!shouldAllowQuestion(state, latestUserMessage) && questionCount > 0) {
  return false;
}

if (questionCount > 1) {
  return false;
}

if (!matchesReplyShape(text, state, latestUserMessage)) {
  return false;
}

  if (!text) return false;
  if (text.length < MIN_REPLY_LENGTH) return false;
  if (isBlockedMinimalReply(text)) return false;
  if (isMetaLeak(text)) return false;
  if (isGenericWeakReply(text)) return false;
  if (!isContextAware(text, latestUserMessage)) return false;
  if (isToneUnsafe(text, state)) return false;
  if (!isHumanRealistic(text, latestUserMessage, groundingNeeded)) return false;
  if (!hasEnoughDepth(text, groundingNeeded)) return false;
  if (isTooSimilarToLastAssistantReply(text, messages)) return false;
  if (isRedundantQuestion(text, latestUserMessage)) return false;

  const repetitivePatterns = REPLY_PATTERNS.repetitiveEmpathy;

  if (trajectory === "worsening") {
    const lastReply = getLastAssistantReply(messages).toLowerCase();

    if (
      repetitivePatterns.test(lastReply) &&
      repetitivePatterns.test(text)
    ) {
      return false;
    }
  }

  if (trajectory === "looping" && !hasGroundedObservation(text)) return false;
  if (trajectory === "masking" && REPLY_PATTERNS.unsafePlayful.test(text)) {
    return false;
  }

  const isStabilize = responseMode === "stabilize";
  const isGround = responseMode === "ground";
  const isInterruptLoop = responseMode === "interrupt_loop";

  if (
    isStabilize &&
    !hasGroundedObservation(text) &&
    !hasIdentityStabilization(text)
  ) {
    return false;
  }

  if (isStabilize && REPLY_PATTERNS.stabilizeProbingQuestion.test(text)) {
    return false;
  }

  if (
    (isGround || isStabilize) &&
    REPLY_PATTERNS.groundOrStabilizeProbingQuestion.test(text)
  ) {
    return false;
  }

  if (isGround && !hasGroundModeShape(text)) {
    return false;
  }

  if (
    isGround &&
    !hasImmediateAnchor(text) &&
    !hasActionableGrounding(text)
  ) {
    return false;
  }

  if (isGround && REPLY_PATTERNS.groundProbingQuestion.test(text)) {
    return false;
  }

  if (isGround && soundsTooFloatyForGround(text)) {
    return false;
  }

  if (isInterruptLoop && isTooSimilarToLastAssistantReply(text, messages)) {
    return false;
  }

  return true;
}

function buildGuardedSystemPrompt(systemPrompt, state = {}) {
  const groundingNeeded = state?.groundingNeeded || false;
  const mode = state?.trajectory?.mode || "stable";

  let extra = "";

  if (groundingNeeded) {
    extra += `
IMPORTANT:
This is a serious situation.
Respond calmly and seriously.
Do not joke, tease, flirt, or sound playful.
Do not romanticize confusion, intoxication, or danger.
Do not frame intoxication as celebration or fun.
Keep the reply grounded, clear, natural, stoic and practical.
`.trim();
  }

  if (mode === "masking" || mode === "sudden_drop") {
    extra += `

Do not over-trust lighter surface wording.
Stay emotionally accurate to the recent conversation.`;
  }

  if (mode === "looping") {
    extra += `

Do not repeat the same reply pattern.
Break the conversational loop with a fresher angle.`;
  }

  return extra ? `${systemPrompt}\n\n${extra}` : systemPrompt;
}

function buildRetryInstruction(latestUserMessage, state = {}) {
  const shape = detectReplyShape(state, latestUserMessage);

  return `The previous reply was too weak, too generic, repetitive, or emotionally insufficient.

Latest user message:
"${String(latestUserMessage || "").trim()}"

Conversation trajectory:
${state?.trajectory?.mode || "stable"}

Response mode:
${state?.responseMode || "reflect"}

Reply shape:
${shape}

Rewrite the reply.

Requirements:
- Do not repeat the previous tone or structure.
- Increase emotional specificity.
- Anchor your reply in what the user is actually experiencing.
- Sound human, steady, stoic and natural.
- Reply in the user's language.
- Do not use empty holding lines like "I'm here."
- Do not ask questions that repeat information already provided.
- Directly respond to the emotional reality of the message.
- Do not sound scripted, overly polished, or abstract.
- Use short, clear sentences if the user seems flooded or unstable.
- Ask at most one grounded question.

${
  state?.groundingNeeded
    ? "- Prioritize grounding, steadiness, and immediate emotional containment."
    : ""
}

${
  state?.responseMode === "stabilize"
    ? "- The user may be in identity collapse. Stabilize first. Do not reinforce the belief. Avoid generic empathy."
    : ""
}

${
  state?.responseMode === "interrupt_loop"
    ? "- Break repetition. Do not use the same emotional frame again."
    : ""
}

${
  state?.responseMode === "hold_space"
    ? "- Keep the reply gentle and low-pressure. Do not push."
    : ""
}

${
  state?.responseMode === "ground"
    ? "- Ground first. Use short clear sentences. Focus on one immediate thing only."
    : ""
}

${
  shape === "short_grounding"
    ? "- Keep it short (2–3 sentences). Focus on grounding."
    : ""
}

${
  shape === "short_stabilizing"
    ? "- Keep it short and direct. Stabilize identity. Do not over-explain."
    : ""
}

${
  shape === "pattern_break"
    ? "- Break the previous response pattern completely."
    : ""
}

${
  shape === "low_pressure"
    ? "- Keep it gentle. Do not interrogate."
    : ""
}`;
}

async function generateDraft({ modelGenerate, systemPrompt, messages }) {
  try {
    const raw = await modelGenerate({ systemPrompt, messages });

    if (typeof raw === "string") {
      return normalizeReply(raw);
    }

    if (raw?.text) {
      return normalizeReply(raw.text);
    }

    if (raw?.content) {
      return normalizeReply(raw.content);
    }

    if (raw?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return normalizeReply(raw.candidates[0].content.parts[0].text);
    }

    return "";
  } catch (err) {
    console.error("generateDraft failed:", err);
    return "";
  }
}

const FALLBACK_VARIATIONS = {
  shutdown: [
    "Alright. We don’t have to force it. But something here still matters—what made you pull back just now?",
    "We can slow this down. No need to push. But what made you step back just now?",
  ],

  looping: [
    "Feels like you’ve been circling this for a bit. What part keeps pulling you back?",
    "You’ve been stuck in this loop for a while. What’s the part that won’t let go?",
  ],

  masking: [
    "You sound lighter on the surface, but something underneath still feels unresolved. What’s still there?",
    "On the surface it sounds okay, but it doesn’t feel fully settled. What’s still bothering you?",
  ],

  sudden_drop: [
    "That shifted fast. Something real landed there—what’s hitting hardest right now?",
    "That changed quickly. What part hit you the hardest just now?",
  ],

  stabilize: [
    "That’s a brutal place to be mentally. When everything stacks up like this, it can feel completely true—but this moment isn’t all of you.",
    "That thought is hitting hard right now. But it’s not the whole truth about you.",
  ],

  ground: [
    "Yeah… this is hitting hard right now. Don’t try to sort everything out—just stay with one thing. What feels worst?",
    "Let’s slow this down. You don’t need to figure everything out—just focus on what’s heaviest right now.",
  ],

  groundingNeeded: [
    "That’s a lot hitting at once. Let’s slow it down—what feels hardest right now?",
    "There’s a lot going on here. Stay with one part for now—what’s weighing on you most?",
  ],

  alone: [
    "That kind of feeling cuts deep. What part of it is weighing on you the most?",
    "Feeling that alone is heavy. What part of it hurts the most right now?",
  ],

  lost: [
    "Feels like things aren’t clear at all right now. What’s the most confusing part?",
    "Yeah… that lost feeling can be rough. What’s the part you can’t figure out?",
  ],

  default: [
    "That sounds heavy. Tell me the hardest part.",
    "There’s a lot in that. What’s sitting on you the most right now?",
    "That’s not light. What part feels the heaviest?",
  ],
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildSoftFallback(latestUserMessage, groundingNeeded, state = {}) {
  const text = String(latestUserMessage || "").toLowerCase();
  const mode = state?.trajectory?.mode || "stable";
  const responseMode = state?.responseMode;

  if (mode === "shutdown") {
    return pickRandom(FALLBACK_VARIATIONS.shutdown);
  }

  if (mode === "looping") {
    return pickRandom(FALLBACK_VARIATIONS.looping);
  }

  if (mode === "masking") {
    return pickRandom(FALLBACK_VARIATIONS.masking);
  }

  if (mode === "sudden_drop") {
    return pickRandom(FALLBACK_VARIATIONS.sudden_drop);
  }

  if (responseMode === "stabilize") {
    return pickRandom(FALLBACK_VARIATIONS.stabilize);
  }

  if (responseMode === "ground") {
    return pickRandom(FALLBACK_VARIATIONS.ground);
  }

  if (groundingNeeded) {
    return pickRandom(FALLBACK_VARIATIONS.groundingNeeded);
  }

  if (text.includes("alone") || text.includes("nobody")) {
    return pickRandom(FALLBACK_VARIATIONS.alone);
  }

  if (text.includes("lost") || text.includes("confused")) {
    return pickRandom(FALLBACK_VARIATIONS.lost);
  }

  return pickRandom(FALLBACK_VARIATIONS.default);
}

async function generateTalkioReply({
  modelGenerate,
  systemPrompt,
  conversationMessages,
  latestUserMessage,
  state = {},
}) {
  const groundingNeeded = state?.groundingNeeded || false;
  const safeMessages = sanitizeConversationMessages(conversationMessages);
  const guardedPrompt = buildGuardedSystemPrompt(systemPrompt, state);

  try {
    const firstDraft = await generateDraft({
      modelGenerate,
      systemPrompt: guardedPrompt,
      messages: safeMessages,
    });

    if (isUsableReply(firstDraft, safeMessages, latestUserMessage, state)) {
      return {
        reply: applyMicroVariation(firstDraft, state, safeMessages),
        path: "firstDraft",
      };
    }

    if (isInitialUserMessage(safeMessages) && firstDraft) {
      const initialPass =
        firstDraft.length >= 16 &&
        !isBlockedMinimalReply(firstDraft) &&
        !isMetaLeak(firstDraft) &&
        !isGenericWeakReply(firstDraft);

      if (initialPass) {
        return {
          reply: applyMicroVariation(firstDraft, state, safeMessages),
          path: "firstDraft_initial_relaxed",
        };
      }
    }

    const retryDraft = await generateDraft({
      modelGenerate,
      systemPrompt: `${guardedPrompt}\n\n${buildRetryInstruction(
        latestUserMessage,
        state
      )}`,
      messages: safeMessages,
    });

    if (isUsableReply(retryDraft, safeMessages, latestUserMessage, state)) {
      return {
        reply: applyMicroVariation(retryDraft, state, safeMessages),
        path: "retry",
      };
    }

    if (retryDraft) {
      return {
        reply: applyMicroVariation(retryDraft, state, safeMessages),
        path: "retry_forced_accept",
      };
    }

    return {
      reply: applyMicroVariation(
        buildSoftFallback(latestUserMessage, groundingNeeded, state),
        state,
        safeMessages
      ),
      path: "last_resort_fallback",
    };
  } catch (error) {
    console.error("generateTalkioReply failed:", error);

    return {
      reply: applyMicroVariation(
        buildSoftFallback(latestUserMessage, groundingNeeded, state),
        state,
        safeMessages
      ),
      path: "error_fallback",
      error: error?.message || String(error),
    };
  }
}

module.exports = {
  generateTalkioReply,
  _internal: {
    normalizeReply,
    sanitizeConversationMessages,
    isToneUnsafe,
    isUsableReply,
    buildGuardedSystemPrompt,
    buildRetryInstruction,
  },
};