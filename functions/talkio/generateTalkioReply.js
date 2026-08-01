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
    applySafetyGuard,
  } = require("./localSafetyGuard");

  const {
    incrementMetric,
    logResponseMode,
    logFallback,
    logLatency,
    logDailyUser,
  } = require("../logging/metrics");

  const { debugLog } = require("./debugMonitor");

  const { detectCapabilities } = require("./router");
  const { buildPrompt } = require("./builder");

  const {
    createSemanticClassifier,
  } = require("./semanticClassifier");

  const {
    runSemanticShadow,
  } = require("./semanticShadowRunner");

  const {
  mergeSemanticCapabilities,
} = require("./semanticCapabilityMerger");

  const {
    recordSemanticShadowMetrics,
  } = require("../logging/semanticMetrics");

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

    if (text.length < 20) return false;

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
        .map((part) =>
          typeof part?.text === "string"
            ? part.text
            : ""
        )
        .join(" ");
    }

    if (
      typeof raw?.choices?.[0]?.message?.content ===
      "string"
    ) {
      return raw.choices[0].message.content;
    }

    return "";
  }

  // ==============================
  // Structured Result Validation
  // ==============================

  const ALLOWED_RISK_LEVELS = new Set([
    "none",
    "low",
    "medium",
    "high",
  ]);

  const ALLOWED_CATEGORIES = new Set([
    "none",
    "self_harm",
    "violence",
    "manipulation",
    "harassment",
    "exploitation",
    "deception",
    "revenge",
    "other",
  ]);

  const ALLOWED_RECOMMENDED_MODES = new Set([
    "normal",
    "accountability",
    "supportive_redirect",
    "crisis_support",
  ]);

  const ALLOWED_ACTIONS = new Set([
    "show_reply",
    "show_safety_block",
  ]);

  function buildSafeDefault(reason = "safe_default") {
    return {
      riskLevel: "none",
      category: "none",
      shouldRedirect: false,
      recommendedMode: "normal",
      reason,
    };
  }

  function stripJsonCodeFence(text = "") {
    return String(text || "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  function normalizeStructuredSafety(value) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return null;
    }

    const riskLevel = ALLOWED_RISK_LEVELS.has(
      value.riskLevel
    )
      ? value.riskLevel
      : "none";

    const category = ALLOWED_CATEGORIES.has(
      value.category
    )
      ? value.category
      : riskLevel === "none"
        ? "none"
        : "other";

    const recommendedMode =
      ALLOWED_RECOMMENDED_MODES.has(
        value.recommendedMode
      )
        ? value.recommendedMode
        : riskLevel === "high"
          ? "crisis_support"
          : value.shouldRedirect === true
            ? "supportive_redirect"
            : "normal";

    return {
      riskLevel,
      category,
      shouldRedirect:
        value.shouldRedirect === true,
      recommendedMode,
      reason:
        typeof value.reason === "string" &&
        value.reason.trim()
          ? value.reason.trim().slice(0, 240)
          : "model_classification",
    };
  }

  function parseTalkioStructuredResponse(raw) {
    const rawText = stripJsonCodeFence(
      extractModelText(raw)
    );

    if (!rawText) return null;

    let parsed;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      return null;
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const reply = normalizeReply(parsed.reply);

    const safety = normalizeStructuredSafety(
      parsed.safety
    );

    const action = ALLOWED_ACTIONS.has(
      parsed.action
    )
      ? parsed.action
      : "show_reply";

    if (reply == null || !safety) {
      return null;
    }

    return {
      reply,
      safety,
      action,
    };
  }

  function shouldShowSafetyBlock({
    action,
    safety,
  }) {
    return (
      action === "show_safety_block" &&
      safety?.riskLevel === "high" &&
      safety?.shouldRedirect === true
    );
  }

  function buildStructuredOutputBlock() {
    return `
  STRUCTURED OUTPUT — REQUIRED

  Return exactly one valid JSON object with this shape:

  {
    "reply": "string",
    "safety": {
      "riskLevel": "none | low | medium | high",
      "category": "none | self_harm | violence | manipulation | harassment | exploitation | deception | revenge | other",
      "shouldRedirect": false,
      "recommendedMode": "normal | accountability | supportive_redirect | crisis_support",
      "reason": "brief classification reason"
    },
    "action": "show_reply | show_safety_block"
  }

  SAFETY RULES

  - Classify the user's latest message in the same generation used to write the reply.
  - Use multilingual understanding.
  - Do not rely only on English wording.
  - "high" means an immediate or credible danger involving self-harm or violence.
  - Use "show_safety_block" only when riskLevel is "high" AND shouldRedirect is true.
  - Emotional pain, sadness, anger, loneliness, hopelessness, or distress alone must not automatically trigger the block screen.
  - For harmful but non-immediate requests, use "show_reply" and respond with accountability or a supportive redirect.
  - The reply must remain in the exact same language or natural language mix as the user's latest message.

  FORMATTING RULES

  - Return JSON only.
  - Do not use Markdown code fences.
  - Do not add commentary before or after the JSON.
  - Do not label the result as JSON.
  - Escape quotation marks and line breaks so the JSON remains valid.
  `.trim();
  }

  function sanitizeConversationMessages(messages) {
    if (!Array.isArray(messages)) return [];

    return messages.filter(
      (message) =>
        message &&
        [
          "user",
          "assistant",
          "system",
        ].includes(message.role) &&
        typeof message.content === "string" &&
        message.content.trim()
    );
  }

  function buildLanguageControlBlock() {
    return `
  LANGUAGE

  Reply in the same language or natural language mix
  used in the user's latest message.

  Do not translate unless the user asks.

  Mirror the user's natural conversational style.

  Do not default to English when the user is clearly using another language.

  Prefer neutral everyday language over idioms that contain
  violence, weapons, death, crime, or disasters.

  Avoid expressions like:

  • jumped the gun
  • bite the bullet
  • kill two birds with one stone
  • shoot yourself in the foot
  • dodged a bullet
  • back against the wall
  • pulling the trigger
  • hit the nail on the head (optional)

  Instead use:

  • I got ahead of myself.
  • Let's do the hard part.
  • Solve two problems at once.
  • That may make things harder.
  • You were fortunate.
  • You're under pressure.
  • Make the decision.
  • That's exactly right.

  `.trim();
  }

  function buildHumanRecovery(
    userMessage = "",
    emotionResult = null
  ) {
    const text = String(
      userMessage || ""
    ).trim();

    const intensity =
      emotionResult?.intensity || "";

    const tone =
      emotionResult?.toneFamily || "";

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

    const pool = looksEmotional
      ? emotionalPool
      : casualPool;

    return pool[
      Math.floor(Math.random() * pool.length)
    ];
  }

  function buildServiceRecovery() {
    return "I received what you shared. I'm having trouble replying right now. Please try again in a little while.";
  }

  // ==============================
  // Prompt Builder
  // ==============================

  function buildVariationBlock(
    conversationMessages = []
  ) {
    const recentAssistantReplies = (
      conversationMessages || []
    )
      .filter(
        (message) =>
          message?.role === "assistant" &&
          typeof message.content === "string"
      )
      .slice(-3)
      .map((message) =>
        message.content.trim()
      )
      .filter(Boolean);

    if (!recentAssistantReplies.length) {
      return "";
    }

    return `
  VARIATION CONTROL

  Avoid repeating the structure, opening phrase, or rhythm of the recent assistant replies.

  Recent assistant replies:

  ${recentAssistantReplies
    .map(
      (reply, index) =>
        `${index + 1}. ${reply}`
    )
    .join("\n")}

  Rules:

  - Do not start with the same first three words as recent replies.
  - Do not reuse the same sentence structure.
  - Avoid repeatedly opening with "you are", "this is", "that is", or "something in this".
  - Change the phrasing style naturally: statement, contrast, observation, question, or direct truth.
  - Keep the tone calm, direct, and grounded.
  - Keep the meaning consistent while changing the expression.
  `.trim();
  }

  function buildCheckinModeBlock(
    source = "chat"
  ) {
    if (source !== "checkin") {
      return "";
    }

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
    timeContextBlock,
    nicknameBlock,
    memoryPromptBlock,
    continuityBlock,
    nativeExpressionBlock,
    emotionalGuidanceBlock,
    harmfulIntentBlock,
    variationBlock,
    checkinModeBlock,
    languageInstruction,
    planConfig,
  }) {

    return [
      buildLanguageControlBlock(),

      languageInstruction,

      systemPrompt,

      timeContextBlock,

      nicknameBlock,

      memoryPromptBlock,

      buildHumanNaturalityBlock(),

  `
  PLAN

  Tier: ${planConfig?.label || "Free"}
  Reply: ${planConfig?.replyLength || "natural"}
  Depth: ${planConfig?.replyDepth || "natural"}
  Memory: ${planConfig?.memoryLevel || "standard"}

  Never mention the user's plan in conversation.
  `.trim(),

  `
  LENGTH

  Match reply length to the moment.

  Simple messages can be short.

  Meaningful or emotional messages should be long enough
  to feel present, clear, and complete.

  Do not pad replies or compress important moments.
  `.trim(),

      checkinModeBlock,

      continuityBlock,

      nativeExpressionBlock,

      emotionalGuidanceBlock,

      harmfulIntentBlock,

      variationBlock,

      buildStructuredOutputBlock(),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  function buildHumanNaturalityBlock() {
    return `
  HUMAN NATURALITY

  Talk like a calm older brother, not an assistant.

  Do not automatically validate every emotion.

  Do not routinely begin serious replies with:

  - "That sounds..."
  - "That's incredibly..."
  - "It's understandable..."
  - "That must be..."
  - "It sounds like..."

  Instead, react naturally first when appropriate.

  Examples:

  "Wait, what happened?"

  "Hold on."

  "That's a big statement."

  "Walk me through it."

  "Alright. Start from the beginning."

  "Okay, now I'm curious."

  Sound like a real older brother hearing something, not a therapist reflecting something.

  Avoid:

  - sounding clinical
  - sounding motivational
  - sounding like therapy
  - over-validating every emotion
  - explaining emotions too formally
  - repetitive empathy phrases
  - robotic positivity
  - sounding unnecessarily cautious

  Stay close to what the user actually said.

  Do not constantly summarize, analyze, teach, or reframe.

  If wisdom is needed, rely on the Observation, Reasoning, and Wisdom layers already provided in the system prompt.
  `.trim();
  }

  function isTooSimilar(
    firstReply = "",
    secondReply = ""
  ) {
    const normalize = (text) =>
      String(text || "")
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .trim();

    const first = normalize(firstReply);
    const second = normalize(secondReply);

    if (!first || !second) {
      return false;
    }

    if (first === second) {
      return true;
    }

    const firstWords = first.split(" ");
    const secondWords = second.split(" ");

    const overlap = firstWords.filter(
      (word) => secondWords.includes(word)
    ).length;

    return (
      overlap >=
      Math.min(
        firstWords.length,
        secondWords.length
      ) *
        0.75
    );
  }

  // ==============================
  // Main Function
  // ==============================

  async function generateTalkioReply({
    uid,
    modelGenerate,

    /*
    * Legacy emergency fallback prompt.
    */
    systemPrompt,

    /*
    * Small runtime context blocks.
    */
    timeContextBlock = "",
    nicknameBlock = "",
    memoryPromptBlock = "",

    conversationMessages,
    latestUserMessage,
    source = "chat",
    planConfig = {},
  }) {
    const startedAt = Date.now();

    let emotionResult = null;
    let responseMode = "respond";

    if (!uid) {
      return {
        reply: "Please sign in again.",
        safety: buildSafeDefault(
          "missing_verified_uid"
        ),
        action: "show_reply",
        blocked: false,
        path: "missing_verified_uid",
        dynamicMode: "fallback",
        humanState: null,
        memoryUpdate: null,
      };
    }

    if (
      !String(
        latestUserMessage || ""
      ).trim()
    ) {
      return {
        reply:
          "I didn’t quite catch that. Please send it again.",
        safety: buildSafeDefault(
          "empty_user_message"
        ),
        action: "show_reply",
        blocked: false,
        path: "empty_user_message",
        dynamicMode: "fallback",
        humanState: null,
        memoryUpdate: null,
      };
    }

    const safeMessages =
      sanitizeConversationMessages(
        conversationMessages
      );

    const languageEnv =
      detectLanguageEnvironment(
        latestUserMessage
      );

    await incrementMetric(
      "totalMessages",
      1
    );

    await logDailyUser(uid);

    const languageInstruction = `
  LANGUAGE ENVIRONMENT

  Primary: ${languageEnv.primaryLanguage}
  Mixed: ${languageEnv.mixed}
  Style: ${languageEnv.conversationalStyle}

  Reply naturally in that language or language mix.
  `.trim();

    let behavioralSafety =
      buildSafeDefault();

    let localSafetyFallback =
      buildSafeDefault(
        "local_fallback_default"
      );

    try {
      let continuityMemory = null;

      try {
        continuityMemory =
          await loadContinuityMemory(uid);
      } catch (error) {
        console.error(
          "continuity_memory_load_failed",
          {
            uid,
            message:
              error?.message ||
              String(error),
          }
        );
      }

      const continuityBlock =
        buildContinuityBlock(
          continuityMemory
        );

      const nativeExpressionBlock =
        buildNativeExpressionBlock(
          continuityMemory
        );

      const emotional =
        buildEmotionalGuidanceBlock(
          latestUserMessage
        );

      emotionResult =
        emotional.emotionResult;

      responseMode =
        emotional.responseMode ||
        "reflect";

      try {
        localSafetyFallback =
          await analyzeBehavioralSafety({
            latestUserMessage,
          });
      } catch (error) {
        console.error(
          "behavioral_safety_non_blocking_failed",
          error?.message || error
        );
      }
      const harmfulIntentBlock =
    localSafetyFallback.shouldRedirect &&
    ["medium","high"].includes(localSafetyFallback.riskLevel)
      ? HARMFUL_INTENT_STEERING_PROMPT
      : "";

      const variationBlock =
        buildVariationBlock(
          safeMessages
        );

      const checkinModeBlock =
        buildCheckinModeBlock(
          source
        );

      let v3Capabilities;
      let finalCapabilities;
      let activeSystemPrompt;
      let promptRoutingMode = "dynamic";

    try {
  v3Capabilities = detectCapabilities({
    userMessage: latestUserMessage,
    conversation: safeMessages,
    memory: continuityMemory,
  });

  const capabilityMerge =
    mergeSemanticCapabilities({
      v3Capabilities,
      semanticResult: null,
    });

  finalCapabilities =
    capabilityMerge.finalCapabilities;

  activeSystemPrompt =
    buildPrompt(finalCapabilities);

  if (!activeSystemPrompt) {
    throw new Error(
      "Dynamic prompt builder returned an empty prompt"
    );
  }
} catch (error) {

    promptRoutingMode = "legacy_fallback";

    console.error("dynamic_prompt_routing_failed", {
      uid,
      message: error?.message || String(error),
    });

    /*
    * Keep the previous system prompt only as an emergency fallback.
    * It is no longer appended during normal routed requests.
    */
    activeSystemPrompt = String(systemPrompt || "").trim();

    if (!activeSystemPrompt) {
      throw new Error(
        "Both dynamic and legacy system prompts are unavailable"
      );
    }

    v3Capabilities = ["legacyFallback"];
    finalCapabilities = ["legacyFallback"];
  }
    /*
  |--------------------------------------------------------------------------
  | V4 Semantic Assistant — Shadow Mode
  |--------------------------------------------------------------------------
  |
  | V3 remains the production router.
  |
  | The semantic result is comparison data only.
  | It must never change capabilities, activeSystemPrompt,
  | the final prompt, or the user-facing reply.
  |
  */

  let semanticShadowPromise =
    Promise.resolve({
      mode: "shadow",
      consulted: false,
      reason:
        promptRoutingMode ===
        "legacy_fallback"
          ? "legacy_fallback_active"
          : "not_started",
    });

  if (
    promptRoutingMode === "dynamic"
  ) {
    try {
      const classify =
        createSemanticClassifier({
          modelGenerate,
        });

      semanticShadowPromise =
        runSemanticShadow({
          userMessage:
            latestUserMessage,

          v3Capabilities,

          languageMeta: languageEnv,

          classify,
        }).catch((error) => ({
          mode: "shadow",
          consulted: true,
          parsed: false,
          semanticSignals: null,
          semanticCapabilities: [],
          comparison: null,
          reason:
            "shadow_runner_error",
          error:
            error?.message ||
            String(error),
        }));
    } catch (error) {
      semanticShadowPromise =
        Promise.resolve({
          mode: "shadow",
          consulted: false,
          parsed: false,
          semanticSignals: null,
          semanticCapabilities: [],
          comparison: null,
          reason:
            "shadow_initialization_error",
          error:
            error?.message ||
            String(error),
        });
    }
  }

  const prompt = buildBrainPrompt({
    systemPrompt: activeSystemPrompt,

    timeContextBlock,
    nicknameBlock,
    memoryPromptBlock,

    continuityBlock,
    nativeExpressionBlock,

    emotionalGuidanceBlock:
      emotional.emotionalGuidanceBlock,

    harmfulIntentBlock,

    variationBlock,
    checkinModeBlock,
    languageInstruction,
    planConfig,
  });

      debugLog(
    "TALKIO_PIPELINE_DEBUG",
    {
      uid,
      responseMode,
      emotionResult,
      source,
      apiCallsPlanned:
      promptRoutingMode === "dynamic"
      ? "1_or_2"
      : 1,
      promptRoutingMode,
      v3Capabilities,
      finalCapabilities,
      routedCapabilityCount:
      finalCapabilities.length,
      routedPromptCharacters: activeSystemPrompt.length,
      finalPromptCharacters: prompt.length,
    }
  );

      /*
  * Best-effort semantic shadow logging.
  *
  * Do not await this promise.
  * V4 must never delay or interrupt the production reply.
  */
  semanticShadowPromise
  .then((semanticShadowResult) => {
    debugLog(
      "TALKIO_SEMANTIC_SHADOW",
      {
        uid,

        consulted:
          semanticShadowResult
            ?.consulted === true,

        gateReason:
          semanticShadowResult
            ?.gate?.reason ||
          null,

        resultReason:
          semanticShadowResult
            ?.reason ||
          null,

        parsed:
          semanticShadowResult
            ?.parsed === true,

        detectedLanguage:
          semanticShadowResult
            ?.semanticSignals
            ?.detectedLanguage ||
          null,

        isMixedLanguage:
          semanticShadowResult
            ?.semanticSignals
            ?.isMixedLanguage ??
          null,

        semanticConfidence:
          semanticShadowResult
            ?.semanticSignals
            ?.confidence ??
          null,

        v3Capabilities,

        semanticCapabilities:
          semanticShadowResult
            ?.semanticCapabilities ||
          [],

        agrees:
          semanticShadowResult
            ?.comparison?.agrees ??
          null,

        addedBySemantic:
          semanticShadowResult
            ?.comparison
            ?.addedBySemantic ||
          [],

        missingFromSemantic:
          semanticShadowResult
            ?.comparison
            ?.missingFromSemantic ||
          [],
      }
    );

    recordSemanticShadowMetrics(
      semanticShadowResult
    ).catch((error) => {
      console.error(
        "semantic_metrics_failed",
        error?.message || error
      );
    });
  })
  .catch((error) => {
    debugLog(
      "TALKIO_SEMANTIC_SHADOW",
      {
        uid,
        consulted: true,
        parsed: false,
        resultReason:
          "shadow_logging_error",
        error:
          error?.message ||
          String(error),
      }
    );
  });

  const raw =
    await modelGenerate({
      systemPrompt: prompt,
      messages: safeMessages,
    });

      const structuredResult =
        parseTalkioStructuredResponse(
          raw
        );

      debugLog(
        "TALKIO_MODEL_RAW",
        {
          rawType: typeof raw,
          rawPreview:
            JSON.stringify(raw)?.slice(
              0,
              500
            ),
          structuredParsed:
            Boolean(structuredResult),
        }
      );

      if (!structuredResult) {
        const path =
          "structured_response_invalid";

        debugLog(
          "TALKIO_PATH",
          {
            path,
            latencyMs:
              Date.now() -
              startedAt,
          }
        );

        await logFallback(path);

        return {
          reply: buildHumanRecovery(
            latestUserMessage,
            emotionResult
          ),
          safety:
            localSafetyFallback,
          action: "show_reply",
          blocked: false,
          path,
          dynamicMode:
            responseMode,
          humanState: {
            emotionResult,
            responseMode,
            source,
            behavioralSafety:
              localSafetyFallback,
          },
          memoryUpdate: null,
        };
      }

      behavioralSafety =
        structuredResult.safety;

      const action =
        structuredResult.action;

      let reply = cleanReply(
        structuredResult.reply
      );

      reply = humanizeReply(reply);

      debugLog(
        "TALKIO_STRUCTURED_RESULT",
        {
          uid,
          riskLevel:
            behavioralSafety.riskLevel,
          category:
            behavioralSafety.category,
          shouldRedirect:
            behavioralSafety.shouldRedirect,
          recommendedMode:
            behavioralSafety.recommendedMode,
          action,
          replyLength:
            reply.length,
        }
      );

      if (
        shouldShowSafetyBlock({
          action,
          safety:
            behavioralSafety,
        })
      ) {
        const path =
          "safety_block";

        await logLatency(
          Date.now() -
            startedAt
        );

        await logResponseMode(
          "crisis_support"
        );

        return {
          reply,
          safety:
            behavioralSafety,
          action:
            "show_safety_block",
          blocked: true,
          path,
          dynamicMode:
            "crisis_support",
          humanState: {
            emotionResult,
            responseMode:
              "crisis_support",
            source,
            behavioralSafety,
          },
          memoryUpdate: null,
        };
      }

      reply = applySafetyGuard({
        reply,
        behavioralSafety,
      });

      reply = normalizeReply(reply);

          const lastAssistantMessage =
        [...safeMessages]
          .reverse()
          .find(
            (message) =>
              message.role ===
              "assistant"
          )?.content || "";

      if (
        isTooSimilar(
          reply,
          lastAssistantMessage
        )
      ) {
        debugLog(
          "TALKIO_REPLY_SIMILARITY",
          {
            uid,
            similarToPrevious: true,
            replyPreview:
              reply.slice(0, 160),
            previousReplyPreview:
              lastAssistantMessage.slice(
                0,
                160
              ),
          }
        );
      }

      if (isSoftUsableReply(reply)) {
        const path =
          "core_identity_soft_accept";

        debugLog(
          "TALKIO_PATH",
          {
            path,
            latencyMs:
              Date.now() -
              startedAt,
          }
        );

        await logLatency(
          Date.now() -
            startedAt
        );

        await logResponseMode(
          responseMode
        );

        return {
          reply,
          safety:
            behavioralSafety,
          action: "show_reply",
          blocked: false,
          path,
          dynamicMode:
            responseMode,
          humanState: {
            emotionResult,
            responseMode,
            source,
            behavioralSafety,
          },
          memoryUpdate: {
            lastEmotion:
              emotionResult
                ?.primaryEmotion ??
              null,

            lastToneFamily:
              emotionResult
                ?.toneFamily ??
              null,

            lastIntensity:
              emotionResult
                ?.intensity ??
              null,

            lastResponseMode:
              responseMode ??
              null,

            lastBehavioralRisk:
              behavioralSafety
                ?.riskLevel ??
              "none",

            lastBehavioralCategory:
              behavioralSafety
                ?.category ??
              "none",
          },
        };
      }

      const path =
        source === "checkin"
          ? "checkin_recovery"
          : "core_recovery";

      debugLog(
        "TALKIO_PATH",
        {
          path,
          latencyMs:
            Date.now() -
            startedAt,
        }
      );

      await logFallback(path);

      return {
        reply: buildHumanRecovery(
          latestUserMessage,
          emotionResult
        ),
        safety:
          localSafetyFallback,
        action: "show_reply",
        blocked: false,
        path,
        dynamicMode:
          responseMode,
        humanState: {
          emotionResult,
          responseMode,
          source,
          behavioralSafety:
            localSafetyFallback,
        },
        memoryUpdate: null,
      };
    } catch (error) {
      console.error(
        "Talkio error:",
        {
          message:
            error?.message ||
            String(error),

          latencyMs:
            Date.now() -
            startedAt,
        }
      );

      const path =
        source === "checkin"
          ? "checkin_recovery"
          : "core_recovery";

      debugLog(
        "TALKIO_PATH",
        {
          path,
          latencyMs:
            Date.now() -
            startedAt,

          error:
            error?.message ||
            String(error),
        }
      );

      await logFallback(path);

      return {
        reply:
          buildServiceRecovery(),

        safety:
          localSafetyFallback,

        action:
          "show_reply",

        blocked:
          false,

        path,

        dynamicMode:
          responseMode ||
          "reflect",

        humanState: {
          emotionResult,
          responseMode,
          source,
          behavioralSafety:
            localSafetyFallback,
        },

        memoryUpdate:
          null,
      };
    }
  }

  module.exports = {
    generateTalkioReply,
  };
