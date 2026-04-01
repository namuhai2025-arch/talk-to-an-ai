// version: v3.1 stoic drift detection added
// version: v3.2 tone tuning

const admin = require("firebase-admin");
const { upsertMemoryWithReplacement } = require("./memory_lite/update");
const {
  detectMemoryCommand,
  getUserMemorySummary,
  forgetMatchingMemory,
  clearAllMemory,
} = require("./memory_lite/commands");

if (!admin.apps.length) {
  admin.initializeApp();
}

const { createReminder } = require("./reminders/helpers");
const { detectReminderCommand } = require("./reminders/extractors");
const { processDueReminders } = require("./reminders/scheduler");

const { onSchedule } = require("firebase-functions/v2/scheduler");

const { ensureUserBase, markMemoryUsed, archiveMemory } = require("./memory_lite/helpers");
const { extractMemoryCandidates } = require("./memory_lite/extractors");
const { getRelevantMemory, formatMemoryForPrompt } = require("./memory_lite/retrieval");
const {
  getConversationSummary,
  setConversationSummary,
  buildSimpleRollingSummary,
} = require("./memory_lite/summary");
const { decayMemoryScores, pruneMemory } = require("./memory_lite/maintenance");

const { db } = require("./lib/firebase");
const { markUserMessage, markTalkioReply } = require("./presence");

const {
  getTodayDateString,
  getTalkioMemoryBundle,
  buildTalkioMemorySummary,
  updateTalkioUserProfile,
  updateEmotionDay,
  defaultTalkioProfile,
  updateStyleSignals,
  deriveStyleProfileFromSignals,
  buildStyleProfileBlock,
} = require("./lib/talkioMemory");

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { GoogleGenAI } = require("@google/genai");
const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const FREE_DAILY_LIMIT = 18;
const FREE_PER_MINUTE_LIMIT = 10;

const PREMIUM_DAILY_LIMIT = 300;
const PREMIUM_PER_MINUTE_LIMIT = 30;

const ULTRA_DAILY_LIMIT = 1000;
const ULTRA_PER_MINUTE_LIMIT = 60;

const IP_DAILY_CAP = 120;
const IP_MINUTE_CAP = 30;

const FREE_MODEL = "gemini-2.5-flash-lite";
const PREMIUM_MODEL = "gemini-2.5-flash";
const ULTRA_MODEL = "gemini-2.5-pro";

function pickModel(body) {
  const tier = getUserTier(body);

  if (tier === "ultra") return ULTRA_MODEL;
  if (tier === "premium") return PREMIUM_MODEL;
  return FREE_MODEL;
}

function getUserTier(body) {
  return body?.userTier === "ultra"
    ? "ultra"
    : body?.userTier === "premium"
      ? "premium"
      : "free";
}

const MAX_CONTEXT_MESSAGES = 6;
const MAX_SUMMARY_LENGTH = 800;
const SUMMARY_UPDATE_EVERY_MESSAGES = 6;
const SUMMARY_MODEL = FREE_MODEL;

const INTERNAL_APP_KEY = process.env.INTERNAL_APP_KEY;

function logInfo(event, data = {}) {
  logger.info(event, {
    timestamp: new Date().toISOString(),
    data,
  });
}

function logWarn(event, data = {}) {
  logger.warn(event, {
    timestamp: new Date().toISOString(),
    data,
  });
}

function logError(event, error, data = {}) {
  logger.error(event, {
    timestamp: new Date().toISOString(),
    message: error?.message || String(error),
    stack: error?.stack || null,
    data,
  });
}

function secondsUntilUtcMidnight() {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0
    )
  );
  return Math.max(1, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

function sha1(s) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"] || "";
  const first = String(xf).split(",")[0]?.trim();
  return first || "0.0.0.0";
}

function getUa(req) {
  return req.headers["user-agent"] || "";
}

function looksLikeCrisis(text) {
  const t = (text || "").toLowerCase();
  const patterns = [
    /\bkill myself\b/i,
    /\bkilling myself\b/i,
    /\bend my life\b/i,
    /\btake my life\b/i,
    /\bi want to die\b/i,
    /\bi wanna die\b/i,
    /\bi don't want to live\b/i,
    /\bi dont want to live\b/i,
    /\bi will (?:kill|hurt|harm) myself\b/i,
    /\bself[-\s]?harm\b/i,
    /\bsuicid(?:e|al)\b/i,
    /\boverdose\b/i,
  ];
  return patterns.some((re) => re.test(t));
}

function crisisReplyPH() {
  return [
    "I’m really sorry you’re feeling this way. I can’t help with self-harm, but you don’t have to go through this alone.",
    "",
    "If you might be in immediate danger, please call 911 right now (Philippines) or go to the nearest ER.",
    "You can also contact the National Center for Mental Health (NCMH) Crisis Hotline (24/7): 1553 (landline) or 0917-899-8727 / 0966-351-4518 / 0919-057-1553.",
    "",
    "If there’s someone you trust nearby, please reach out to them now and tell them you need support.",
  ].join("\n");
}


function getLimitsForTier(userTier) {
  if (userTier === "ultra") {
    return {
      dailyLimit: ULTRA_DAILY_LIMIT,
      perMinuteLimit: ULTRA_PER_MINUTE_LIMIT,
    };
  }

  if (userTier === "premium") {
    return {
      dailyLimit: PREMIUM_DAILY_LIMIT,
      perMinuteLimit: PREMIUM_PER_MINUTE_LIMIT,
    };
  }

  return {
    dailyLimit: FREE_DAILY_LIMIT,
    perMinuteLimit: FREE_PER_MINUTE_LIMIT,
  };
}
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

function detectLanguageMixLevel(text = "") {
  const raw = String(text || "");
  const lower = raw.toLowerCase();

  const filipinoMarkers = [
    "naman", "kasi", "pero", "lang", "sige", "gusto", "wala", "meron", "pwede",
  ];

  const englishWords = (lower.match(/\b[a-z]{2,}\b/g) || []).length;
  const filipinoHits = filipinoMarkers.filter((w) => lower.includes(w)).length;

  if (englishWords >= 4 && filipinoHits >= 2) return "mixed";
  return "single";
}

function detectToneSignal(text = "") {
  const t = String(text).toLowerCase();

  const playfulMarkers = [
    "haha",
    "hahaha",
    "lol",
    "lmao",
    "ayiee",
    "char",
    "joke",
    "eme",
    "hehe",
  ];

  const seriousMarkers = [
    "seriously",
    "to be honest",
    "honestly",
    "i need help",
    "i'm struggling",
    "im struggling",
    "this is hard",
    "i feel stuck",
  ];

  if (playfulMarkers.some((w) => t.includes(w))) return "playful";
  if (seriousMarkers.some((w) => t.includes(w))) return "serious";
  return "neutral";
}

function detectReplyStyleSignal(text = "") {
  const trimmed = String(text).trim();
  const length = trimmed.length;
  const lower = trimmed.toLowerCase();

  const directMarkers = [
    "just tell me",
    "be straight",
    "be honest",
    "direct",
    "what should i do",
    "give me the answer",
  ];

  const gentleMarkers = [
    "i'm overwhelmed",
    "please be gentle",
    "softly",
    "i feel fragile",
    "can you stay with me",
    "don't be harsh",
  ];

  if (directMarkers.some((w) => lower.includes(w))) return "direct";
  if (gentleMarkers.some((w) => lower.includes(w))) return "gentle";
  if (length < 40) return "short";
  if (length > 220) return "long";
  return "balanced";
}

function detectEmotionalIntensity(text = "") {
  const t = String(text);

  const exclamations = (t.match(/!/g) || []).length;
  const capsWords = (t.match(/\b[A-Z]{3,}\b/g) || []).length;

  if (exclamations >= 2 || capsWords >= 2) return "high";

  const lower = t.toLowerCase();
  if (
    lower.includes("panic") ||
    lower.includes("overwhelmed") ||
    lower.includes("can't do this") ||
    lower.includes("cant do this")
  ) {
    return "high";
  }

  return "low";
}

function updateBehaviorSignals(message, currentSignals = {}) {
  const next = {
    shortMessageCount: currentSignals.shortMessageCount || 0,
    longMessageCount: currentSignals.longMessageCount || 0,
    playfulCount: currentSignals.playfulCount || 0,
    seriousCount: currentSignals.seriousCount || 0,
    taglishCount: currentSignals.taglishCount || 0,
    englishCount: currentSignals.englishCount || 0,
    spanishCount: currentSignals.spanishCount || 0,
    mixedLanguageCount: currentSignals.mixedLanguageCount || 0,
    emotionalIntensityHighCount: currentSignals.emotionalIntensityHighCount || 0,
    emotionalIntensityLowCount: currentSignals.emotionalIntensityLowCount || 0,
    directPreferenceCount: currentSignals.directPreferenceCount || 0,
    gentlePreferenceCount: currentSignals.gentlePreferenceCount || 0,
  };

  const trimmed = String(message || "").trim();
  const languageMeta = detectLanguageMirror(trimmed);
  const language = languageMeta.language;
  const mixLevel = detectLanguageMixLevel(trimmed);
  const tone = detectToneSignal(trimmed);
  const style = detectReplyStyleSignal(trimmed);
  const intensity = detectEmotionalIntensity(trimmed);

  if (trimmed.length < 40) next.shortMessageCount += 1;
  if (trimmed.length > 220) next.longMessageCount += 1;

  if (language === "taglish") next.taglishCount += 1;
  else if (language === "spanish") next.spanishCount += 1;
  else if (language === "english_or_unrecognized") next.englishCount += 1;
  // DO NOT force other languages into english bucket

  if (mixLevel === "mixed") next.mixedLanguageCount += 1;

  if (tone === "playful") next.playfulCount += 1;
  if (tone === "serious") next.seriousCount += 1;

  if (style === "direct") next.directPreferenceCount += 1;
  if (style === "gentle") next.gentlePreferenceCount += 1;

  if (intensity === "high") next.emotionalIntensityHighCount += 1;
  else next.emotionalIntensityLowCount += 1;

  return next;
}

function deriveBehaviorProfile(signals = {}) {
  const shortCount = signals.shortMessageCount || 0;
  const longCount = signals.longMessageCount || 0;
  const playfulCount = signals.playfulCount || 0;
  const seriousCount = signals.seriousCount || 0;
  const taglishCount = signals.taglishCount || 0;
  const englishCount = signals.englishCount || 0;
  const spanishCount = signals.spanishCount || 0;
  const mixedLanguageCount = signals.mixedLanguageCount || 0;
  const highIntensity = signals.emotionalIntensityHighCount || 0;
  const lowIntensity = signals.emotionalIntensityLowCount || 0;
  const directCount = signals.directPreferenceCount || 0;
  const gentleCount = signals.gentlePreferenceCount || 0;

  let replyStyle = "balanced";
  if (shortCount >= longCount + 3) replyStyle = "brief";
  else if (longCount >= shortCount + 3) replyStyle = "expanded";

  let tonePreference = "calm";
  if (playfulCount >= seriousCount + 3) tonePreference = "light_playful";
  else if (seriousCount >= playfulCount + 3) tonePreference = "serious_grounded";

  let languagePreference = "english";

  if (taglishCount >= englishCount + 3) languagePreference = "taglish";
  else if (spanishCount >= englishCount + 3) languagePreference = "spanish";
  else if (signals.mixedLanguageCount >= 3) languagePreference = "mixed";

  let languageMirroring = "single_language";
  if (mixedLanguageCount >= 3) languageMirroring = "mixed_ok";

  let humorPreference = "low";
  if (playfulCount >= 5) humorPreference = "medium";

  let structurePreference = "medium";
  if (directCount >= gentleCount + 3) structurePreference = "high";
  else if (gentleCount >= directCount + 3) structurePreference = "low";

  let emotionalPacing = "steady";
  if (highIntensity >= lowIntensity + 3) emotionalPacing = "soft_slow";

  return {
    replyStyle,
    tonePreference,
    languagePreference,
    languageMirroring,
    humorPreference,
    structurePreference,
    emotionalPacing,
  };
}

function buildBehaviorProfileBlock(profile = {}) {
  const behavior = profile?.behaviorProfile || {};

  const replyStyle = behavior.replyStyle || "balanced";
  const tonePreference = behavior.tonePreference || "calm";
  const languagePreference = behavior.languagePreference || "english";
  const languageMirroring = behavior.languageMirroring || "single_language";
  const humorPreference = behavior.humorPreference || "low";
  const structurePreference = behavior.structurePreference || "medium";
  const emotionalPacing = behavior.emotionalPacing || "steady";

  return `
BEHAVIORAL ADAPTATION:
Preferred reply length/style: ${replyStyle}
Preferred tone: ${tonePreference}
Stored language tendency: ${languagePreference}
Stored mirroring preference: ${languageMirroring}
Preferred humor level: ${humorPreference}
Preferred structure level: ${structurePreference}
Preferred emotional pacing: ${emotionalPacing}

Adapt gently to these preferences without sounding forced or exaggerated.
Do not mention this profile to the user.
`.trim();
}

function buildLanguageMirrorBlock(text = "", behaviorProfile = {}) {
  const detected = detectLanguageMirror(text);
  const profileLanguage = behaviorProfile?.languagePreference || "english";
  const mirrorMode = behaviorProfile?.languageMirroring || "single_language";

  return `
LANGUAGE MIRRORING:
Current detected user language/style: ${detected.language}
Stored language tendency: ${profileLanguage}
Stored mirroring preference: ${mirrorMode}

${detected.mirrorInstruction}

Always reply in the same language the user is currently using.
This rule overrides stored preferences.
Even if the language is not recognized, mirror it based on the user's message.
Do not default to English unless the user is clearly using English..
If the user mixes languages naturally, you may mirror that mix lightly.
Do not force slang. Keep the reply natural and easy to understand.
`.trim();
}

function getLegacyConversationSummary(memory) {
  const raw =
    typeof memory?.conversationSummary === "string"
      ? memory.conversationSummary
      : "";

  return raw.slice(0, MAX_SUMMARY_LENGTH).trim();
}

function getSummaryBaseCount(memory) {
  return typeof memory?.summaryBaseCount === "number"
    ? memory.summaryBaseCount
    : 0;
}

function shouldRefreshSummary(memory, completedMessageCount) {
  const baseCount = getSummaryBaseCount(memory);
  return completedMessageCount - baseCount >= SUMMARY_UPDATE_EVERY_MESSAGES;
}

function formatMessagesForPrompt(messages) {
  return messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .map((m) => `${m.role === "user" ? "User" : "Talkio"}: ${m.content}`)
    .join("\n");
}

function getLocalDateKey(date, timeZone) {
  const local = new Date(date.toLocaleString("en-US", { timeZone }));
  const yyyy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function getLocalNowParts(date, timeZone) {
  const local = new Date(date.toLocaleString("en-US", { timeZone }));
  return {
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
    hour: local.getHours(),
    minute: local.getMinutes(),
    totalMinutes: local.getHours() * 60 + local.getMinutes(),
  };
}

function isWithinCheckinWindow(nowParts, targetHour, targetMinute, windowMinutes = 2) {
  const targetTotal = targetHour * 60 + targetMinute;
  return nowParts.totalMinutes >= targetTotal &&
    nowParts.totalMinutes < targetTotal + windowMinutes;
}

function wasRecentlyActive(userDoc, minutes = 30) {
  const lastUserMessageAt = userDoc?.lastUserMessageAt?.toDate?.();
  if (!lastUserMessageAt) return false;

  const diffMs = Date.now() - lastUserMessageAt.getTime();
  return diffMs < minutes * 60 * 1000;
}

function pickCheckinMessage(checkin, userData = {}) {
  const customMessage =
    typeof checkin?.message === "string" && checkin.message.trim()
      ? checkin.message.trim()
      : null;

  if (customMessage) return customMessage;

  const options = [
    "Hey… just checking in. How are you feeling today?",
    "Hi — just wanted to check in a bit. How’s your day going?",
    "Hey, how have you been holding up today?",
    "Just checking in for a moment. How are you doing?",
  ];

  return options[Math.floor(Math.random() * options.length)];
}

function detectMoodSignal(text) {
  const t = (text || "").toLowerCase();

  if (
    t.includes("tired") ||
    t.includes("drained") ||
    t.includes("exhausted") ||
    t.includes("kapoy")
  ) {
    return "drained";
  }

  if (
    t.includes("sad") ||
    t.includes("lonely") ||
    t.includes("low") ||
    t.includes("down")
  ) {
    return "low";
  }

  if (
    t.includes("anxious") ||
    t.includes("overwhelmed") ||
    t.includes("stressed") ||
    t.includes("panic")
  ) {
    return "overwhelmed";
  }

  return "";
}

function shouldCreateOpenLoop(text) {
  const t = (text || "").toLowerCase();

  const patterns = [
    "i'm tired",
    "im tired",
    "i feel lost",
    "i feel stuck",
    "i don't know what to do",
    "i dont know what to do",
    "i'm overwhelmed",
    "im overwhelmed",
    "i feel sad",
    "i miss",
    "i'm anxious",
    "im anxious",
  ];

  return patterns.some((p) => t.includes(p));
}

async function updateSmartCheckinState(uid, message) {
  const update = {
    lastUserMessageAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const moodSignal = detectMoodSignal(message);
  if (moodSignal) {
    update.lastMoodSignal = moodSignal;
    update.lastMoodSignalAt = admin.firestore.FieldValue.serverTimestamp();
  }

  if (shouldCreateOpenLoop(message)) {
    update.lastOpenLoop = message.slice(0, 200);
    update.lastOpenLoopAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await db.collection("users").doc(uid).set(update, { merge: true });
}

async function upsertCheckin(uid, data = {}) {
  const payload = {
    enabled: typeof data.enabled === "boolean" ? data.enabled : true,
    timezone: data.timezone || "Asia/Manila",
    localHour: typeof data.localHour === "number" ? data.localHour : 19,
    localMinute: typeof data.localMinute === "number" ? data.localMinute : 0,
    message:
      typeof data.message === "string" && data.message.trim()
        ? data.message.trim()
        : "Hey… just checking in. How are you feeling today?",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const ref = db.collection("checkins").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
    payload.lastSentDate = null;
  }

  await ref.set(payload, { merge: true });
}

async function generateUpdatedSummary({
  ai,
  memory,
  history,
  userMessage,
  assistantReply,
}) {
  const existingSummary = getConversationSummary(memory);

  const summaryHistory = history
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-10);

  const completedTurn = [
    summaryHistory,
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantReply },
  ];

  const transcript = formatMessagesForPrompt(completedTurn);

  const summaryPrompt = `
Update the rolling conversation summary an emotionally steady chat app built on Stoic philosophy.

Rules:
- Keep the summary short and useful for future replies.
- Focus on ongoing topics, emotional tone, user preferences, and notable context.
- Preserve language style notes if relevant, such as mixed language, dialect, or casual tone.
- Do not use bullet points.
- Plain text only.
- Maximum ${MAX_SUMMARY_LENGTH} characters.

Existing summary:
${existingSummary || "(none)"}

Recent conversation to merge:
${transcript || "(none)"}

Updated summary:
`.trim();

  const summaryResponse = await ai.models.generateContent({
    model: SUMMARY_MODEL,
    contents: summaryPrompt,
  });

  const nextSummary = (summaryResponse.text || "")
    .slice(0, MAX_SUMMARY_LENGTH)
    .trim();

  return nextSummary || existingSummary;
}

const CORE_IDENTITY_PROMPT = `

You are Talkio: a calm, natural, and emotionally intelligent AI companion.

Your role is to talk like a real human—warm, present, and easy to speak with—while quietly helping the user stay grounded and move forward when needed.
You can sense right timing to apply stoic core and incorporate gratefulness in ones life no matter what.

Your role is to have natural, human-like conversations that help users feel heard, think clearly, and move forward in small, meaningful ways.

You are not a therapist, coach, or authority.
You are a steady companion who understands, then gently guides when the moment is right.
`.trim();

async function sendPushToUser(userId, notification) {
  const snapshot = await db
    .collection("users")
    .doc(userId) 
    .collection("device_tokens")
    .get();

  if (snapshot.empty) {
    logWarn("push_send_no_tokens", { userId });
    return { success: false, reason: "no_tokens" };
  }

  const tokens = snapshot.docs.map((doc) => doc.id).filter(Boolean);

  logInfo("push_send_started", {
    userId,
    tokenCount: tokens.length,
  });

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: notification.data || {},
    android: {
      priority: "high",
      notification: {
        sound: "default",
      },
    },
  });

  logInfo("push_send_finished", {
    userId,
    successCount: response.successCount,
    failureCount: response.failureCount,
  });

  for (let i = 0; i < response.responses.length; i++) {
    const result = response.responses[i];

    if (!result.success) {
      const failedToken = tokens[i];
      const errorCode = result.error?.code || "";
      const errorMessage = result.error?.message || "Unknown push error";

      logWarn("push_send_token_failed", {
        userId,
        token: failedToken,
        errorCode,
        errorMessage,
      });

      if (
        errorCode.includes("registration-token-not-registered") ||
        errorCode.includes("invalid-argument")
      ) {
        await db
          .collection("users")
          .doc(userId)
          .collection("device_tokens")
          .doc(failedToken)
          .delete();
      }
    }
  }

  return {
    success: true,
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
}
exports.bootstrapTalkioMemory = onRequest({ cors: true }, async (req, res) => {
  let uid = "unknown";

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const allowedOrigins = [
      "https://talkiochat.com",
      "https://www.talkiochat.com",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ];

    const origin = req.headers.origin || "";

    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({
        error: "Blocked origin",
        reply: "Unauthorized domain.",
      });
      return;
    }

    const incomingAppKey = req.headers["x-talkio-app-key"];

    if (!INTERNAL_APP_KEY) {
      res.status(500).json({
        error: "Missing INTERNAL_APP_KEY",
        reply: "Server security configuration is missing.",
      });
      return;
    }

    if (incomingAppKey !== INTERNAL_APP_KEY) {
      res.status(403).json({
        error: "Forbidden",
        reply: "Unauthorized request.",
      });
      return;
    }

    const auth = await requireVerifiedUser(req);
    uid = auth.uid;

    await ensureUserBase(uid, "Asia/Manila");

    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    const conversationSummary = await getConversationSummary(uid);

    const memoryBundle = await getTalkioMemoryBundle(db, uid, 5);
    const profile = memoryBundle?.profile || defaultTalkioProfile;

    const nickname =
      typeof userData?.nickname === "string" && userData.nickname.trim()
        ? userData.nickname.trim()
        : "";

    const response = {
  ok: true,
  uid,
  profile: {
    nickname,

    recentMoodTrend:
      typeof profile?.recentMoodTrend === "string"
        ? profile.recentMoodTrend
        : "",

    commonEmotionalStates: Array.isArray(profile?.commonEmotionalStates)
      ? profile.commonEmotionalStates.slice(0, 8)
      : [],

    supportStyle: Array.isArray(profile?.supportStyle)
      ? profile.supportStyle.slice(0, 8)
      : [],

    styleProfile:
      profile?.styleProfile && typeof profile.styleProfile === "object"
        ? profile.styleProfile
        : {},

    // ✅ ADD THIS
    behaviorProfile:
      profile?.behaviorProfile && typeof profile.behaviorProfile === "object"
        ? profile.behaviorProfile
        : {},

    // ✅ ADD THIS
    behaviorSignals:
      profile?.behaviorSignals && typeof profile.behaviorSignals === "object"
        ? profile.behaviorSignals
        : {},

    lastOpenLoop:
      typeof profile?.lastOpenLoop === "string"
        ? profile.lastOpenLoop
        : "",
    emotionalContinuityProfile:
  profile?.emotionalContinuityProfile &&
  typeof profile.emotionalContinuityProfile === "object"
    ? profile.emotionalContinuityProfile
    : {},

emotionalContinuitySignals:
  profile?.emotionalContinuitySignals &&
  typeof profile.emotionalContinuitySignals === "object"
    ? profile.emotionalContinuitySignals
    : {},
  },

  conversationSummary:
    typeof conversationSummary === "string" ? conversationSummary : "",
};

    logInfo("bootstrap_memory_loaded", {
      uid,
      hasNickname: !!nickname,
      hasSummary: !!response.conversationSummary,
      hasStyleProfile: !!profile?.styleProfile,
      hasBehaviorProfile: !!profile?.behaviorProfile,
    });

    res.status(200).json(response);
  } catch (error) {
    const statusCode = error?.statusCode || 500;

    logError("bootstrap_memory_failed", error, { uid });

    if (statusCode === 401) {
      res.status(401).json({
        error: "Unauthorized",
        reply: "Please sign in again and try once more.",
      });
      return;
    }

    res.status(500).json({
      error: "Failed to load memory bootstrap",
      reply: "Something went wrong while loading your profile.",
    });
  }
});

exports.saveTalkioProfile = onRequest({ cors: true }, async (req, res) => {
  let uid = "unknown";

  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const allowedOrigins = [
      "https://talkiochat.com",
      "https://www.talkiochat.com",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ];

    const origin = req.headers.origin || "";

    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({
        error: "Blocked origin",
        reply: "Unauthorized domain.",
      });
      return;
    }

    const incomingAppKey = req.headers["x-talkio-app-key"];

    if (!INTERNAL_APP_KEY) {
      res.status(500).json({
        error: "Missing INTERNAL_APP_KEY",
        reply: "Server security configuration is missing.",
      });
      return;
    }

    if (incomingAppKey !== INTERNAL_APP_KEY) {
      res.status(403).json({
        error: "Forbidden",
        reply: "Unauthorized request.",
      });
      return;
    }

    const auth = await requireVerifiedUser(req);
    uid = auth.uid;

    const body = req.body && typeof req.body === "object" ? req.body : {};

    const nickname =
      typeof body.nickname === "string" ? body.nickname.trim().slice(0, 40) : "";

    const timezone =
      typeof body.timezone === "string" && body.timezone.trim()
        ? body.timezone.trim().slice(0, 80)
        : "";

    const update = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (nickname) {
      update.nickname = nickname;
    } else if (body.nickname === "") {
      update.nickname = "";
    }

    if (timezone) {
      update.timezone = timezone;
    }

    await db.collection("users").doc(uid).set(update, { merge: true });

    logInfo("profile_saved", {
      uid,
      hasNickname: !!nickname,
      hasTimezone: !!timezone,
    });

    res.status(200).json({
      ok: true,
      profile: {
        nickname: nickname || "",
        timezone: timezone || "",
      },
    });
  } catch (error) {
    const statusCode = error?.statusCode || 500;

    logError("save_profile_failed", error, { uid });

    if (statusCode === 401) {
      res.status(401).json({
        error: "Unauthorized",
        reply: "Please sign in again and try once more.",
      });
      return;
    }

    res.status(500).json({
      error: "Failed to save profile",
      reply: "Something went wrong while saving your profile.",
    });
  }
});

exports.createCheckin = onRequest({ cors: true }, async (req, res) => {
  let uid = "unknown";

  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const allowedOrigins = getAllowedOrigins();
    const origin = req.headers.origin || "";

    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({
        error: "Blocked origin",
        reply: "Unauthorized domain.",
      });
      return;
    }

    const incomingAppKey = req.headers["x-talkio-app-key"];

    if (!INTERNAL_APP_KEY) {
      res.status(500).json({
        error: "Missing INTERNAL_APP_KEY",
        reply: "Server security configuration is missing.",
      });
      return;
    }

    if (incomingAppKey !== INTERNAL_APP_KEY) {
      res.status(403).json({
        error: "Forbidden",
        reply: "Unauthorized request.",
      });
      return;
    }

    const auth = await requireVerifiedUser(req);
    uid = auth.uid;

    const body = req.body && typeof req.body === "object" ? req.body : {};

    const timezone =
      typeof body.timezone === "string" && body.timezone.trim()
        ? body.timezone.trim().slice(0, 80)
        : "Asia/Manila";

    const localHour =
      typeof body.localHour === "number" &&
      Number.isFinite(body.localHour) &&
      body.localHour >= 0 &&
      body.localHour <= 23
        ? body.localHour
        : 19;

    const localMinute =
      typeof body.localMinute === "number" &&
      Number.isFinite(body.localMinute) &&
      body.localMinute >= 0 &&
      body.localMinute <= 59
        ? body.localMinute
        : 0;

    const message =
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim().slice(0, 200)
        : "Hey… just checking in. How are you feeling today?";

    await upsertCheckin(uid, {
      timezone,
      localHour,
      localMinute,
      message,
    });

    logInfo("checkin_created", { uid });

    res.status(200).json({
      ok: true,
      reply: "Check-in created.",
    });
  } catch (error) {
    const statusCode = error?.statusCode || 500;

    logError("create_checkin_failed", error, { uid });

    if (statusCode === 401) {
      res.status(401).json({
        error: "Unauthorized",
        reply: "Please sign in again and try once more.",
      });
      return;
    }

    res.status(500).json({
      error: "Failed to create check-in",
      reply: "Something went wrong while saving your check-in.",
    });
  }
});

exports.processDueCheckins = onSchedule(
  {
    schedule: "* * * * *",
    timeZone: "Asia/Manila",
  },
  async () => {
    try {
      logInfo("process_due_checkins_started");

      const now = new Date();

      const hourQueries = Array.from({ length: 24 }, (_, hour) =>
        db
          .collection("checkins")
          .where("enabled", "==", true)
          .where("localHour", "==", hour)
          .get()
      );

      const hourSnapshots = await Promise.all(hourQueries);
      const docs = hourSnapshots.flatMap((snap) => snap.docs);

      logInfo("process_due_checkins_candidates_loaded", {
        candidateCount: docs.length,
      });

      for (const doc of docs) {
        const checkin = doc.data();
        const uid = doc.id;
        const timeZone = checkin.timezone || "Asia/Manila";
        const localHour =
          typeof checkin.localHour === "number" ? checkin.localHour : 19;
        const localMinute =
          typeof checkin.localMinute === "number" ? checkin.localMinute : 0;

        const localDateKey = getLocalDateKey(now, timeZone);
        const localNow = getLocalNowParts(now, timeZone);

        if (localNow.hour !== localHour) {
          continue;
        }

        const isDue = isWithinCheckinWindow(
          localNow,
          localHour,
          localMinute,
          2
        );

        if (!isDue) {
          continue;
        }

        const alreadySentToday = checkin.lastSentDate === localDateKey;

        if (alreadySentToday) {
          logInfo("checkin_skipped_already_sent", {
            uid,
            localDateKey,
          });
          continue;
        }

        const userSnap = await db.collection("users").doc(uid).get();
        const userData = userSnap.exists ? userSnap.data() : {};

        if (wasRecentlyActive(userData, 30)) {
          logInfo("checkin_skipped_recent_activity", {
            uid,
          });
          continue;
        }

        const message = pickCheckinMessage(checkin, userData);

        logInfo("checkin_triggered", {
          uid,
          localDateKey,
          hour: localNow.hour,
          minute: localNow.minute,
          scheduledHour: localHour,
          scheduledMinute: localMinute,
          timeZone,
        });

        const pushResult = await sendPushToUser(uid, {
  title: "Talkio",
  body: message,
  data: { type: "checkin" },
});

        if (pushResult?.successCount > 0) {
          await db.collection("checkins").doc(uid).set(
            {
              lastSentDate: localDateKey,
              lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          logInfo("checkin_sent", {
            uid,
            pushResult,
          });
        } else {
          logWarn("checkin_push_failed", {
            uid,
            pushResult,
          });
        }
      }

      logInfo("process_due_checkins_finished");
    } catch (error) {
      logError("process_due_checkins_failed", error);
    }
  }
);

function getTimeOfDayLabel(localTime) {
  if (!localTime || typeof localTime !== "string") return "unknown";

  const text = localTime.trim().toLowerCase();

  let match = text.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (match) {
    let hour = Number(match[1]);
    const meridiem = match[3].toLowerCase();

    if (Number.isNaN(hour)) return "unknown";

    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;

    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }

  match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hour = Number(match[1]);
    if (Number.isNaN(hour)) return "unknown";

    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }

  return "unknown";
}

function getTimeOfDayLabelFromHour(localHour) {
  const hour = Number(localHour);

  if (Number.isNaN(hour)) return "unknown";
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  if (typeof authHeader !== "string") return "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice(7).trim();
}

async function requireVerifiedUser(req) {
  const idToken = extractBearerToken(req);

  if (!idToken) {
    const err = new Error("Missing auth token");
    err.statusCode = 401;
    throw err;
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    const err = new Error("Invalid auth token");
    err.statusCode = 401;
    throw err;
  }

  const uid = decoded?.uid || "";
  if (!uid) {
    const err = new Error("Invalid authenticated user");
    err.statusCode = 401;
    throw err;
  }

  return { uid, decoded };
}

async function getTrustedUserTier(uid) {
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) return "free";

    const rawTier = userSnap.data()?.userTier || userSnap.data()?.tier || "free";

    if (rawTier === "ultra") return "ultra";
    if (rawTier === "premium") return "premium";
    return "free";
  } catch (error) {
    logWarn("trusted_tier_lookup_failed", {
      uid,
      message: error?.message || String(error),
    });
    return "free";
  }
}

function validateIncomingHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-20)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 2000),
    }));
}

function validateOptionalString(value, max = 120) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function validateOptionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getAllowedOrigins() {
  return [
    "https://talkiochat.com",
    "https://www.talkiochat.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];
}

function detectEmotionalState(text = "") {
  const t = String(text || "").toLowerCase();

  if (
    t.includes("overwhelmed") ||
    t.includes("panic") ||
    t.includes("panicking") ||
    t.includes("anxious") ||
    t.includes("stressed out")
  ) {
    return "overwhelmed";
  }

  if (
    t.includes("sad") ||
    t.includes("lonely") ||
    t.includes("down") ||
    t.includes("empty") ||
    t.includes("heartbroken")
  ) {
    return "low";
  }

  if (
    t.includes("tired") ||
    t.includes("drained") ||
    t.includes("exhausted") ||
    t.includes("burned out") ||
    t.includes("kapoy") ||
    t.includes("pagod")
  ) {
    return "drained";
  }

  if (
    t.includes("angry") ||
    t.includes("mad") ||
    t.includes("furious") ||
    t.includes("annoyed")
  ) {
    return "agitated";
  }

  if (
    t.includes("okay") ||
    t.includes("fine") ||
    t.includes("better") ||
    t.includes("calmer")
  ) {
    return "settling";
  }

  return "neutral";
}

function detectEmotionalWeight(text = "") {
  const t = String(text || "").toLowerCase();

  let score = 0;

  const heavyMarkers = [
    "overwhelmed",
    "panic",
    "anxious",
    "can't do this",
    "cant do this",
    "stuck",
    "lost",
    "lonely",
    "empty",
    "drained",
    "exhausted",
    "burned out",
    "heartbroken",
  ];

  for (const marker of heavyMarkers) {
    if (t.includes(marker)) score += 1;
  }

  if ((t.match(/!/g) || []).length >= 2) score += 1;

  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

function updateEmotionalContinuitySignals(message, currentSignals = {}) {
  const next = {
    overwhelmedCount: currentSignals.overwhelmedCount || 0,
    lowCount: currentSignals.lowCount || 0,
    drainedCount: currentSignals.drainedCount || 0,
    agitatedCount: currentSignals.agitatedCount || 0,
    settlingCount: currentSignals.settlingCount || 0,
    neutralCount: currentSignals.neutralCount || 0,
    highWeightCount: currentSignals.highWeightCount || 0,
    mediumWeightCount: currentSignals.mediumWeightCount || 0,
    lowWeightCount: currentSignals.lowWeightCount || 0,
    unresolvedTopicCount: currentSignals.unresolvedTopicCount || 0,
    lastUpdatedAt: currentSignals.lastUpdatedAt || 0,
  };

  const state = detectEmotionalState(message);
  const weight = detectEmotionalWeight(message);
  const hasOpenLoop = shouldCreateOpenLoop(message);

  if (state === "overwhelmed") next.overwhelmedCount += 1;
  else if (state === "low") next.lowCount += 1;
  else if (state === "drained") next.drainedCount += 1;
  else if (state === "agitated") next.agitatedCount += 1;
  else if (state === "settling") next.settlingCount += 1;
  else next.neutralCount += 1;

  if (weight === "high") next.highWeightCount += 1;
  else if (weight === "medium") next.mediumWeightCount += 1;
  else next.lowWeightCount += 1;

  if (hasOpenLoop) next.unresolvedTopicCount += 1;

  next.lastUpdatedAt = Date.now();

  return next;
}

function deriveEmotionalContinuityProfile(signals = {}) {
  const overwhelmedCount = signals.overwhelmedCount || 0;
  const lowCount = signals.lowCount || 0;
  const drainedCount = signals.drainedCount || 0;
  const agitatedCount = signals.agitatedCount || 0;
  const settlingCount = signals.settlingCount || 0;
  const highWeightCount = signals.highWeightCount || 0;
  const mediumWeightCount = signals.mediumWeightCount || 0;
  const unresolvedTopicCount = signals.unresolvedTopicCount || 0;
  const lastUpdatedAt = signals.lastUpdatedAt || 0;

  const hoursSinceUpdate = lastUpdatedAt
    ? (Date.now() - lastUpdatedAt) / (1000 * 60 * 60)
    : Infinity;

  let dominantEmotionalPattern = "steady";
  const maxValue = Math.max(
    overwhelmedCount,
    lowCount,
    drainedCount,
    agitatedCount,
    settlingCount
  );

  if (maxValue === overwhelmedCount && maxValue > 0) {
    dominantEmotionalPattern = "overwhelmed";
  } else if (maxValue === lowCount && maxValue > 0) {
    dominantEmotionalPattern = "low";
  } else if (maxValue === drainedCount && maxValue > 0) {
    dominantEmotionalPattern = "drained";
  } else if (maxValue === agitatedCount && maxValue > 0) {
    dominantEmotionalPattern = "agitated";
  } else if (maxValue === settlingCount && maxValue > 0) {
    dominantEmotionalPattern = "settling";
  }

  if (hoursSinceUpdate > 48) {
    dominantEmotionalPattern = "steady";
  }

  let emotionalLoad = "light";
  if (highWeightCount >= 4) emotionalLoad = "heavy";
  else if (highWeightCount + mediumWeightCount >= 4) emotionalLoad = "moderate";

  let continuityNeed = "low";
  if (unresolvedTopicCount >= 5) continuityNeed = "high";
  else if (unresolvedTopicCount >= 2) continuityNeed = "medium";

  let followUpStyle = "gentle";
  if (dominantEmotionalPattern === "agitated") followUpStyle = "steady_direct";
  else if (dominantEmotionalPattern === "overwhelmed") followUpStyle = "soft_slow";
  else if (dominantEmotionalPattern === "low") followUpStyle = "warm_gentle";

  return {
    dominantEmotionalPattern,
    emotionalLoad,
    continuityNeed,
    followUpStyle,
    lastUpdatedAt,
  };
}

function buildEmotionalContinuityBlock(profile = {}, recentContext = {}) {
  const emotional = profile?.emotionalContinuityProfile || {};
  const dominantEmotionalPattern =
    emotional.dominantEmotionalPattern || "steady";
  const emotionalLoad = emotional.emotionalLoad || "light";
  const continuityNeed = emotional.continuityNeed || "low";
  const followUpStyle = emotional.followUpStyle || "gentle";

  const lastOpenLoop =
    typeof profile?.lastOpenLoop === "string" ? profile.lastOpenLoop : "";

  const recentMoodTrend =
    typeof profile?.recentMoodTrend === "string" ? profile.recentMoodTrend : "";

  return `
EMOTIONAL CONTINUITY:
Recent emotional pattern: ${dominantEmotionalPattern}
Recent emotional load: ${emotionalLoad}
Continuity need: ${continuityNeed}
Suggested follow-up style: ${followUpStyle}
Recent mood trend: ${recentMoodTrend || "unknown"}
Last open loop: ${lastOpenLoop || "(none)"}

If the current message connects naturally to an unresolved emotional thread, acknowledge that gently.
Do not force a follow-up if the user is clearly moving to a different topic.
Keep continuity subtle, human, and emotionally steady.
Do not mention this profile to the user.

Only apply emotional continuity if the current message clearly relates
to a similar emotional tone or unresolved issue.

If the user shifts topic, prioritize the present message instead.
`.trim();
}

exports.generateTalkioReply = onRequest({ cors: true }, async (req, res) => {
  let uid = "unknown";

  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const allowedOrigins = getAllowedOrigins();
    const origin = req.headers.origin || "";

    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({
        error: "Blocked origin",
        reply: "Unauthorized domain.",
      });
      return;
    }

    const incomingAppKey = req.headers["x-talkio-app-key"];
    if (!INTERNAL_APP_KEY) {
      res.status(500).json({
        error: "Missing INTERNAL_APP_KEY",
        reply: "Server security configuration is missing.",
      });
      return;
    }

    if (incomingAppKey !== INTERNAL_APP_KEY) {
      res.status(403).json({
        error: "Forbidden",
        reply: "Unauthorized request.",
      });
      return;
    }

    const auth = await requireVerifiedUser(req);
    uid = auth.uid;

    const body = req.body && typeof req.body === "object" ? req.body : {};

    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      res.status(400).json({
        error: "Invalid message",
        reply: "Please type a message.",
      });
      return;
    }

    if (message.length > 2000) {
      res.status(400).json({
        error: "Message too long",
        reply: "That message is a bit too long. Try sending it in smaller parts.",
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: "Missing GEMINI_API_KEY",
        reply: "Server is missing API key.",
      });
      return;
    }

    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
      res.status(500).json({
        error: "Missing Redis environment variables",
        reply: "Server is missing Redis configuration.",
      });
      return;
    }

    const trustedUserTier = await getTrustedUserTier(uid);
    const { dailyLimit, perMinuteLimit } = getLimitsForTier(trustedUserTier);

    const localTime = validateOptionalString(body.localTime, 40);
    const localDate = validateOptionalString(body.localDate, 40);
    const localWeekday = validateOptionalString(body.localWeekday, 20);
    const timeZone = validateOptionalString(body.timeZone, 80) || "Asia/Manila";
    const localHour = validateOptionalNumber(body.localHour);

    const history = validateIncomingHistory(body.history);

    const safeMessage = message.slice(0, 1200);

    logInfo("request_received", {
      uid,
      hasMessage: true,
      hasHistory: history.length > 0,
      userTier: trustedUserTier,
      messageLength: message.length,
    });

    if (looksLikeCrisis(safeMessage)) {
      res.status(200).json({
        reply: crisisReplyPH(),
        flagged: "crisis",
      });
      return;
    }

    const memoryCommand = detectMemoryCommand(message);
    const reminderCommand = detectReminderCommand(message);

    await markUserMessage(uid);
    await updateSmartCheckinState(uid, message);

    logInfo("user_message_received", {
      uid,
      messageLength: message.length,
    });

    const memoryBundle = await getTalkioMemoryBundle(db, uid, 5);

    logInfo("memory_loaded", {
      uid,
      hasProfile: !!memoryBundle?.profile,
      memoryCount: memoryBundle?.memories?.length || 0,
    });

    const userProfile = memoryBundle?.profile || defaultTalkioProfile;
    const currentUserProfile = userProfile;

    const updatedSignals = updateStyleSignals(
  message,
  currentUserProfile.styleSignals || {}
);

const updatedStyleProfile = deriveStyleProfileFromSignals(
  updatedSignals,
  currentUserProfile.styleProfile || defaultTalkioProfile.styleProfile
);

const updatedBehaviorSignals = updateBehaviorSignals(
  message,
  currentUserProfile.behaviorSignals || {}
);

const updatedBehaviorProfile = deriveBehaviorProfile(
  updatedBehaviorSignals
);

const updatedEmotionalContinuitySignals = updateEmotionalContinuitySignals(
  message,
  currentUserProfile.emotionalContinuitySignals || {}
);

const updatedEmotionalContinuityProfile = deriveEmotionalContinuityProfile(
  updatedEmotionalContinuitySignals
);

const enrichedProfile = {
  ...currentUserProfile,
  styleProfile: updatedStyleProfile,
  styleSignals: updatedSignals,
  behaviorProfile: updatedBehaviorProfile,
  behaviorSignals: updatedBehaviorSignals,
  emotionalContinuityProfile: updatedEmotionalContinuityProfile,
  emotionalContinuitySignals: updatedEmotionalContinuitySignals,
};

const styleProfileBlock = buildStyleProfileBlock(enrichedProfile);
const behaviorProfileBlock = buildBehaviorProfileBlock(enrichedProfile);
const languageMirrorBlock = buildLanguageMirrorBlock(
  message,
  enrichedProfile.behaviorProfile
);

const emotionalContinuityBlock = buildEmotionalContinuityBlock(enrichedProfile);

    const ai = new GoogleGenAI({ apiKey });

    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    const recentHistory = history
      .filter((m) => m.role === "user" && typeof m.content === "string")
      .slice(-MAX_CONTEXT_MESSAGES);

    const context = formatMessagesForPrompt(recentHistory);

    const ip = getClientIp(req);
    const ua = getUa(req);
    const fp = sha1(`${ip}|${ua}`);
    const effectiveUserId = uid;

    await ensureUserBase(uid, timeZone);

    if (memoryCommand?.type === "view_memory") {
      const summary = await getUserMemorySummary(uid);
      res.status(200).json({ reply: summary });
      return;
    }

    if (memoryCommand?.type === "forget_memory") {
      const result = await forgetMatchingMemory(uid, memoryCommand.target);
      res.status(200).json({
        reply: result.found
          ? "Okay. I’ve forgotten that."
          : "I couldn’t find anything matching that.",
      });
      return;
    }

    if (memoryCommand?.type === "clear_memory") {
      const count = await clearAllMemory(uid);
      res.status(200).json({
        reply:
          count > 0
            ? "Okay. I cleared the memory I was holding onto."
            : "There wasn’t anything stored to clear.",
      });
      return;
    }

    if (reminderCommand?.type === "reminder_intent") {
      if (!reminderCommand.valid) {
        let reply = "I can set that reminder, but I need a clearer time.";

        if (reminderCommand.reason === "missing_date") {
          reply =
            "I can set that reminder, but I need the date. Try saying something like: remind me tomorrow at 7am to drink bone broth.";
        } else if (reminderCommand.reason === "missing_time") {
          reply =
            "I can set that reminder, but I need the time. Try saying something like: remind me tomorrow at 7am to drink bone broth.";
        }

        res.status(200).json({ reply });
        return;
      }

      await createReminder(uid, {
        text: reminderCommand.text,
        category: reminderCommand.category,
        scheduledAt: admin.firestore.Timestamp.fromDate(reminderCommand.scheduledAt),
        timezone: timeZone,
        repeat: reminderCommand.repeat,
        sourceMessage: reminderCommand.sourceMessage,
      });

      const whenText = new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      }).format(reminderCommand.scheduledAt);

      res.status(200).json({
        reply: `Got it. I’ll remind you on ${whenText} to ${reminderCommand.text}.`,
      });
      return;
    }

    const relevantMemories = await getRelevantMemory(uid, message);
    const previousSummary = await getConversationSummary(uid);
    const memoryBlock = formatMemoryForPrompt(relevantMemories, previousSummary);

    const FINAL_TALKIO_SYSTEM_PROMPT = `
${CORE_IDENTITY_PROMPT}
`.trim();

    const deviceMemory =
      typeof body.memory === "object" && body.memory ? body.memory : {};

    const moodHintRaw =
      typeof deviceMemory.mood === "string" ? deviceMemory.mood : "";
    const moodHint = moodHintRaw.slice(0, 120);

    const intentHint =
      typeof deviceMemory.intent === "string" ? deviceMemory.intent.slice(0, 120) : "";

    const conversationSummary = previousSummary;

    const metaLine =
      moodHint || intentHint
        ? `User context (device): mood=${moodHint || "unknown"}, intent=${intentHint || "chat"}\n`
        : "";

    const moodLine = moodHint
      ? `User emotional context (from this device): ${moodHint}\n`
      : "";

    const localTimeOfDay = getTimeOfDayLabelFromHour(localHour);

    const localTimeLine =
      localHour !== null
        ? `SYSTEM TIME CONTEXT:
User local weekday: ${localWeekday}
User local date: ${localDate}
User local clock time: ${localTime}
User local hour (0-23): ${localHour}
User time of day: ${localTimeOfDay}

This time context is accurate and must be used when referring to time of day.
\n`
        : "";

    const timeInstructionLine =
      localHour !== null
        ? `TIME RULES:
If localHour >= 17 → evening
If localHour >= 12 → afternoon
If localHour < 12 → morning

Never contradict this time context.
If unsure, avoid time-of-day greetings.
\n`
        : "";

    const prompt = `
${FINAL_TALKIO_SYSTEM_PROMPT}

${styleProfileBlock ? styleProfileBlock + "\n\n" : ""}
${behaviorProfileBlock ? behaviorProfileBlock + "\n\n" : ""}
${languageMirrorBlock ? languageMirrorBlock + "\n\n" : ""}
${emotionalContinuityBlock ? emotionalContinuityBlock + "\n\n" : ""}

- Ground the reply in:
  1. Reality
  2. Control
  3. Action
- Usually 3 to 5 sentences
- Be direct, but still human and natural
- Do not sound robotic, clipped, or mechanical

${memoryBlock ? memoryBlock + "\n\n" : ""}${localTimeLine}${timeInstructionLine}${metaLine || ""}${moodLine || ""}
Conversation summary:
${conversationSummary || "(none)"}

Recent conversation:
${context || "(no prior messages)"}

User: ${safeMessage}

Talkio:
`.trim();

    const today = getTodayDateString();
    const minuteBucket = Math.floor(Date.now() / 60000);

    const userDailyKey = `talkio:msg:${effectiveUserId}:${today}`;
    const minuteKey = `talkio:quota:min:${effectiveUserId}:${minuteBucket}`;
    const ipDayKey = `talkio:ip:day:${fp}:${today}`;
    const ipMinKey = `talkio:ip:min:${fp}:${minuteBucket}`;

    const [userDayStr, minStr, ipDayStr, ipMinStr] = await Promise.all([
      redis.get(userDailyKey),
      redis.get(minuteKey),
      redis.get(ipDayKey),
      redis.get(ipMinKey),
    ]);

    const userDayCount = Number(userDayStr || 0);
    const minCountCurrent = Number(minStr || 0);
    const ipDayCurrent = Number(ipDayStr || 0);
    const ipMinCurrent = Number(ipMinStr || 0);

    logInfo("rate_limit_check", {
      uid: effectiveUserId,
      userDayCount,
      dailyLimit,
      minuteCount: minCountCurrent,
      perMinuteLimit,
      ipDayCurrent,
      ipMinCurrent,
    });

    if (userDayCount >= dailyLimit && !memoryCommand && !reminderCommand) {
      res.status(429).json({
        error: "Daily message limit reached",
        reply:
          trustedUserTier === "premium"
            ? "You've reached today's premium message limit. Please come back tomorrow when messages reset."
            : trustedUserTier === "ultra"
              ? "You've reached today's ultra message limit. Please come back tomorrow when messages reset."
              : "You've reached today's free message limit. Talkio Pro unlocks higher limits, or you can come back tomorrow when messages reset.",
      });
      return;
    }

    if (ipMinCurrent >= IP_MINUTE_CAP && !memoryCommand && !reminderCommand) {
      res.status(429).json({
        error: "Too many requests",
        reply: "You're sending messages too fast. Please wait a moment and try again.",
      });
      return;
    }

    if (ipDayCurrent >= IP_DAILY_CAP && !memoryCommand && !reminderCommand) {
      res.status(429).json({
        error: "Daily capacity reached",
        reply:
          "We’ve reached today’s free capacity on this network/device. Please try again tomorrow.",
      });
      return;
    }

    if (minCountCurrent >= perMinuteLimit && !memoryCommand && !reminderCommand) {
      res.status(429).json({
        error: "Too many messages",
        reply: "You're sending messages too fast. Please wait a moment and try again.",
      });
      return;
    }

    const [userDayCountNew, minCount, ipDayCount, ipMinCount] =
      await Promise.all([
        redis.incr(userDailyKey),
        redis.incr(minuteKey),
        redis.incr(ipDayKey),
        redis.incr(ipMinKey),
      ]);

    const expireOps = [];
    if (userDayCountNew === 1) {
      expireOps.push(redis.expire(userDailyKey, secondsUntilUtcMidnight()));
    }
    if (minCount === 1) {
      expireOps.push(redis.expire(minuteKey, 70));
    }
    if (ipDayCount === 1) {
      expireOps.push(redis.expire(ipDayKey, secondsUntilUtcMidnight()));
    }
    if (ipMinCount === 1) {
      expireOps.push(redis.expire(ipMinKey, 70));
    }
    if (expireOps.length) {
      await Promise.all(expireOps);
    }

    const selectedModel = pickModel({ userTier: trustedUserTier });

    let reply = "";
    let modelUsed = selectedModel;

    try {
      logInfo("ai_generation_start", {
        model: selectedModel,
        uid,
        type: "primary",
      });

      const response = await ai.models.generateContent({
        model: selectedModel,
        systemInstruction: {
          parts: [{ text: FINAL_TALKIO_SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      });

      reply =
        typeof response.text === "function"
          ? response.text()
          : response.text || "";

      logInfo("ai_generation_success", {
        model: selectedModel,
        uid,
        replyLength: reply.length,
        type: "primary",
      });
    } catch (err) {
      const errorText = err?.message || String(err);

      logger.warn("Primary model failed", {
        model: selectedModel,
        error: errorText,
      });

      if (
        errorText.includes('"code":429') ||
        errorText.includes("RESOURCE_EXHAUSTED")
      ) {
        res.status(429).json({
          error: "AI quota reached",
          reply: "Talkio is a bit busy right now. Please wait a little and try again.",
        });
        return;
      }

      try {
        const fallbackModel =
          trustedUserTier === "ultra"
            ? PREMIUM_MODEL
            : trustedUserTier === "premium"
              ? FREE_MODEL
              : FREE_MODEL;

        logInfo("ai_generation_start", {
          model: fallbackModel,
          uid,
          type: "fallback",
        });

        const response = await ai.models.generateContent({
          model: fallbackModel,
          systemInstruction: {
            parts: [{ text: FINAL_TALKIO_SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
        });

        reply =
          typeof response.text === "function"
            ? response.text()
            : response.text || "";

        logInfo("ai_generation_success", {
          model: fallbackModel,
          uid,
          replyLength: reply.length,
          type: "fallback",
        });

        modelUsed = fallbackModel;
      } catch (fallbackError) {
        logger.error("Fallback model also failed", {
          message: fallbackError?.message || String(fallbackError),
          stack: fallbackError?.stack || null,
          name: fallbackError?.name || null,
        });
        throw fallbackError;
      }
    }

    if (!reply || reply.trim().length === 0) {
      reply = "Something went wrong on my end. Please try sending your message again.";
    }

    if (memoryCommand?.type !== "do_not_save") {
      const candidates = extractMemoryCandidates(message).slice(0, 3);

      for (const candidate of candidates) {
        await upsertMemoryWithReplacement(uid, candidate);
      }
    }

    for (const memory of relevantMemories) {
      await markMemoryUsed(uid, memory.id);

      if (memory.type === "reminder_followup") {
        await archiveMemory(uid, memory.id);
      }
    }

    const nextSummary = buildSimpleRollingSummary({
      previousSummary,
      userMessage: message,
      assistantReply: reply,
    });

    await setConversationSummary(uid, nextSummary);

    try {
      await updateTalkioUserProfile(db, uid, {
        behaviorProfile: updatedBehaviorProfile,
        behaviorSignals: updatedBehaviorSignals,
        emotionalContinuityProfile: updatedEmotionalContinuityProfile,
        emotionalContinuitySignals: updatedEmotionalContinuitySignals,

        recentMoodTrend: "mixed recently",
        commonEmotionalStates: ["mixed"],
        supportStyle: ["steady conversation", "grounded support"],

        recentRelationalContext: {
          lastMode: "stoic_core",
          lastConversationVibe: "grounded",
          lastCheckInWorthyTopic: shouldCreateOpenLoop(safeMessage)
            ? safeMessage.slice(0, 80)
            : "",
        },

        lastOpenLoop: shouldCreateOpenLoop(safeMessage)
          ? safeMessage.slice(0, 120)
          : "",

        openLoops: shouldCreateOpenLoop(safeMessage)
  ? [
      {
        topic: "stoic_core",
        summary: safeMessage.slice(0, 200),
        emotion: detectEmotionalState(safeMessage), // ✅ ADD THIS
        startedAt: Date.now(),
        lastMentionedAt: Date.now(),
        status: "open",
        followUpStyle: "gentle",
      },
    ]
  : [],
      });

      await updateEmotionDay(db, uid, today, {
        dominantMood: "mixed",
        moodScore: 3,
        themes: ["stoic_core"],
        summary: safeMessage.slice(0, 200),
      });
    } catch (memoryError) {
      logger.warn("Failed to update Talkio memory", {
        uid,
        error: memoryError?.message || String(memoryError),
      });
    }

    await markTalkioReply(uid);

    logInfo("response_sent", {
      uid,
      modelUsed,
      replyLength: reply.length,
      remainingDaily: Math.max(0, dailyLimit - userDayCountNew),
    });

    res.status(200).json({
      reply,
      model: modelUsed,
      remainingDaily: Math.max(0, dailyLimit - userDayCountNew),
    });
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || null;
    const errorName = error?.name || null;

    logError("generate_reply_failed", error, { uid });

    logger.error("generateTalkioReply failed", {
      message: errorMessage,
      stack: errorStack,
      name: errorName,
      uid,
    });

    if (statusCode === 401) {
      res.status(401).json({
        error: "Unauthorized",
        reply: "Please sign in again and try once more.",
      });
      return;
    }

    res.status(500).json({
      error: "Server error",
      reply: "Something went wrong on my end. Please try again.",
    });
  }
});

exports.testPush = onRequest({ cors: true }, async (req, res) => {
  let uid = "unknown";

  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const allowedOrigins = getAllowedOrigins();
    const origin = req.headers.origin || "";

    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({
        error: "Blocked origin",
        reply: "Unauthorized domain.",
      });
      return;
    }

    const incomingAppKey = req.headers["x-talkio-app-key"];

    if (!INTERNAL_APP_KEY) {
      res.status(500).json({
        error: "Missing INTERNAL_APP_KEY",
        reply: "Server security configuration is missing.",
      });
      return;
    }

    if (incomingAppKey !== INTERNAL_APP_KEY) {
      res.status(403).json({
        error: "Forbidden",
        reply: "Unauthorized request.",
      });
      return;
    }

    const auth = await requireVerifiedUser(req);
    uid = auth.uid;

    logInfo("test_push_requested", { uid });

    const result = await sendPushToUser(uid, {
      title: "Talkio",
      body: "Test push notification from Talkio.",
      data: {
        type: "test_push",
      },
    });

    res.status(200).json({
      ok: true,
      result,
    });
  } catch (error) {
    const statusCode = error?.statusCode || 500;

    logError("test_push_failed", error, { uid });

    if (statusCode === 401) {
      res.status(401).json({
        error: "Unauthorized",
        reply: "Please sign in again and try once more.",
      });
      return;
    }

    res.status(500).json({
      error: "Failed to send test push",
      reply: "Something went wrong while sending the test notification.",
    });
  }
});

exports.processSmartCheckins = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: "Asia/Manila",
  },
  async () => {
    try {
      logInfo("process_smart_checkins_started");

      const usersSnap = await db.collection("users").get();

      logInfo("process_smart_checkins_candidates_loaded", {
        candidateCount: usersSnap.size,
      });

      for (const doc of usersSnap.docs) {
        const uid = doc.id;
        const userData = doc.data() || {};

        if (hasRecentCheckin(userData, 12)) {
          continue;
        }

        let triggerType = null;

        if (isOpenLoopEligible(userData, 6, 72)) {
          triggerType = "open_loop";
        } else if (isLowMoodEligible(userData, 8, 48)) {
          triggerType = "low_mood";
        } else if (isSilenceEligible(userData, 24)) {
          triggerType = "silence";
        }

        if (!triggerType) {
          continue;
        }

        const message = pickSmartCheckinMessage(userData);

        logInfo("smart_checkin_triggered", {
          uid,
          triggerType,
        });

        const pushResult = await sendPushToUser(uid, {
  title: "Talkio",
  body: message,
  data: {
    type: "smart_checkin",
    triggerType,
  },
});

        if (pushResult?.successCount > 0) {
          await db.collection("users").doc(uid).set(
            {
              lastCheckinSentAt: admin.firestore.FieldValue.serverTimestamp(),
              lastCheckinType: triggerType,
            },
            { merge: true }
          );

          logInfo("smart_checkin_sent", {
            uid,
            triggerType,
            pushResult,
          });
        } else {
          logWarn("smart_checkin_push_failed", {
            uid,
            triggerType,
            pushResult,
          });
        }
      }

      logInfo("process_smart_checkins_finished");
    } catch (error) {
      logError("process_smart_checkins_failed", error);
    }
  }
);

function hoursAgo(dateLike) {
  const date = dateLike?.toDate?.() || (dateLike instanceof Date ? dateLike : null);
  if (!date) return Infinity;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

function hasRecentCheckin(userData, hours = 12) {
  return hoursAgo(userData?.lastCheckinSentAt) < hours;
}

function isSilenceEligible(userData, hours = 24) {
  return hoursAgo(userData?.lastUserMessageAt) >= hours;
}

function isOpenLoopEligible(userData, silenceHours = 6, maxAgeHours = 72) {
  const openLoopText =
    typeof userData?.lastOpenLoop === "string" ? userData.lastOpenLoop.trim() : "";
  if (!openLoopText) return false;

  return (
    hoursAgo(userData?.lastOpenLoopAt) <= maxAgeHours &&
    hoursAgo(userData?.lastUserMessageAt) >= silenceHours
  );
}

function isLowMoodEligible(userData, silenceHours = 8, maxAgeHours = 48) {
  const mood = typeof userData?.lastMoodSignal === "string"
    ? userData.lastMoodSignal.toLowerCase()
    : "";

  if (!["low", "drained", "overwhelmed"].includes(mood)) {
    return false;
  }

  return (
    hoursAgo(userData?.lastMoodSignalAt) <= maxAgeHours &&
    hoursAgo(userData?.lastUserMessageAt) >= silenceHours
  );
}

function pickSmartCheckinMessage(userData = {}) {
  const openLoop =
    typeof userData?.lastOpenLoop === "string" ? userData.lastOpenLoop.trim() : "";
  const mood = typeof userData?.lastMoodSignal === "string"
    ? userData.lastMoodSignal.toLowerCase()
    : "";

  if (openLoop) {
    const options = [
      "Hey… just checking in on you a bit. How have you been feeling since last time?",
      "Hi — just wanted to check in. How’s that been sitting with you today?",
      "Hey, I just wanted to check in gently. How are you holding up with that?",
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  if (["low", "drained", "overwhelmed"].includes(mood)) {
    const options = [
      "Hey… just checking in. How are you feeling today?",
      "Hi — no pressure, just wanted to see how you’re doing today.",
      "Hey, just checking in softly. How has today been treating you?",
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  const options = [
    "Hey… just checking in. How are you feeling today?",
    "Hi — just wanted to check in a bit. How’s your day going?",
    "Just checking in for a moment. How are you doing?",
  ];
  return options[Math.floor(Math.random() * options.length)];
}

exports.decayMemoryScores = decayMemoryScores;
exports.pruneMemory = pruneMemory;
exports.processDueReminders = processDueReminders;