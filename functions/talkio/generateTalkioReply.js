"use strict";
// ==============================
// 🧠 HUMAN STATE ENGINE (NEW)
// ==============================

const {
  DISTRESS_PATTERNS,
  TRAJECTORY_PATTERNS,
  REPLY_PATTERNS,
  hasGroundModeShape,
} = require("./patterns");

const {
  debugLog,
  trackReplyLifecycle,
} = require("./debugMonitor");

const TALKIO_STATE_MAP = {
  experienceToState: {
    betrayal: "hurt",
    rejection: "disconnected",
    abandonment: "disconnected",
    neglect: "disconnected",
    infidelity: "hurt",
    manipulation: "threatened",
    gaslighting: "threatened",
    toxic_dependency: "conflicted",
    family_conflict: "conflicted",

    failure: "ashamed",
    shame: "ashamed",
    guilt: "ashamed",
    imposter_syndrome: "ashamed",
    comparison: "ashamed",
    loss_of_purpose: "stuck",
    identity_confusion: "stuck",

    death_of_loved_one: "grieving",
    breakup: "grieving",
    divorce: "grieving",
    loss_of_friendship: "grieving",
    loss_of_opportunity: "grieving",
    loss_of_stability: "threatened",
    anticipatory_grief: "grieving",

    burnout: "overwhelmed",
    chronic_stress: "overwhelmed",
    decision_paralysis: "stuck",
    feeling_stuck: "stuck",
    loss_of_control: "threatened",
    pressure: "overwhelmed",

    abuse: "threatened",
    bullying: "threatened",
    violence: "threatened",
    threat: "threatened",
    childhood_neglect: "disconnected",
    witnessing_trauma: "threatened",
    sudden_disruption: "overwhelmed",

    loneliness: "disconnected",
    isolation: "disconnected",
    social_rejection: "disconnected",
    meaninglessness: "stuck",
    existential_dread: "threatened",
    injustice: "activated",

    regret: "ashamed",
    moral_conflict: "conflicted",
    cognitive_dissonance: "conflicted",
    emotional_suppression: "stuck",
    self_sabotage: "ashamed",
  },

  stateToNeed: {
    hurt: "to_be_understood",
    disconnected: "to_be_seen",
    threatened: "to_be_safe",
    overwhelmed: "to_stabilize",
    grieving: "to_process_loss",
    ashamed: "to_restore_self_worth",
    stuck: "to_regain_control",
    conflicted: "to_hold_two_truths",
    activated: "to_release_without_harm",
    ready: "to_take_next_step",
    unclear: "to_clarify",
  },

  stateToDirection: {
    hurt: "validate",
    disconnected: "reconnect",
    threatened: "ground",
    overwhelmed: "stabilize",
    grieving: "hold_space",
    ashamed: "de_shame",
    stuck: "clarify",
    conflicted: "integrate",
    activated: "deescalate",
    ready: "empower",
    unclear: "clarify",
  },
};

const {
  loadContinuityMemory,
  saveContinuityMemory,
  buildContinuityBlock,
  extractContinuityPatch,
  extractNativeExpressionPatch,
  buildNativeExpressionBlock,
  buildExpressionControlBlock,
  buildPersonalityBlock,
  extractPersonalityPatch,
} = require("./memoryLiteV2");

function detectExperience(message = "") {
  const text = message.toLowerCase();

  const map = {
    rejection: ["ignored", "left out", "not included", "don't exist"],
    loss: ["lost", "gone", "passed away"],
    pressure: ["stress", "pressure", "overwhelmed"],
    loneliness: ["alone", "lonely"],
    burnout: ["tired", "exhausted"],
    invisibility: ["don't exist", "unnoticed"],
    abuse: ["abuse", "abusive", "hurt me", "violent"],
    family_conflict: ["mom", "mother", "dad", "father", "family"],
    boundary: ["boundary", "boundaries", "distance myself"],
    conflict: ["fight", "argue", "chaotic"],
    compassion: ["i understand her", "i feel for her", "i know why"],
  };

  return Object.keys(map).filter(key =>
    map[key].some(keyword => text.includes(keyword))
  );
}

function detectEmotion(message = "") {
  const text = message.toLowerCase();

  const map = {
    sadness: ["sad", "empty", "down"],
    anger: ["angry", "mad"],
    fear: ["scared", "afraid", "worried"],
    numbness: ["nothing", "numb"],
    frustration: ["frustrated"],
    confusion: ["confused", "lost"]
  };

  return Object.keys(map).filter(key =>
    map[key].some(keyword => text.includes(keyword))
  );
}

function detectIntensity(message = "") {
  const text = message.toLowerCase();
  if (/always|completely|overwhelmed|can't|never/.test(text)) return 3;
  if (/really|so much|very/.test(text)) return 2;
  return 1;
}

function deriveState(experience = [], emotions = []) {
  for (const item of experience) {
    const mapped = TALKIO_STATE_MAP.experienceToState[item];
    if (mapped) return mapped;
  }

  if (emotions.includes("fear")) return "threatened";
  if (emotions.includes("anger") || emotions.includes("frustration")) {
    return "activated";
  }
  if (emotions.includes("sadness")) return "hurt";
  if (emotions.includes("shame") || emotions.includes("guilt")) {
    return "ashamed";
  }
  if (emotions.includes("confusion")) return "stuck";
  if (emotions.includes("numbness")) return "disconnected";

  return "unclear";
}

function deriveNeed(state) {
  return TALKIO_STATE_MAP.stateToNeed[state] || "to_be_understood";
}

function deriveMode(state, intensity) {
  if (intensity >= 3) return "stabilize";
  if (state === "unclear") return "clarify";
  return "reflect";
}

function normalizeReply(reply) {
  return String(reply || "").trim();
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

function detectConversationDrift(messages = [], latestUserMessage = "") {
  const recentUserMessages = sanitizeConversationMessages(messages)
    .filter((m) => m.role === "user")
    .slice(-4)
    .map((m) => m.content)
    .concat(latestUserMessage)
    .filter(Boolean);

  const joined = recentUserMessages.join(" ").toLowerCase();

  const repeatedPain =
    /\b(again|still|always|same|keeps happening|nothing changes)\b/i.test(joined);

  const emotionalEscalation =
    /\b(can't|cant|too much|overwhelmed|falling apart|panic|done|tired of this)\b/i.test(joined);

  const withdrawal =
    /\b(i don't know|idk|whatever|nothing|forget it|nevermind|i'm fine)\b/i.test(joined);

  const readiness =
    /\b(what should i do|how do i|i want to|i need to|maybe i can|i will)\b/i.test(joined);

  if (emotionalEscalation) return "escalating";
  if (repeatedPain) return "looping";
  if (withdrawal) return "withdrawing";
  if (readiness) return "ready";
  return "stable";
}

function deriveAdaptiveDirection(humanState, drift) {
  if (drift === "escalating") return "stabilize";
  if (drift === "looping") return "interrupt_loop";
  if (drift === "withdrawing") return "hold_space";
  if (drift === "ready") return "empower";

  return (
    TALKIO_STATE_MAP.stateToDirection[humanState?.state] ||
    "reflect"
  );
}

function buildBrainPrompt(systemPrompt, latestUserMessage, state = {}, messages = []) {
  const experience = detectExperience(latestUserMessage);
  const emotions = detectEmotion(latestUserMessage);
  const intensity = detectIntensity(latestUserMessage);

  const rawState = deriveState(experience, emotions);

  const derivedState =
    rawState && rawState !== "unclear"
      ? rawState
      : "overwhelmed";

  const need = deriveNeed(derivedState);
  const baseMode = deriveMode(derivedState, intensity);
  const drift = detectConversationDrift(messages, latestUserMessage);

  const previousState = state?.memory?.lastState || null;
  const movementShift = detectMovementShift(previousState, derivedState);

  const guard = `
STYLE RULES:
- Speak like a real person sitting beside someone
- No explaining, analyzing, coaching, or summarizing the person
- Stay close to what they actually said
- Respond to one or two real things, not everything
- Keep it simple and grounded

RHYTHM CONTROL:
- Use short spoken chunks
- Let the reply breathe
- One idea per sentence
- Do not stack many insights in one paragraph
- Use gentle pauses only when natural: "yeah…", "that’s hard…", "I hear that"
- Do not overuse "oh", "wow", "hmm"
- Prefer 2–4 short sentences over one polished paragraph

SPEECH FEEL:
- Say it like you would out loud
- Slightly imperfect is better than polished
- No performance, no essay tone

REALISM CHECK:
If it sounds like advice, coaching, or a summary — rewrite it.

TARGET:
Someone present with you, not interpreting you.
`.trim();

  const humanState = {
    experience,
    emotions,
    intensity,
    energy: "low",
    state: derivedState,
    need,
    drift,
    movementShift,
    mode: baseMode,
    direction: deriveAdaptiveDirection(
      {
        experience,
        emotions,
        intensity,
        state: derivedState,
        need,
        mode: baseMode,
      },
      drift
    ),
  };

  debugLog("HUMAN_STATE_DEBUG", {
    humanState,
    dynamicMode: humanState.direction,
  });

  const stateBlock = `
HUMAN STATE MAP (internal only):
- state: ${humanState.state}
- need: ${humanState.need}
- drift: ${humanState.drift}
- movement: ${humanState.movementShift || "none"}
- direction: ${humanState.direction}

RESPONSE STRATEGY:
Use this silently. Do NOT label.

If movement exists:
- subtly acknowledge change (do NOT analyze)

If drift is escalating:
- be steady, short, grounding

If drift is looping:
- introduce a fresher angle

If drift is withdrawing:
- low pressure, do not chase

If drift is ready:
- give one clear next step
`.trim();

  return {
    dynamicMode: humanState.direction,
    humanState,
    prompt: [systemPrompt, stateBlock, guard].join("\n\n")
  };
}

// ==============================
// 🧠 SOFT VALIDATION (UPDATED)
// ==============================

function isUsableReply(reply = "") {
  const text = String(reply || "").trim();

  if (text.length < 3) return false;
  if (/\b(as an ai|language model|system prompt|policy)\b/i.test(text)) {
    return false;
  }

  return true;
}

// ==============================
// 🧠 REPAIR LAYER (SMART)
// ==============================

function detectMovementShift(prevState, currentState) {
  if (!prevState) return null;

  if (prevState === "disconnected" && currentState === "activated") {
    return "building_frustration";
  }

  if (prevState === "activated" && currentState === "hurt") {
    return "emotional_drop";
  }

  if (prevState === "hurt" && currentState === "withdrawing") {
    return "shutting_down";
  }

  return null;
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

    if (retries > 0 && code === 429) {
      await new Promise(r => setTimeout(r, 1000));
      return callWithRetry(fn, retries - 1);
    }

    throw e;
  }
}
function isTooWeakReply(text) {
  const trimmed = String(text || "").trim().toLowerCase();

  return (
    trimmed.length < 10 ||
    ["oh", "oh?", "hmm", "hmm.", "okay", "ok", "right"].includes(trimmed)
  );
}

// ==============================
// 🧠 MAIN FUNCTION
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

    const { dynamicMode, prompt, humanState } = buildBrainPrompt(
      [
        systemPrompt,
        continuityBlock,
        nativeExpressionBlock,
        personalityBlock,
      ].filter(Boolean).join("\n\n"),
      latestUserMessage,
      state,
      safeMessages
    );

    console.log("CLEAN_PIPELINE_V3_ACTIVE");

    const raw = await callWithRetry(() =>
  modelGenerate({
    systemPrompt: prompt,
    messages: safeMessages,
  })
);

    let reply = normalizeReply(
  typeof raw === "string" ? raw : raw?.text || raw?.reply || ""
);

// 🔥 dynamic repair (NO hardcoding)
if (isTooWeakReply(reply)) {
  const repairedRaw = await callWithRetry(() =>
    modelGenerate({
      systemPrompt: [
        prompt,
        `
REPAIR INSTRUCTION:
The previous reply was too thin or low-effort.

Write a fresh reply that:
- responds to the user's actual message
- stays natural and human
- does not sound scripted
- is not one-word or vague
- keeps the current emotional mode
- asks at most one useful question
`.trim(),
      ].join("\n\n"),
      messages: safeMessages,
    })
  );

  reply = normalizeReply(
    typeof repairedRaw === "string"
      ? repairedRaw
      : repairedRaw?.text || repairedRaw?.reply || ""
  );
}

    if (reply) {
      return {
        reply,
        path: "core_identity_direct",
        dynamicMode,
        humanState,
        memoryUpdate: {
          lastState: humanState?.state || null,
        },
      };
    }

    return {
      reply: "I’m here. Can you send that again?",
      path: "empty_model_reply_fallback",
      dynamicMode: "fallback",
      humanState,
      memoryUpdate: null,
    };
  } catch (err) {
    console.error("Talkio error:", err);

    return {
      reply: "Something went wrong on my end. Please try again.",
      path: "api_error_fallback",
      dynamicMode: "fallback",
      humanState: null,
      memoryUpdate: null,
    };
  }
}

module.exports = {
  generateTalkioReply
};