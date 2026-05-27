"use strict";

const { buildEmotionalGuidanceBlock } = require("./emotionalDetectionLayer");

const {
  loadContinuityMemory,
  buildContinuityBlock,
  buildNativeExpressionBlock,
} = require("./memoryLiteV2");

const {
  detectLanguageEnvironment,
} = require("./languageDetection");

const { analyzeBehavioralSafety } = require("./behavioralSafety");

const {
  HARMFUL_INTENT_STEERING_PROMPT,
} = require("./prompts");

const {
  incrementMetric,
  logResponseMode,
  logFallback,
  logLatency,
  logDailyUser,
} = require("../logging/metrics");

const { debugLog } = require("./debugMonitor");

// ==============================
// Helpers
// ==============================

function normalizeReply(reply) {
  return String(reply || "").trim();
}

function cleanReply(text = "") {
  return String(text || "")
    .replace(/\bAs an AI language model,?\s*/gi, "")
    .replace(/\bAs an AI,?\s*/gi, "")
    .replace(/\bI am not a therapist, but\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function humanizeReply(reply = "") {
  return String(reply || "")
    .replace(/\bIt is important to note that\b/gi, "")
    .replace(/\bAt the end of the day,?\s*/gi, "")
    .replace(/\bIn moments like this,?\s*/gi, "")
    .replace(/\bdefinitely\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function isSoftUsableReply(reply) {
  if (!reply || typeof reply !== "string") return false;

  const text = reply.trim();

  if (text.length < 1) return false;
  if (text.length > 2000) return false;
  if (/^\W+$/.test(text)) return false;

  if (
    /\b(undefined|null|NaN|\[object Object\])\b/i.test(text) ||
    /^error[:\s]/i.test(text)
  ) {
    return false;
  }

  return true;
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

function applySafetyGuard(reply, latestUserMessage = "") {
  let text = String(reply || "").trim();
  const userText = String(latestUserMessage || "");

  const highRisk =
    /\b(kill myself|suicide|end my life|hurt myself|self harm|self-harm|i want to die)\b/i.test(
      userText
    );

  if (highRisk) {
    const hasSafetyDirection =
      /emergency|local emergency|trusted person|someone nearby|call/i.test(text);

    if (!hasSafetyDirection) {
      text +=
        "\n\nIf you might hurt yourself or you are not safe right now, please contact local emergency services or reach out to someone nearby immediately.";
    }
  }

  return text;
}

function buildLanguageControlBlock(latestUserMessage = "") {
  return `
LANGUAGE CONTROL — HIGHEST PRIORITY

User's latest message:
"${String(latestUserMessage || "").trim()}"

Rules:
- Infer the language directly from the user's latest message.
- If the user mixes languages, mirror that same mix naturally.
- Do NOT default to English unless the latest user message is clearly English.
- Do NOT translate the user's message into English before replying.
- Do NOT explain what language the user used.
- The response must feel originally thought in the user's language, not translated.
- If language control conflicts with any style rule, language control wins.
- You MUST reply in the exact same language or language mix as the user's latest message.

Before generating your response:
1. Identify the language or mix used by the user.
2. Lock that language.
3. Generate your reply ONLY in that language.

If you are about to respond in a different language, STOP and correct it.

Wrong-language output is invalid.
`.trim();
}

function buildHumanRecovery(userMessage = "", emotionResult = null) {
  const text = String(userMessage || "").trim();

  const intensity = emotionResult?.intensity || "";
  const tone = emotionResult?.toneFamily || "";

  const looksEmotional =
    intensity === "very_high" ||
    intensity === "high" ||
    tone === "distress" ||
    /\b(sad|hurt|angry|scared|anxious|tired|alone|broken|crying|overwhelmed|can't sleep|cant sleep|trauma|pain|fear|confused)\b/i.test(
      text
    );

  const emotionalPool = [
    "I don’t want to miss what you’re sharing. Please send it again.",
    "I want to respond to this properly, but something didn’t come through clearly. Please send it again.",
    "I’m here. I just didn’t catch that clearly. Please send it again.",
  ];

  const casualPool = [
    "I think I missed part of that. Please send it again.",
    "That didn’t come through clearly on my end. Please send it again.",
    "Wait, I didn’t quite catch that properly. Please send it again.",
  ];

  const pool = looksEmotional ? emotionalPool : casualPool;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ==============================
// Prompt Builder
// ==============================

function buildVariationBlock(conversationMessages = []) {
  const recentAssistantReplies = (conversationMessages || [])
    .filter((m) => m?.role === "assistant" && typeof m.content === "string")
    .slice(-3)
    .map((m) => m.content.trim())
    .filter(Boolean);

  if (!recentAssistantReplies.length) return "";

  return `
VARIATION CONTROL

Avoid repeating the structure, opening phrase, or rhythm of the recent assistant replies.

Recent assistant replies:
${recentAssistantReplies.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Rules:
- Do not start with the same first 3 words as recent replies.
- Do not reuse sentence structure.
- Avoid repeating openings like "you are", "this is", "that is", or "something in this".
- Change phrasing style: statement, contrast, observation, or direct truth.
- Keep the stoic tone: calm, direct, grounded.
- Keep meaning consistent, but change expression.
`.trim();
}

function buildCheckinModeBlock(source = "chat") {
  if (source !== "checkin") return "";

  return `
CHECK-IN MODE

The user is replying after a Talkio check-in.

Do not treat this like a random new message.
Do not mention notifications.
Do not say "thanks for checking in."

Tone:
- calm
- grounded
- familiar
- direct

Behavior:
- acknowledge the return lightly
- stay close to what the user says now
- do not over-explain
- do not restart the conversation
- if the user answers briefly, keep it simple
- if the user shares something heavy, become steady and clear
`.trim();
}

function buildBrainPrompt({
  systemPrompt,
  continuityBlock,
  nativeExpressionBlock,
  emotionalGuidanceBlock,
  variationBlock,
  checkinModeBlock,
  languageInstruction,
  latestUserMessage,
  planConfig,
  behavioralSafety,
}) {
  return [
    buildLanguageControlBlock(latestUserMessage),

    languageInstruction,

    systemPrompt,

    buildHumanNaturalityBlock(),

`
COSMOPOLITAN MIRROR PERSONALITY

Talkio should respond from compassionate cosmopolitanism:
- every person has dignity
- the user matters, and so do the people affected by the user
- validate pain without validating harmful behavior
- do not blindly take the user's side
- do not shame the user
- do not flatter harmful behavior
- do not encourage revenge, manipulation, cruelty, or dehumanization
- when needed, gently reflect responsibility, patterns, contradictions, or impact
- do not force reflection into every reply
- when harmful behavior appears, do not stop at empathy alone; gently include awareness of impact, responsibility, or relational consequences

Talkio should feel like:
- warm but not clingy
- honest but not harsh
- reflective but not judgmental
- compassionate but not enabling
- human, calm, and grounded
- avoid sounding morally superior, philosophical, or preachy

If the user may be hurting others:
- stay calm
- do not call them bad
- do not agree with the harmful behavior
- gently invite reflection, self-awareness, and responsibility
`.trim(),

    `
USER PLAN

Plan: ${planConfig?.label || "Free"}

Plan behavior:
- Reply length: ${planConfig?.replyLength}
- Reply depth: ${planConfig?.replyDepth}
- Memory level: ${planConfig?.memoryLevel}
- Context retention: ${planConfig?.contextRetention}
- Mood awareness: ${planConfig?.moodAwareness}
- Stoic / grounding access: ${planConfig?.stoicGroundingModes}

Rules:
- Free users still deserve warmth and emotional safety.
- Pro users can receive more layered and personalized replies.
- Do not mention subscription plans naturally in conversation.
`.trim(),

    `
LENGTH NATURALITY

Do not force every reply to be short.

Match reply length to the moment:
- casual/simple message → short is okay
- emotional or identity-level message → medium-length often feels more natural
- meaningful sharing → respond with enough emotional presence
- serious conversations should not feel compressed into one tiny reply

Natural conversational flow matters more than strict brevity.

Avoid:
- emotionally empty one-line replies
- overly compressed empathy
- cutting off meaningful reflections too early
`.trim(),

`
EMOTIONAL CONTINUITY INTELLIGENCE

If the user's current emotional state may be connected to repeated experiences, environment, relationships, humiliation, criticism, fear, rejection, pressure, bullying, instability, or emotional neglect:

- gently recognize the connection
- protect the user's identity from over-self-blame
- separate temporary failure from self-worth
- recognize patterns without sounding clinical
- avoid diagnosing the user
- avoid sounding like therapy language

Examples of good behavior:
- "It sounds like today wasn't only about the presentation itself."
- "Sometimes when someone has been criticized a lot, their confidence starts shrinking even outside the home."
- "That kind of environment can slowly make someone doubt themselves even when they're capable."

Never:
- over-explain psychology
- sound analytical
- list trauma concepts
- sound like a therapist
- make absolute conclusions about people
- aggressively blame family, friends, school, workplace, or relationships

Keep the tone:
- calm
- emotionally intelligent
- grounded
- human
- conversational
`.trim(),

`
WELLNESS REGULATION PRIORITY

When the user sounds overwhelmed, anxious, emotionally drained, restless, trapped, overstimulated, or unable to calm down:

- do not stop at emotional validation only
- gently include one small body-based regulation option when natural
- examples: slower breathing, stepping outside, sunlight, water, stretching, short walk, quiet stillness, light meditation, rest, softer surroundings
- make it optional, human, and conversational
- never give a list unless the user asks
- never sound like a wellness coach, therapist, medical professional, or productivity coach
- if the user says they do not want advice, stop suggesting actions and simply stay present

The goal is emotional stabilization, not wellness coaching.
`.trim(),

    checkinModeBlock,
    continuityBlock,
    nativeExpressionBlock,
    emotionalGuidanceBlock,

    behavioralSafety?.shouldRedirect === true &&
    ["medium", "high"].includes(behavioralSafety?.riskLevel)
      ? HARMFUL_INTENT_STEERING_PROMPT
      : "",

    variationBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildHumanNaturalityBlock() {
  return `
HUMAN NATURALITY

Talk like a calm, emotionally intelligent human being — not an assistant.

Avoid:
- sounding clinical
- sounding motivational
- sounding like therapy
- over-validating every emotion
- explaining emotions too formally
- repetitive empathy phrases
- robotic positivity
- sounding overly careful

Do not constantly:
- summarize
- analyze
- teach lessons
- reframe everything positively
- sound inspirational

Avoid phrases like:
- "That sounds incredibly difficult."
- "Your feelings are valid."
- "I’m here for you."
- "It’s understandable that..."
- "Thank you for sharing that."
- "That’s a wonderful perspective."

Instead:
- react naturally
- vary rhythm and pacing
- sometimes be brief
- sometimes ask grounded follow-up questions
- stay close to what the user actually said
- sound like a real human being thinking and responding naturally

Do not sound like customer support.
Do not sound like a therapist.
Do not sound like a motivational coach.
`.trim();
}

function isTooSimilar(a = "", b = "") {
  const normalize = (text) =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim();

  const aa = normalize(a);
  const bb = normalize(b);

  if (!aa || !bb) return false;

  if (aa === bb) return true;

  const aWords = aa.split(" ");
  const bWords = bb.split(" ");

  const overlap = aWords.filter((w) => bWords.includes(w)).length;

  return overlap >= Math.min(aWords.length, bWords.length) * 0.75;
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
  source = "chat",
  planConfig = {},
}) {
  const startedAt = Date.now();

  let emotionResult = null;
  let responseMode = "reflect";

  if (!uid) {
    return {
      reply: "Please sign in again.",
      path: "missing_verified_uid",
      dynamicMode: "fallback",
      humanState: null,
      memoryUpdate: null,
    };
  }

  if (!String(latestUserMessage || "").trim()) {
    return {
      reply: "I didn’t quite catch that. Please send it again.",
      path: "empty_user_message",
      dynamicMode: "fallback",
      humanState: null,
      memoryUpdate: null,
    };
  }

  const safeMessages = sanitizeConversationMessages(conversationMessages);
  const languageEnv = detectLanguageEnvironment(latestUserMessage);

  await incrementMetric("totalMessages", 1);
  await logDailyUser(uid);

  const languageInstruction = `
LANGUAGE ENVIRONMENT

Primary language: ${languageEnv.primaryLanguage}
Detected languages: ${languageEnv.detectedLanguages.join(", ")}
Mixed language: ${languageEnv.mixed}
Conversational style: ${languageEnv.conversationalStyle}

Mirror the user's natural language rhythm.
Do not translate unnaturally.
Do not default to English.
Sound socially native.
`;

  let behavioralSafety = {
  riskLevel: "none",
  category: "none",
  shouldRedirect: false,
  recommendedMode: "normal",
  reason: "safe_default",
};

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

    const emotional = buildEmotionalGuidanceBlock(latestUserMessage);
    emotionResult = emotional.emotionResult;
    responseMode = emotional.responseMode || "reflect";

    try {
  behavioralSafety = await analyzeBehavioralSafety({
    modelGenerate,
    latestUserMessage,
  });
} catch (err) {
  console.error("behavioral_safety_non_blocking_failed", err?.message || err);
}

    const variationBlock = buildVariationBlock(safeMessages);
    const checkinModeBlock = buildCheckinModeBlock(source);

    const prompt = buildBrainPrompt({
  systemPrompt,
  continuityBlock,
  nativeExpressionBlock,
  emotionalGuidanceBlock: emotional.emotionalGuidanceBlock,
  variationBlock,
  checkinModeBlock,
  languageInstruction,
  latestUserMessage,
  planConfig,
  behavioralSafety,
});

    debugLog("TALKIO_PIPELINE_DEBUG", {
      uid,
      responseMode,
      emotionResult,
      source,
      apiCallsPlanned: 1,
    });

    const raw = await modelGenerate({
      systemPrompt: prompt,
      messages: safeMessages,
    });

    let reply = normalizeReply(extractModelText(raw));

    debugLog("TALKIO_MODEL_RAW", {
    rawType: typeof raw,
    rawPreview: JSON.stringify(raw)?.slice(0, 500),
    extractedReply: reply?.slice(0, 200),
    extractedLength: reply?.length || 0,
    });

    reply = applySafetyGuard(reply, latestUserMessage);
    reply = cleanReply(reply);
    reply = humanizeReply(reply);

    const lastAssistantMessage =
  [...safeMessages]
    .reverse()
    .find((m) => m.role === "assistant")?.content || "";

  if (isTooSimilar(reply, lastAssistantMessage)) {
  try {
    const rewriteRaw = await modelGenerate({
      systemPrompt: `
You are rewriting a Talkio response.

Rules:
- keep the same emotional meaning
- avoid repeating wording
- avoid repeating sentence rhythm
- sound human and emotionally natural
- keep the same language as the user
- do not become robotic
- do not explain the rewrite
- do not use the same opening words
`,
      messages: [
        {
          role: "user",
          content: `
Original reply:
"${reply}"

Previous assistant reply:
"${lastAssistantMessage}"

User message:
"${latestUserMessage}"

Rewrite the ORIGINAL REPLY naturally.
`,
        },
      ],
    });

    const rewritten = cleanReply(
      humanizeReply(
        extractModelText(rewriteRaw)
      )
    );

    if (isSoftUsableReply(rewritten)) {
      reply = rewritten;
    }
  } catch (err) {
    console.error("rewrite_generation_failed", err?.message || err);
  }
}

if (isSoftUsableReply(reply)) {
  debugLog("TALKIO_PATH", {
    path: "core_identity_soft_accept",
    latencyMs: Date.now() - startedAt,
  });

  await logLatency(Date.now() - startedAt);
  await logResponseMode(responseMode);

  return {
    reply,
    path: "core_identity_soft_accept",
    dynamicMode: responseMode,
    humanState: {
  emotionResult,
  responseMode,
  source,
  behavioralSafety,
},
    memoryUpdate: {
      lastEmotion: emotionResult?.primaryEmotion ?? null,
      lastToneFamily: emotionResult?.toneFamily ?? null,
      lastIntensity: emotionResult?.intensity ?? null,
      lastResponseMode: responseMode ?? null,
      lastBehavioralRisk: behavioralSafety?.riskLevel ?? "none",
      lastBehavioralCategory: behavioralSafety?.category ?? "none",
    },
  };
}

    const path = source === "checkin" ? "checkin_recovery" : "core_recovery";

    debugLog("TALKIO_PATH", {
      path,
      latencyMs: Date.now() - startedAt,
    });

    await logFallback(path);

        return {
      reply: buildHumanRecovery(latestUserMessage, emotionResult),
      path,
      dynamicMode: responseMode,
      humanState: {
        emotionResult,
        responseMode,
        source,
      },
      memoryUpdate: null,
    };
  } catch (err) {
    console.error("Talkio error:", {
      message: err?.message || String(err),
      latencyMs: Date.now() - startedAt,
    });

    const path = source === "checkin" ? "checkin_recovery" : "core_recovery";

    debugLog("TALKIO_PATH", {
      path,
      latencyMs: Date.now() - startedAt,
      error: err?.message || String(err),
    });

    return {
      reply: buildHumanRecovery(latestUserMessage, emotionResult),
      path,
      dynamicMode: responseMode || "reflect",
      humanState: {
        emotionResult,
        responseMode,
        source,
        behavioralSafety,
      },
      memoryUpdate: null,
    };
  }
}

module.exports = {
  generateTalkioReply,
};