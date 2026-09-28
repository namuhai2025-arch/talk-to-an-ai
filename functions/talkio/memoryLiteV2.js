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

  // Decay expressions
  for (const item of map.values()) {
    const ageDays = Math.floor((now - (item.lastSeenAt || now)) / 86400000);
    if (ageDays > 14) item.score -= 1;
    if (item.score <= 0) map.delete(item.value);
  }

  // Limit to top 8 to save LLM tokens (down from 12)
  const expressions = Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return {
    expressions,
    languageMix: patch.languageMix || existing.languageMix || null,
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

// COST SAVING: Added existingData parameter to prevent redundant Firestore read
async function saveContinuityMemory(uid, patch = {}, existingData = null) {
  if (!uid || uid === "anonymous") return;

  try {
    const ref = getMemoryRef(uid);
    let existing = existingData;
    
    if (!existing) {
      const snap = await ref.get();
      existing = snap.exists ? snap.data() || {} : {};
    }
    
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

  if (activeTheme) lines.push(`Theme: ${activeTheme}`);
  if (activeSituation) lines.push(`Situation: ${activeSituation}`);
  if (userPattern) lines.push(`Pattern: ${userPattern}`);
  if (responsePreference) lines.push(`Prefers: ${responsePreference}`);

  if (!lines.length) return "";

  return `[MEMORY]\n${lines.join(" | ")}`;
}

// BUG FIX: Merged both extractContinuityPatch functions into one!
function extractContinuityPatch({ latestUserMessage = "", responseMode = "reflect", emotionResult = {}, dynamicMode }) {
  const text = String(latestUserMessage || "").toLowerCase();
  const patch = {};

  // -- Theme & Situation Logic --
  if (/\bwork|job|boss|office|coworker|career\b/.test(text)) patch.activeTheme = "work_stress_or_career";
  if (/\bfamily|mom|mother|dad|father|sibling|parents\b/.test(text)) patch.activeTheme = "family_relationships";
  if (/\brelationship|partner|boyfriend|girlfriend|husband|wife|breakup\b/.test(text)) patch.activeTheme = "romantic_relationships";
  if (/\bcheat|cheating|betray|betrayal|trust\b/.test(text)) {
    patch.activeTheme = "relationship_betrayal";
    patch.activeSituation = "Dealing with broken trust.";
  }

  if (/\boverwhelmed|too much|stressed|pressure|burned out|exhausted|i can't think\b/.test(text)) {
    patch.activeSituation = "Dealing with overwhelm/pressure.";
    patch.userPattern = "needs_narrowing_when_overwhelmed";
  }

  // -- Pattern Logic --
  if (/\bconfused|lost|i don't know|not sure\b/.test(text)) patch.userPattern = "needs_clarity_when_confused";
  if (/\bwhat should i do|first step|next step|help me decide\b/.test(text)) patch.responsePreference = "clear_next_step";
  if (/\bjust tell me|be direct|quick answer|tell me what to do\b/.test(text)) patch.responsePreference = "direct_action";
  if (/\bexplain|why|help me understand\b/.test(text)) patch.responsePreference = "reflective_explanation";
  if (/\bhahaha|haha|jk|i'm fine|okay lang\b/.test(text)) patch.userPattern = "uses_humor_to_mask_distress";

  // -- High Risk Logic --
  if (/\bi am nothing|worthless|nobody cares|nothing matters anymore\b/.test(text)) {
    patch.activeSituation = "Identity or existential collapse.";
    patch.userPattern = "needs_steadying_and_grounding";
  }

  if (emotionResult?.toneFamily) patch.lastToneFamily = emotionResult.toneFamily;
  if (emotionResult?.primaryEmotion) patch.lastPrimaryEmotion = emotionResult.primaryEmotion;
  if (responseMode) patch.lastResponseMode = responseMode;

  if (dynamicMode === "act" || dynamicMode === "stabilize_then_act" || dynamicMode === "empower") {
    patch.responsePreference = "direct_action";
  } else if (["ground", "stabilize", "hold_space", "interrupt_loop", "validate"].includes(dynamicMode)) {
    patch.responsePreference = "grounded_short";
  }

  return patch;
}

function extractNativeExpressions(text = "") {
  const t = String(text || "").toLowerCase();
  const expressionMap = [
    { value: "sana all", language: "filipino" }, { value: "ayiee", language: "filipino" }, { value: "kilig", language: "filipino" }, { value: "charot", language: "filipino" },
    { value: "vale", language: "spanish" }, { value: "tío", language: "spanish" }, { value: "qué fuerte", language: "spanish" },
    { value: "güey", language: "mexican_spanish" }, { value: "ahorita", language: "mexican_spanish" },
    { value: "daebak", language: "korean" }, { value: "hwaiting", language: "korean" },
    { value: "yabai", language: "japanese" }, { value: "otsukare", language: "japanese" },
    { value: "digga", language: "german" }, { value: "geil", language: "german" },
    { value: "beleza", language: "portuguese" }, { value: "top", language: "portuguese" },
    { value: "boh", language: "italian" }, { value: "scialla", language: "italian" },
    { value: "no worries", language: "australian_english" }, { value: "maccas", language: "australian_english" },
    { value: "safe", language: "uk_english" }, { value: "bruv", language: "uk_english" },
    { value: "wahala", language: "pidgin" }
  ];

  const found = [];
  for (const item of expressionMap) {
    if (new RegExp(`\\b${item.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t)) {
      found.push(item);
    }
  }
  return found;
}

function detectLanguageMix(text = "") {
  const t = String(text || "").toLowerCase();
  const hasEnglish = /[a-z]/i.test(t);
  const hasFilipino = /\b(sana all|ayiee|kilig|charot)\b/i.test(t);
  const hasSpanish = /\b(vale|tío|qué fuerte|güey|ahorita)\b/i.test(t);

  if (hasEnglish && hasFilipino) return "en-filipino";
  if (hasEnglish && hasSpanish) return "en-spanish";
  
  if (hasFilipino) return "filipino";
  if (hasSpanish) return "spanish";

  return hasEnglish ? "english" : null;
}

function extractNativeExpressionPatch(latestUserMessage = "") {
  const known = extractNativeExpressions(latestUserMessage);
  const languageMix = detectLanguageMix(latestUserMessage);
  // COST SAVING: Removed the expensive and error-prone "unknown expressions" logic.

  return {
    expressions: known,
    languageMix,
  };
}

function buildNativeExpressionBlock(memory) {
  const nativeMemory = memory?.nativeExpressionMemory;
  if (!nativeMemory) return "";

  const expressions = Array.isArray(nativeMemory.expressions)
    ? nativeMemory.expressions.filter((x) => Number(x.score || 0) >= 2).slice(0, 3)
    : [];

  const lines = [];
  if (expressions.length) {
    lines.push(`User expressions: ${expressions.map((x) => x.value).join(", ")}`);
  }
  if (nativeMemory.languageMix) {
    lines.push(`Language mix: ${nativeMemory.languageMix}`);
  }

  if (!lines.length) return "";
  return `[EXPRESSIONS]\n${lines.join(" | ")}`;
}

function decideExpressionLevel({ dynamicMode = "reflect", responseMode = "reflect", groundingNeeded = false, conversationState = {}, trajectory = {} }) {
  const emotionalTone = conversationState?.emotionalTone || "neutral";
  const risk = conversationState?.risk || "normal";
  const trajectoryMode = trajectory?.mode || "stable";

  if (groundingNeeded || dynamicMode === "stabilize" || (emotionalTone === "distressed" && risk !== "normal") || risk === "high") return "none";
  if (dynamicMode === "act" || trajectoryMode === "worsening" || emotionalTone === "distressed") return "minimal";
  if (emotionalTone === "neutral" && trajectoryMode === "stable" && risk === "normal") return "natural";
  
  return "light";
}

function buildExpressionControlBlock({ dynamicMode = "reflect", responseMode = "reflect", groundingNeeded = false, conversationState = {}, trajectory = {} }) {
  const level = decideExpressionLevel({ dynamicMode, responseMode, groundingNeeded, conversationState, trajectory });

  const instructions = {
    none: "Keep language clean, grounded, and serious. No slang or local expressions.",
    minimal: "Use at most one light local expression. Prioritize clarity.",
    light: "Lightly mirror one local expression if natural. Keep it subtle.",
    natural: "Naturally mirror the user's local style in a restrained way.",
  };

  return {
    expressionLevel: level,
    expressionControlBlock: `EXPRESSION CONTROL: ${instructions[level] || instructions.minimal}`,
  };
}

function extractPersonalityPatch(latestUserMessage = "") {
  const text = String(latestUserMessage || "").toLowerCase();
  const patch = {};

  if (/\bwhat should i do|just tell me|solution\b/.test(text)) patch.responseStyle = "direct";
  if (/\bwhy do i feel|what does it mean\b/.test(text)) patch.responseStyle = "reflective";
  if (/\bfirst step|fix this\b/.test(text)) patch.guidancePreference = "action";
  if (/\bconfused|i don't understand\b/.test(text)) patch.guidancePreference = "exploratory";
  if (/\bdevastated|broken\b/.test(text)) patch.emotionalPreference = "high";
  if (/\bjust annoyed|meh\b/.test(text)) patch.emotionalPreference = "low";
  if (/\bquick answer\b/.test(text)) patch.pacePreference = "fast";
  if (/\blet me think|slow down\b/.test(text)) patch.pacePreference = "slow";

  return patch;
}

function buildPersonalityBlock(memory) {
  const profile = memory?.personalityProfile;
  if (!profile) return "";

  const lines = [];
  if (profile.responseStyle) lines.push(`Style: ${profile.responseStyle}`);
  if (profile.guidancePreference) lines.push(`Guidance: ${profile.guidancePreference}`);
  if (profile.pacePreference) lines.push(`Pace: ${profile.pacePreference}`);

  if (!lines.length) return "";
  return `[PERSONALITY]\n${lines.join(" | ")}`;
}

module.exports = {
  loadContinuityMemory,
  saveContinuityMemory,
  buildContinuityBlock,
  buildNativeExpressionBlock,
  buildPersonalityBlock,
  extractContinuityPatch,
  extractNativeExpressionPatch,
  extractPersonalityPatch,
  buildExpressionControlBlock
};