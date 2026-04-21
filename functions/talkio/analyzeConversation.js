"use strict";

const {
  DISTRESS_PATTERNS,
  TRAJECTORY_PATTERNS,
} = require("./patterns");

function detectLanguageMirror(text = "") {
  const raw = String(text || "").trim();
  const t = raw.toLowerCase();

  const taglishMarkers = [
    "naman", "kasi", "pero", "lang", "sige", "grabe",
    "nahihiya", "hirap", "kapoy", "ayoko", "okay lang",
    "pwede", "gusto", "wala", "meron", "pagod", "nakakapagod",
  ];

  const spanishMarkers = [
    "estoy", "gracias", "hola", "porque", "buenos", "buenas",
    "puedo", "quiero", "tengo", "siento", "ayuda", "cansado",
    "triste", "hoy", "mañana",
  ];

  const portugueseMarkers = [
    "oi", "obrigado", "obrigada", "porque", "quero", "tenho",
    "estou", "cansado", "triste", "amanhã", "hoje",
  ];

  const frenchMarkers = [
    "bonjour", "merci", "parce", "je suis", "fatigué", "fatigue",
    "triste", "aujourd", "demain", "besoin",
  ];

  const germanMarkers = [
    "hallo", "danke", "weil", "ich bin", "müde", "traurig",
    "heute", "morgen", "hilfe",
  ];

  const hasCJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(raw);
  const hasHangul = /[\uac00-\ud7af]/.test(raw);
  const hasArabic = /[\u0600-\u06ff]/.test(raw);
  const hasCyrillic = /[\u0400-\u04ff]/.test(raw);
  const hasDevanagari = /[\u0900-\u097f]/.test(raw);
  const hasThai = /[\u0e00-\u0e7f]/.test(raw);

  const countMatches = (markers) => markers.filter((w) => t.includes(w)).length;

  const taglishCount = countMatches(taglishMarkers);
  const spanishCount = countMatches(spanishMarkers);
  const portugueseCount = countMatches(portugueseMarkers);
  const frenchCount = countMatches(frenchMarkers);
  const germanCount = countMatches(germanMarkers);

  if (taglishCount >= 2) {
    return {
      language: "taglish",
      mirrorInstruction:
        "Mirror the user's Taglish naturally. Keep it clear, warm, and not overly slang-heavy.",
    };
  }

  if (hasHangul) {
    return {
      language: "korean",
      mirrorInstruction:
        "Reply in Korean, matching the user's tone and formality level naturally.",
    };
  }

  if (hasCJK) {
    return {
      language: "cjk",
      mirrorInstruction:
        "Reply in the same East Asian language/script the user is using. Keep it natural, simple, and emotionally clear.",
    };
  }

  if (hasArabic) {
    return {
      language: "arabic",
      mirrorInstruction:
        "Reply in Arabic, matching the user's tone naturally and keeping the phrasing clear and supportive.",
    };
  }

  if (hasCyrillic) {
    return {
      language: "cyrillic_script",
      mirrorInstruction:
        "Reply in the same Cyrillic-script language the user is using, matching tone naturally.",
    };
  }

  if (hasDevanagari) {
    return {
      language: "devanagari_script",
      mirrorInstruction:
        "Reply in the same Devanagari-script language the user is using, matching tone naturally.",
    };
  }

  if (hasThai) {
    return {
      language: "thai",
      mirrorInstruction:
        "Reply in Thai, matching the user's tone naturally.",
    };
  }

  if (spanishCount >= 2) {
    return {
      language: "spanish",
      mirrorInstruction:
        "Reply in Spanish, matching the user's tone naturally and clearly.",
    };
  }

  if (portugueseCount >= 2) {
    return {
      language: "portuguese",
      mirrorInstruction:
        "Reply in Portuguese, matching the user's tone naturally and clearly.",
    };
  }

  if (frenchCount >= 2) {
    return {
      language: "french",
      mirrorInstruction:
        "Reply in French, matching the user's tone naturally and clearly.",
    };
  }

  if (germanCount >= 2) {
    return {
      language: "german",
      mirrorInstruction:
        "Reply in German, matching the user's tone naturally and clearly.",
    };
  }

  return {
    language: "english_or_unrecognized",
    mirrorInstruction:
      "Reply in the same language the user is currently using, even if the language is not explicitly recognized. If the language is unclear or mixed, follow the dominant language of the message. Do not default to English unless the user is clearly using English. If the user's language is unclear, respond in simple, neutral English.",
  };
}

function detectConversationState(messages = []) {
  const joined = messages
    .map((m) => `${m.role || ""}: ${String(m.content || "").toLowerCase()}`)
    .join("\n");

  const state = {
    emotionalTone: "neutral",
    stability: "stable",
    risk: "normal",
  };

  const hasDistress = DISTRESS_PATTERNS.distress.test(joined);
  const hasOverwhelm = DISTRESS_PATTERNS.overwhelm.test(joined);
  const hasNumbness = DISTRESS_PATTERNS.numbness.test(joined);
  const hasSuppression = DISTRESS_PATTERNS.suppression.test(joined);
  const hasAgitation = DISTRESS_PATTERNS.agitation.test(joined);
  const hasIntoxication = DISTRESS_PATTERNS.intoxication.test(joined);
  const hasIndirectCoping = DISTRESS_PATTERNS.indirectCoping.test(joined);
  const hasFragileRecovery = DISTRESS_PATTERNS.fragileRecovery.test(joined);
  const hasIdentityCollapse = DISTRESS_PATTERNS.identityCollapse.test(joined);
  const hasAbandonment = DISTRESS_PATTERNS.abandonment.test(joined);

  if (hasDistress || hasIdentityCollapse || hasAbandonment) {
    state.emotionalTone = "distressed";
  } else if (hasNumbness) {
    state.emotionalTone = "numb";
  } else if (hasSuppression) {
    state.emotionalTone = "suppressed";
  } else if (hasAgitation) {
    state.emotionalTone = "agitated";
  }

  if (hasOverwhelm || hasNumbness || hasIndirectCoping || hasIdentityCollapse) {
    state.stability = "unstable";
  }

  if (hasIntoxication) {
    state.risk = "elevated";
  }

  if (
    (hasDistress && hasIntoxication) ||
    (hasOverwhelm && hasIntoxication) ||
    (hasNumbness && hasIndirectCoping) ||
    (hasIdentityCollapse && hasIntoxication)
  ) {
    state.stability = "unstable";
    state.risk = "high";
  }

  if (
    hasFragileRecovery &&
    (hasDistress || hasOverwhelm || hasNumbness || hasIntoxication)
  ) {
    state.stability = "fragile";
  }

  return state;
}

function detectGroundingNeed(messages = []) {
  const joined = messages
    .map((m) => `${m.role || ""}: ${String(m.content || "").toLowerCase()}`)
    .join("\n");

  const overwhelmed = DISTRESS_PATTERNS.overwhelm.test(joined);
  const intoxicated = DISTRESS_PATTERNS.intoxication.test(joined);
  const disoriented = DISTRESS_PATTERNS.disoriented.test(joined);
  const hasIdentityCollapse = DISTRESS_PATTERNS.identityCollapse.test(joined);

  return (
    overwhelmed ||
    hasIdentityCollapse ||
    (intoxicated && disoriented) ||
    (overwhelmed && intoxicated) ||
    (overwhelmed && disoriented)
  );
}

function detectTrajectory(messages = []) {
  const userMessages = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.role === "user" && typeof m.content === "string")
    .map((m) => m.content.trim())
    .filter(Boolean);

  const recent = userMessages.slice(-6);
  const joined = recent.join("\n").toLowerCase();

  let distressCount = 0;
  let lightCount = 0;
  let shutdownCount = 0;
  let loopCount = 0;

  for (const text of recent) {
    const t = text.toLowerCase();
    if (TRAJECTORY_PATTERNS.strongDistress.test(t)) distressCount++;
    if (TRAJECTORY_PATTERNS.lighterSurface.test(t)) lightCount++;
    if (TRAJECTORY_PATTERNS.shutdown.test(t)) shutdownCount++;
    if (TRAJECTORY_PATTERNS.repeatedLoop.test(t)) loopCount++;
  }

  const last = recent[recent.length - 1]?.toLowerCase() || "";
  const prev = recent[recent.length - 2]?.toLowerCase() || "";

  const suddenDrop =
    TRAJECTORY_PATTERNS.lighterSurface.test(prev) &&
    TRAJECTORY_PATTERNS.strongDistress.test(last);

  const maskingLikely =
    distressCount >= 1 &&
    lightCount >= 1 &&
    /\b(haha|lol|i'm fine|im fine|whatever|it's fine|its fine)\b/i.test(last);

  const worsening =
    distressCount >= 2 &&
    (loopCount >= 1 || /\b(still|nothing changed|falling apart|worse)\b/i.test(last));

  const looping =
    loopCount >= 2 ||
    /\b(same thing|same problem|again and again|over and over)\b/i.test(joined);

  const shutDown =
    shutdownCount >= 1 && /\b(never mind|doesn't matter|forget it|doesnt matter)\b/i.test(last);

  if (suddenDrop) {
    return {
      mode: "sudden_drop",
      worsening: true,
      maskingLikely: false,
      looping: false,
      shutDown: false,
    };
  }

  if (worsening) {
    return {
      mode: "worsening",
      worsening: true,
      maskingLikely,
      looping,
      shutDown,
    };
  }

  if (maskingLikely) {
    return {
      mode: "masking",
      worsening: false,
      maskingLikely: true,
      looping,
      shutDown,
    };
  }

  if (looping) {
    return {
      mode: "looping",
      worsening: false,
      maskingLikely: false,
      looping: true,
      shutDown,
    };
  }

  if (shutDown) {
    return {
      mode: "shutdown",
      worsening: false,
      maskingLikely: false,
      looping: false,
      shutDown: true,
    };
  }

  return {
    mode: "stable",
    worsening: false,
    maskingLikely: false,
    looping: false,
    shutDown: false,
  };
}

function detectToneInertia(conversationState = {}, latestUserMessage = "") {
  const text = String(latestUserMessage || "").toLowerCase();

  const casualSurface =
    /\b(haha|lol|lmao|whatever|okay fine|i'm good|im good|just chilling|at the bar|drunk as hell|all good)\b/i.test(
      text
    );

  const heavyState =
    conversationState?.emotionalTone === "distressed" ||
    conversationState?.emotionalTone === "numb" ||
    conversationState?.emotionalTone === "suppressed" ||
    conversationState?.stability === "unstable" ||
    conversationState?.stability === "fragile" ||
    conversationState?.risk === "high";

  if (heavyState && casualSurface) {
    return "hold_serious_tone";
  }

  return "normal";
}

function detectResponseMode({
  latestUserMessage = "",
  conversationState = {},
  trajectory = {},
  groundingNeeded = false,
}) {
  const text = String(latestUserMessage || "").toLowerCase();

  const hasIdentityCollapse = DISTRESS_PATTERNS.identityCollapse.test(text);
  const hasShutdown =
    /\b(never mind|forget it|doesn't matter|doesnt matter|leave it)\b/i.test(text);

  const hasDirectQuestion =
    /\?$/.test(text) ||
    /\b(what should i do|can you help|what now|how do i)\b/i.test(text);

  const hasLooping = trajectory?.mode === "looping";
  const hasWorsening =
    trajectory?.mode === "worsening" || trajectory?.mode === "sudden_drop";

  if (hasIdentityCollapse) return "stabilize";
  if (groundingNeeded) return "ground";
  if (hasWorsening) return "ground";
  if (hasLooping) return "interrupt_loop";
  if (hasShutdown || trajectory?.mode === "shutdown") return "hold_space";
  if (hasDirectQuestion) return "narrow";
  if (conversationState?.emotionalTone === "distressed") return "reflect";

  return "reflect";
}

function analyzeConversation({ messages = [], latestUserMessage = "" }) {
  const languageMeta = detectLanguageMirror(latestUserMessage);
  const conversationState = detectConversationState(messages);
  const groundingNeeded = detectGroundingNeed(messages);
  const trajectory = detectTrajectory(messages);
  const toneInertia = detectToneInertia(conversationState, latestUserMessage);
  const responseMode = detectResponseMode({
    latestUserMessage,
    conversationState,
    trajectory,
    groundingNeeded,
  });

  const isSeriousContext =
    conversationState?.emotionalTone === "distressed" ||
    conversationState?.emotionalTone === "numb" ||
    conversationState?.stability === "unstable" ||
    conversationState?.stability === "fragile" ||
    groundingNeeded ||
    conversationState?.risk === "high";

  return {
    languageMeta,
    conversationState,
    groundingNeeded,
    trajectory,
    toneInertia,
    responseMode,
    isSeriousContext,
  };
}

module.exports = {
  analyzeConversation,
};