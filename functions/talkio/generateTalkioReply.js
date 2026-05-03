"use strict";

const {
  buildEmotionalGuidanceBlock,
} = require("./emotionalDetectionLayer");

const {
  loadContinuityMemory,
  buildContinuityBlock,
  buildNativeExpressionBlock,
  buildPersonalityBlock,
} = require("./memoryLiteV2");

const {
  debugLog,
} = require("./debugMonitor");

// ==============================
// Helpers
// ==============================

function normalizeReply(reply) {
  return String(reply || "").trim();
}

function extractModelText(raw) {
  if (!raw) return "";

  if (typeof raw === "string") return raw;

  if (typeof raw.text === "string") return raw.text;
  if (typeof raw.reply === "string") return raw.reply;

  if (Array.isArray(raw?.candidates?.[0]?.content?.parts)) {
    return raw.candidates[0].content.parts
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join(" ");
  }

  if (typeof raw?.choices?.[0]?.message?.content === "string") {
    return raw.choices[0].message.content;
  }

  return "";
}

function sanitizeConversationMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages.filter(
    (m) =>
      m &&
      ["user", "assistant", "system"].includes(m.role) &&
      typeof m.content === "string" &&
      m.content.trim()
  );
}

function isTooWeakReply(reply = "") {
  const text = String(reply || "").trim().toLowerCase();

  return (
    text.length < 10 ||
    ["oh", "oh?", "hmm", "hmm.", "okay", "ok", "right"].includes(text)
  );
}

function isUsableReply(reply = "") {
  const text = String(reply || "").trim();

  if (text.length < 3) return false;

  if (/\b(as an ai|language model|system prompt|policy)\b/i.test(text)) {
    return false;
  }

  return true;
}

async function callWithRetry(fn, retries = 2) {
  try {
    return await fn();
  } catch (e) {
    const code =
      e?.code ||
      e?.status ||
      e?.response?.status ||
      e?.error?.code;

    console.error("RETRY_ERROR_DEBUG:", e);

    const normalizedCode = Number(code) || 0;

if (retries > 0 && [429, 500, 503].includes(normalizedCode)) {
  await new Promise((r) => setTimeout(r, 1000));
  return callWithRetry(fn, retries - 1);
}

    throw e;
  }
}

// ==============================
// Prompt Builder
// ==============================

function buildGuardBlock() {
  return `
STYLE RULES:
- Speak like a real person sitting beside someone.
- Stay close to what the user actually said.
- Respond to one or two real things, not everything.
- Keep it simple, grounded, and human.
- Do not sound like a therapist, coach, essay, or chatbot.

RHYTHM CONTROL:
- Use short spoken chunks.
- One idea per sentence.
- Prefer 2–4 short sentences.
- Let the reply breathe.
- Do not overuse "oh", "wow", "hmm", or "yeah".

QUESTION RULE:
- Do not ask the user to explain something they already explained.
- Ask at most one question.
- Only ask a question if it genuinely helps.

REALISM CHECK:
If the reply sounds like advice, analysis, a summary, or a template, rewrite it.

TARGET:
Someone present beside the user, not someone interpreting them.
`.trim();
}

function buildBrainPrompt({
  systemPrompt,
  continuityBlock,
  nativeExpressionBlock,
  personalityBlock,
  emotionalGuidanceBlock,
}) {
  return [
    systemPrompt,
    continuityBlock,
    nativeExpressionBlock,
    personalityBlock,
    emotionalGuidanceBlock,
    buildGuardBlock(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ==============================
// Main Function
// ==============================

async function generateTalkioReply({
  uid,
  modelGenerate,
  systemPrompt,
  conversationMessages,
  latestUserMessage,
  state = {},
}) {
  if (!uid) {
    return {
      reply: "Please sign in again.",
      path: "missing_verified_uid",
      dynamicMode: "fallback",
      humanState: null,
      memoryUpdate: null,
    };
  }

  const safeMessages = sanitizeConversationMessages(conversationMessages);

  try {
    let continuityMemory = null;

    try {
      continuityMemory = await loadContinuityMemory(uid);
    } catch (err) {
      console.error("continuity_memory_load_failed", {
        uid,
        message: err?.message || String(err),
      });
    }

    const continuityBlock = buildContinuityBlock(continuityMemory);
    const nativeExpressionBlock = buildNativeExpressionBlock(continuityMemory);
    const personalityBlock = buildPersonalityBlock(continuityMemory);

    const {
      emotionResult,
      responseMode,
      emotionalGuidanceBlock,
    } = buildEmotionalGuidanceBlock(latestUserMessage);

    const prompt = buildBrainPrompt({
      systemPrompt,
      continuityBlock,
      nativeExpressionBlock,
      personalityBlock,
      emotionalGuidanceBlock,
    });

    debugLog("TALKIO_EMOTIONAL_ENGINE_DEBUG", {
      emotionResult,
      responseMode,
    });

    console.log("CLEAN_EMOTIONAL_PIPELINE_ACTIVE");

    const raw = await callWithRetry(() =>
      modelGenerate({
        systemPrompt: prompt,
        messages: safeMessages,
      })
    );

    console.log("MODEL RAW OUTPUT:", JSON.stringify(raw, null, 2));

    let reply = normalizeReply(extractModelText(raw));

    if (isTooWeakReply(reply) || !isUsableReply(reply)) {
      const repairedRaw = await callWithRetry(() =>
        modelGenerate({
          systemPrompt: [
            prompt,
            `
REPAIR INSTRUCTION:
The previous reply was too weak, vague, invalid, or unnatural.

Write a fresh reply that:
- responds to the user's actual message
- follows the emotional guidance
- sounds human and present
- does not sound scripted
- does not explain the system
- keeps the same emotional mode
- asks at most one useful question
`.trim(),
          ].join("\n\n"),
          messages: safeMessages,
        })
      );

      reply = normalizeReply(extractModelText(repairedRaw));
    }

    if (isUsableReply(reply)) {
  return {
    reply,
    path: "core_identity_direct",
    dynamicMode: responseMode,
    humanState: {
      emotionResult,
      responseMode,
    },
    memoryUpdate: {
      lastEmotion: emotionResult?.primaryEmotion ?? null,
      lastToneFamily: emotionResult?.toneFamily ?? null,
      lastIntensity: emotionResult?.intensity ?? null,
      lastResponseMode: responseMode ?? null,
    },
  };
}

    return {
      reply: "I’m here. Something in that felt important, but I didn’t catch it cleanly. Can you send it once more?",
      path: "empty_model_reply_fallback",
      dynamicMode: "fallback",
      humanState: {
        emotionResult,
        responseMode,
      },
      memoryUpdate: null,
    };
  } catch (err) {
    console.error("Talkio error:", err);

    return {
      reply: "I’m here. That didn’t come through clearly on my side — can you send it once more?",
      path: "api_error_fallback",
      dynamicMode: "fallback",
      humanState: null,
      memoryUpdate: null,
    };
  }
}

module.exports = {
  generateTalkioReply,
};