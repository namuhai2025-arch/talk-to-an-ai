"use strict";

const admin = require("firebase-admin");

function getMemoryRef(uid) {
  return admin
    .firestore()
    .collection("users")
    .doc(uid)
    .collection("memory")
    .doc("continuity");
}

async function loadContinuityMemory(uid) {
  if (!uid || uid === "anonymous") return null;

  try {
    const snap = await getMemoryRef(uid).get();
    return snap.exists ? snap.data() : null;
  } catch (err) {
    console.error("loadContinuityMemory failed:", err);
    return null;
  }
}

function daysBetween(dateA, dateB) {
  const ms = Math.abs(dateA.getTime() - dateB.getTime());
  return Math.floor(ms / 86400000);
}

function toDateSafe(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function decayEntry(entry, now = new Date()) {
  if (!entry || typeof entry !== "object" || !entry.value) return null;

  const lastSeen = toDateSafe(entry.lastSeenAt) || now;
  const ageDays = daysBetween(now, lastSeen);

  let score = Number(entry.score || 1);

  if (ageDays >= 21) score -= 2;
  else if (ageDays >= 7) score -= 1;

  score = Math.max(0, score);

  if (score === 0) return null;

  return {
    value: entry.value,
    score,
    lastSeenAt: entry.lastSeenAt || now,
  };
}

function strengthenEntry(existing, nextValue, bump = 1, now = new Date()) {
  if (!nextValue) return decayEntry(existing, now);

  const decayed = decayEntry(existing, now);

  if (!decayed || decayed.value !== nextValue) {
    return {
      value: nextValue,
      score: Math.min(3, bump),
      lastSeenAt: now,
    };
  }

  return {
    value: nextValue,
    score: Math.min(10, Number(decayed.score || 1) + bump),
    lastSeenAt: now,
  };
}

function mergePersonalityMemory(existing = {}, patch = {}) {
  const result = { ...existing };

  for (const key of Object.keys(patch)) {
    result[key] = patch[key];
  }

  return result;
}

function mergeNativeExpressionMemory(existing = {}, patch = {}) {
  const current = Array.isArray(existing.expressions) ? existing.expressions : [];
  const incoming = Array.isArray(patch.expressions) ? patch.expressions : [];

  const now = Date.now();
  const map = new Map();

  for (const item of current) {
    if (!item?.value) continue;
    map.set(item.value, {
      value: item.value,
      language: item.language || null,
      score: Number(item.score || 1),
      lastSeenAt: item.lastSeenAt || now,
    });
  }

  for (const item of incoming) {
    if (!item?.value) continue;

    const prev = map.get(item.value);

    if (!prev) {
      map.set(item.value, {
        value: item.value,
        language: item.language || null,
        score: 1,
        lastSeenAt: now,
      });
    } else {
      map.set(item.value, {
        value: prev.value,
        language: prev.language || item.language || null,
        score: Math.min(10, Number(prev.score || 1) + 1),
        lastSeenAt: now,
      });
    }
  }

  for (const item of map.values()) {
    const ageDays = Math.floor((now - (item.lastSeenAt || now)) / 86400000);
    if (ageDays > 14) item.score -= 1;
    if (item.score <= 0) map.delete(item.value);
  }

  const expressions = Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return {
    expressions,
    languageMix: patch.languageMix || existing.languageMix || null,
    regionalStyle: patch.regionalStyle || existing.regionalStyle || null,
  };
}

function mergeContinuityMemory(existing = {}, patch = {}) {
  const now = new Date();

  return {
    activeTheme: strengthenEntry(existing.activeTheme, patch.activeTheme, 2, now),
    activeSituation: strengthenEntry(existing.activeSituation, patch.activeSituation, 1, now),
    userPattern: strengthenEntry(existing.userPattern, patch.userPattern, 2, now),
    personalityProfile: mergePersonalityMemory(
      existing.personalityProfile || {},
      patch.personalityProfile || {}
    ),
    responsePreference: strengthenEntry(
      existing.responsePreference,
      patch.responsePreference,
      2,
      now
    ),
    nativeExpressionMemory: mergeNativeExpressionMemory(
      existing.nativeExpressionMemory || {},
      patch.nativeExpressionMemory || {}
    ),
    lastPath: patch.lastPath || existing.lastPath || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function saveContinuityMemory(uid, patch = {}) {
  if (!uid || uid === "anonymous") return;

  try {
    const ref = getMemoryRef(uid);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() || {} : {};
    const merged = mergeContinuityMemory(existing, patch);
    await ref.set(merged, { merge: true });
  } catch (err) {
    console.error("saveContinuityMemory failed:", err);
  }
}

function memoryValue(entry) {
  if (!entry || typeof entry !== "object") return "";
  if (Number(entry.score || 0) <= 0) return "";
  return entry.value || "";
}

function buildContinuityBlock(memory) {
  if (!memory) return "";

  const lines = [];

  const activeTheme = memoryValue(memory.activeTheme);
  const activeSituation = memoryValue(memory.activeSituation);
  const userPattern = memoryValue(memory.userPattern);
  const responsePreference = memoryValue(memory.responsePreference);

  if (activeTheme) lines.push(`Ongoing theme: ${activeTheme}`);
  if (activeSituation) lines.push(`Ongoing situation: ${activeSituation}`);
  if (userPattern) lines.push(`User pattern: ${userPattern}`);
  if (responsePreference) lines.push(`Response preference: ${responsePreference}`);

  if (!lines.length) return "";

  return `CONTINUITY MEMORY
${lines.join("\n")}`;
}

function extractNativeExpressions(text = "") {
  const t = String(text || "").toLowerCase();

  const expressionMap = [
    { value: "sana all", language: "filipino" },
    { value: "ayiee", language: "filipino" },
    { value: "ayiieeh", language: "filipino" },
    { value: "kilig", language: "filipino" },
    { value: "charot", language: "filipino" },
    { value: "char", language: "filipino" },
    { value: "lodi", language: "filipino" },
    { value: "gigil", language: "filipino" },

    { value: "vale", language: "spanish" },
    { value: "tío", language: "spanish" },
    { value: "tia", language: "spanish" },
    { value: "tía", language: "spanish" },
    { value: "es la leche", language: "spanish" },
    { value: "qué fuerte", language: "spanish" },
    { value: "que fuerte", language: "spanish" },

    { value: "güey", language: "mexican_spanish" },
    { value: "wey", language: "mexican_spanish" },
    { value: "ahorita", language: "mexican_spanish" },
    { value: "órale", language: "mexican_spanish" },
    { value: "orale", language: "mexican_spanish" },

    { value: "dae-bak", language: "korean" },
    { value: "daebak", language: "korean" },
    { value: "heol", language: "korean" },
    { value: "gap-bun-ssa", language: "korean" },
    { value: "hwaiting", language: "korean" },

    { value: "yabai", language: "japanese" },
    { value: "kusa", language: "japanese" },
    { value: "otsukare", language: "japanese" },

    { value: "digga", language: "german" },
    { value: "digger", language: "german" },
    { value: "geil", language: "german" },
    { value: "läuft bei dir", language: "german" },
    { value: "lauft bei dir", language: "german" },

    { value: "beleza", language: "portuguese" },
    { value: "ficar de boa", language: "portuguese" },
    { value: "top", language: "portuguese" },

    { value: "boh", language: "italian" },
    { value: "daje", language: "italian" },
    { value: "scialla", language: "italian" },

    { value: "no worries", language: "australian_english" },
    { value: "arvo", language: "australian_english" },
    { value: "macca's", language: "australian_english" },
    { value: "maccas", language: "australian_english" },

    { value: "safe", language: "uk_english" },
    { value: "peng", language: "uk_english" },
    { value: "bruv", language: "uk_english" },

    { value: "wahala", language: "pidgin" },
    { value: "small small", language: "pidgin" },
  ];

  const found = [];

  for (const item of expressionMap) {
    const escaped = item.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");

    if (regex.test(t)) {
      found.push(item);
    }
  }

  return found;
}

function detectLanguageMix(text = "") {
  const t = String(text || "").toLowerCase();

  const hasEnglish = /[a-z]/i.test(t);
  const hasFilipino = /\b(sana all|ayiee|ayiieeh|kilig|charot|char|lodi|gigil)\b/i.test(t);
  const hasSpanish = /\b(vale|tío|tia|tía|es la leche|qué fuerte|que fuerte|güey|wey|ahorita|órale|orale)\b/i.test(t);
  const hasKorean = /\b(daebak|dae-bak|heol|gap-bun-ssa|hwaiting)\b/i.test(t);
  const hasJapanese = /\b(yabai|kusa|otsukare)\b/i.test(t);
  const hasGerman = /\b(digga|digger|geil|läuft bei dir|lauft bei dir)\b/i.test(t);
  const hasPortuguese = /\b(beleza|ficar de boa|top)\b/i.test(t);
  const hasItalian = /\b(boh|daje|scialla)\b/i.test(t);
  const hasUK = /\b(safe|peng|bruv)\b/i.test(t);
  const hasPidgin = /\b(wahala|small small)\b/i.test(t);

  if (hasEnglish && hasFilipino) return "en-filipino";
  if (hasEnglish && hasSpanish) return "en-spanish";
  if (hasEnglish && hasKorean) return "en-korean";
  if (hasEnglish && hasJapanese) return "en-japanese";
  if (hasEnglish && hasGerman) return "en-german";
  if (hasEnglish && hasPortuguese) return "en-portuguese";
  if (hasEnglish && hasItalian) return "en-italian";
  if (hasEnglish && hasUK) return "en-uk-slang";
  if (hasEnglish && hasPidgin) return "en-pidgin";

  if (hasFilipino) return "filipino";
  if (hasSpanish) return "spanish";
  if (hasKorean) return "korean";
  if (hasJapanese) return "japanese";
  if (hasGerman) return "german";
  if (hasPortuguese) return "portuguese";
  if (hasItalian) return "italian";
  if (hasUK) return "uk-english";
  if (hasPidgin) return "pidgin";

  return hasEnglish ? "english" : null;
}

function detectRegionalStyle(text = "") {
  const t = String(text || "").trim();

  if (!t) return null;
  if (t.length < 50) return "short_casual";
  if (t.length < 140) return "casual_mixed";
  return "expressive_mixed";
}

function extractNativeExpressionPatch(latestUserMessage = "") {
  const known = extractNativeExpressions(latestUserMessage);

  const combined = [
    ...known,    
  ];

  const languageMix = detectLanguageMix(latestUserMessage);
  const regionalStyle = detectRegionalStyle(latestUserMessage);

  return {
    expressions: combined,
    languageMix,
    regionalStyle,
  };
}

function buildNativeExpressionBlock(memory) {
  const nativeMemory = memory?.nativeExpressionMemory;
  if (!nativeMemory) return "";

  const expressions = Array.isArray(nativeMemory.expressions)
    ? nativeMemory.expressions.filter((x) => Number(x.score || 0) >= 2).slice(0, 5)
    : [];

  const lines = [];

  if (expressions.length) {
    lines.push(
      `User often uses these local/native expressions: ${expressions
        .map((x) => x.value)
        .join(", ")}`
    );
  }

  if (nativeMemory.languageMix) {
    lines.push(`User language mix: ${nativeMemory.languageMix}`);
  }

  if (nativeMemory.regionalStyle) {
    lines.push(`User local style: ${nativeMemory.regionalStyle}`);
  }

  if (!lines.length) return "";

  return `NATIVE EXPRESSION MEMORY
${lines.join("\n")}

Use local/native expressions lightly and naturally when appropriate.
Do not overuse them.
Do not parody the user.
Do not force playful slang in serious or crisis moments.
Use at most one localized expression in most replies unless the user strongly sustains that style.`;
}

function extractContinuityPatch({ latestUserMessage = "", dynamicMode }) {
  const text = String(latestUserMessage || "").toLowerCase();
  const patch = {};

  if (/\bcheat|cheating|betray|betrayal|trust\b/.test(text)) {
    patch.activeTheme = "relationship_betrayal";
    patch.activeSituation = "User is dealing with broken trust in a relationship.";
  }

  if (/\bshould i|what should i do|first step|what now|move on|confront\b/.test(text)) {
    patch.userPattern = "needs_clear_action_steps";
  }

  if (/\boverwhelmed|i can't think|i cant think|lost|confused\b/.test(text)) {
    patch.userPattern = "gets_overloaded_needs_narrowing";
  }

  if (/\bjust tell me|tell me what to do|no explanation|be direct\b/.test(text)) {
    patch.userPattern = "direct_command_under_stress";
    patch.responsePreference = "direct_action";
  }

  if (/\bexpose her|expose him|ruin her|ruin him|destroy her|destroy him|make her pay|make him pay|post it|blast her|blast him\b/.test(text)) {
    patch.activeSituation = "User has a revenge impulse and may act publicly while distressed.";
    patch.userPattern = "revenge_impulse_needs_deescalation";
  }

  if (/\btwist things|make me look bad|make me look crazy|turn people against me|ruin my name|ruin my reputation\b/.test(text)) {
    patch.activeSituation = "User fears social or reputation damage from another person's narrative.";
    patch.userPattern = "reputation_threat_needs_urgency_reduction";
  }

  if (/\bhahaha|haha|jk|i'm fine|im fine|okay lang\b/.test(text)) {
    patch.userPattern = "uses_humor_or_lightness_to_mask_distress";
  }

  if (/\bi am nothing|i'm nothing|worthless|nobody cares|no one cares\b/.test(text)) {
    patch.activeSituation = "User is in an identity-collapse moment and needs stabilization.";
    patch.userPattern = "identity_collapse_needs_steadying";
  }

  if (/\bwhat's the point|whats the point|nothing matters anymore\b/.test(text)) {
    patch.activeSituation = "User is in an existential drop and needs narrowing and stabilization.";
    patch.userPattern = "existential_drop_needs_hour_by_hour_grounding";
  }

  if (
  dynamicMode === "act" ||
  dynamicMode === "stabilize_then_act" ||
  dynamicMode === "empower"
) {
  patch.responsePreference = "direct_action";
} else if (
  dynamicMode === "ground" ||
  dynamicMode === "stabilize" ||
  dynamicMode === "hold_space" ||
  dynamicMode === "interrupt_loop" ||
  dynamicMode === "validate"
) {
  patch.responsePreference = "grounded_short";
}

  return patch;
}

function decideExpressionLevel({
  dynamicMode = "reflect",
  responseMode = "reflect",
  groundingNeeded = false,
  conversationState = {},
  trajectory = {},
}) {
  const emotionalTone = conversationState?.emotionalTone || "neutral";
  const risk = conversationState?.risk || "normal";
  const trajectoryMode = trajectory?.mode || "stable";

  if (
    groundingNeeded ||
    dynamicMode === "stabilize" ||
    dynamicMode === "stabilize_then_act" ||
    responseMode === "stabilize" ||
    (emotionalTone === "distressed" && risk !== "normal") ||
    risk === "high"
  ) {
    return "none";
  }

  if (
    dynamicMode === "act" ||
    dynamicMode === "ground" ||
    responseMode === "ground" ||
    trajectoryMode === "worsening" ||
    trajectoryMode === "sudden_drop" ||
    trajectoryMode === "shutdown"
  ) {
    return "minimal";
  }

  if (
    trajectoryMode === "looping" ||
    emotionalTone === "distressed" ||
    emotionalTone === "numb" ||
    emotionalTone === "suppressed"
  ) {
    return "minimal";
  }

  if (
    emotionalTone === "neutral" &&
    trajectoryMode === "stable" &&
    risk === "normal"
  ) {
    return "natural";
  }

  if (emotionalTone === "agitated") {
    return "minimal";
  }

  return "light";
}

function buildExpressionControlBlock({
  dynamicMode = "reflect",
  responseMode = "reflect",
  groundingNeeded = false,
  conversationState = {},
  trajectory = {},
}) {
  const level = decideExpressionLevel({
    dynamicMode,
    responseMode,
    groundingNeeded,
    conversationState,
    trajectory,
  });

  const instructions = {
    none: `
EXPRESSION CONTROL
Do not mirror slang or local expressions in this reply.
Keep the language clean, grounded, calm, and serious.
Do not add playful or culturally flavored phrasing.
`.trim(),

    minimal: `
EXPRESSION CONTROL
Use at most one very light local/native expression only if it fits naturally.
Do not use playful teasing language.
Do not make the reply sound casual if the situation is serious.
Prioritize clarity over flavor.
`.trim(),

    light: `
EXPRESSION CONTROL
You may lightly mirror one local/native expression if it fits naturally.
Keep it subtle.
Do not overuse slang.
Do not let expression mirroring overpower the meaning of the reply.
`.trim(),

    natural: `
EXPRESSION CONTROL
You may naturally mirror the user's local/native style in a restrained way.
Still avoid overuse, parody, or caricature.
Keep the reply human and balanced.
`.trim(),
  };

  return {
    expressionLevel: level,
    expressionControlBlock: instructions[level] || instructions.minimal,
  };
}

function extractPersonalityPatch(latestUserMessage = "") {
  const text = String(latestUserMessage || "").toLowerCase();
  const patch = {};

  if (/\bwhat should i do|tell me what to do|just tell me|solution\b/.test(text)) {
    patch.responseStyle = "direct";
  }

  if (/\bwhy do i feel|i feel like|i think i am|what does it mean\b/.test(text)) {
    patch.responseStyle = "reflective";
  }

  if (/\bfirst step|next step|how do i|fix this|move on\b/.test(text)) {
    patch.guidancePreference = "action";
  }

  if (/\bconfused|i don't understand|what's happening\b/.test(text)) {
    patch.guidancePreference = "exploratory";
  }

  if (/\bdevastated|broken|hurt|pain|i can't handle\b/.test(text)) {
    patch.emotionalPreference = "high";
  }

  if (/\bjust annoyed|meh|whatever\b/.test(text)) {
    patch.emotionalPreference = "low";
  }

  if (/\bquick answer|just tell me\b/.test(text)) {
    patch.pacePreference = "fast";
  }

  if (/\blet me think|not sure yet|slow down\b/.test(text)) {
    patch.pacePreference = "slow";
  }

  return patch;
}

function buildPersonalityBlock(memory) {
  const profile = memory?.personalityProfile;
  if (!profile) return "";

  const lines = [];

  if (profile.responseStyle === "direct") {
    lines.push("User prefers clear and direct responses.");
  }

  if (profile.responseStyle === "reflective") {
    lines.push("User prefers reflective and thoughtful responses.");
  }

  if (profile.guidancePreference === "action") {
    lines.push("User prefers actionable steps over discussion.");
  }

  if (profile.guidancePreference === "exploratory") {
    lines.push("User prefers understanding before action.");
  }

  if (profile.emotionalPreference === "high") {
    lines.push("User is comfortable with emotional depth.");
  }

  if (profile.emotionalPreference === "low") {
    lines.push("User prefers minimal emotional language.");
  }

  if (profile.pacePreference === "fast") {
    lines.push("User prefers quick and concise replies.");
  }

  if (profile.pacePreference === "slow") {
    lines.push("User prefers slower, more thoughtful pacing.");
  }

  if (!lines.length) return "";

  return `PERSONALITY PROFILE
${lines.join("\n")}`;
}

module.exports = {
  loadContinuityMemory,
  saveContinuityMemory,
  buildContinuityBlock,
  buildNativeExpressionBlock,
  buildPersonalityBlock,
  extractContinuityPatch,
  extractNativeExpressionPatch,
};