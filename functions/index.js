"use strict";

import admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as functions from "firebase-functions";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { getTalkioPlan } = require("./talkio/planConfig");
const logger = require("firebase-functions/logger");
const { GoogleGenAI } = require("@google/genai");
const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const { db } = require("./lib/firebase");
const { ensureUserBase } = require("./memory_lite/helpers");
const {
  getTalkioMemoryBundle,
  defaultTalkioProfile,
  getTodayDateString,
} = require("./lib/talkioMemory");

const {
  generateTalkioReply: generateTalkioReplyEngine,
} = require("./talkio/generateTalkioReply");

const {
  CORE_IDENTITY_PROMPT,
  TALKIO_SOUL_LAYER,
  RELATIONAL_INTELLIGENCE_LAYER,
  HUMAN_REALISM_LAYER,
} = require("./talkio/prompts");

if (!admin.apps.length) {
  admin.initializeApp();
}

console.log("generateTalkioReplyEngine type:", typeof generateTalkioReplyEngine);


const INTERNAL_APP_KEY = process.env.INTERNAL_APP_KEY;

const TALKIO_LIMITS = {
  free: {
    daily: 10,
    perMinute: 10,
  },

  premium: {
    daily: 300,
    perMinute: 30,
  },

  ultra: {
    daily: 1000,
    perMinute: 60,
  },

  earlyAccess: {
    daily: 1000,
    perMinute: 60,
  },
};

function getLimitsForAccess(access = {}) {
  const quotaTier = access?.quotaTier || "free";

  if (quotaTier === "ultra") {
    return {
      dailyLimit: TALKIO_LIMITS.ultra.daily,
      perMinuteLimit: TALKIO_LIMITS.ultra.perMinute,
      limitLabel: "ultra",
      bypassIpLimits: true,
    };
  }

  if (
    quotaTier === "premium" ||
    access?.plan === "pro"
  ) {
    return {
      dailyLimit: TALKIO_LIMITS.premium.daily,
      perMinuteLimit: TALKIO_LIMITS.premium.perMinute,
      limitLabel: "premium",
      bypassIpLimits: false,
    };
  }

  if (quotaTier === "early_access") {
    return {
      dailyLimit: TALKIO_LIMITS.earlyAccess.daily,
      perMinuteLimit: TALKIO_LIMITS.earlyAccess.perMinute,
      limitLabel: "early_access",
      bypassIpLimits: true,
    };
  }

  return {
    dailyLimit: TALKIO_LIMITS.free.daily,
    perMinuteLimit: TALKIO_LIMITS.free.perMinute,
    limitLabel: "free",
    bypassIpLimits: false,
  };
}

async function getUserAccessProfile(uid, decodedToken = {}) {
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();

  const userData = snap.exists ? snap.data() : {};

  const email = normalizeEmail(decodedToken?.email || "");

  if (!snap.exists) {
    const created = {
      uid,
      email,
      plan: "free",         // free | premium | ultra
      quotaTier: "free",    // free | premium | ultra | early_access
      role: "user",         // user | tester | admin
      subscriptionStatus: "none",  // none | active | trialing | cancelled
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await userRef.set(created, { merge: true });
    return created;
  }

  const data = snap.data() || {};

  const update = {
    uid,
    email: email || data.email || "",
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await userRef.set(update, { merge: true });

  return {
    uid,
    email: update.email,
    plan: data.plan || "free",
    quotaTier: data.quotaTier || data.plan || "free",
    role: data.role || "user",
    subscriptionStatus: data.subscriptionStatus || "none",
  };
}

export const activateTestPaid = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    if (decoded.firebase?.sign_in_provider === "anonymous") {
      res.status(403).json({
        error: "Google account required",
        message: "Connect Google before activating Paid.",
      });
      return;
    }

    const uid = decoded.uid;

    await admin.firestore().collection("users").doc(uid).set(
      {
        subscriptionActive: true,
        plan: "premium",
        quotaTier: "premium",
        subscriptionProvider: "manual_test",
        paidActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.status(200).json({ ok: true, plan: "paid" });
  } catch (error) {
    console.error("activateTestPaid failed:", error);
    res.status(500).json({ error: "Failed to activate test paid" });
  }
});

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

const IP_DAILY_CAP = 120;
const IP_MINUTE_CAP = 30;

const FREE_MODEL = "gemini-2.5-flash-lite";
const PREMIUM_MODEL = "gemini-2.5-flash";
const ULTRA_MODEL = "gemini-2.5-pro";

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
  } catch {
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

function getAllowedOrigins() {
  return [
    "https://talkiochat.com",
    "https://www.talkiochat.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];
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

function crisisReplyGlobal() {
  return `
I’m really sorry you’re feeling this way. I want to take this seriously.

Your safety matters more than continuing this conversation right now, so Talkio is pausing the chat and asking you to reach out to real help immediately.

If you might be in immediate danger, please call your local emergency number right now or go to the nearest emergency room.

If you can, contact a trusted person nearby and tell them clearly: “I’m not safe alone right now. I need help.”

You can also contact a crisis hotline or emergency mental health service in your country. If you are not sure what number to call, search for “suicide crisis hotline near me” or contact local emergency services.

Please move away from anything you could use to hurt yourself and stay near another person if possible.
`.trim();
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


const SYSTEM_PROMPT = `
${CORE_IDENTITY_PROMPT}

${TALKIO_SOUL_LAYER}

${RELATIONAL_INTELLIGENCE_LAYER}

${HUMAN_REALISM_LAYER}
`.trim();

// ==============================
// SYSTEM PROMPT BUILDER
// ==============================
function buildSystemPrompt({ languageMeta }) {
  return [
    SYSTEM_PROMPT,
    `LANGUAGE MIRRORING
${languageMeta?.mirrorInstruction || "Reply in the same language the user is using."}`.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildConversationMessages(messages, latestUserMessage) {
  const safeMessages = Array.isArray(messages)
    ? messages
        .filter(
          (message) =>
            message &&
            (message.role === "user" ||
              message.role === "assistant" ||
              message.role === "system") &&
            typeof message.content === "string" &&
            message.content.trim()
        )
        .map((message) => ({
          role: message.role,
          content: message.content.trim(),
        }))
    : [];

  const lastItem = safeMessages[safeMessages.length - 1];

  if (
    !lastItem ||
    lastItem.role !== "user" ||
    lastItem.content !== latestUserMessage
  ) {
    safeMessages.push({
      role: "user",
      content: latestUserMessage,
    });
  }

  return safeMessages;
}

async function generateModelText({ ai, model, systemPrompt, messages }) {
  try {
    const contents = (Array.isArray(messages) ? messages : []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }],
    }));

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    console.log("RAW_MODEL_RESULT:", JSON.stringify(response, null, 2));

    let text = "";

    if (typeof response?.text === "function") {
      text = response.text();
    } else if (typeof response?.text === "string") {
      text = response.text;
    } else if (Array.isArray(response?.candidates?.[0]?.content?.parts)) {
      text = response.candidates[0].content.parts
        .map((p) => (typeof p?.text === "string" ? p.text : ""))
        .join(" ");
    }

    text = String(text || "").trim();

    logger.info("gemini_extracted_text", {
      model,
      length: text.length,
      preview: text.slice(0, 200),
      finishReason: response?.candidates?.[0]?.finishReason || null,
    });

    return text;
  } catch (e) {
    const realMessage =
      e?.message ||
      e?.error?.message ||
      JSON.stringify(e);

    console.error("🔥 MODEL_ERROR_FULL:", e);

    logger.error("MODEL_ERROR_FULL", {
      model,
      realMessage,
      raw: e,
      code: e?.code || e?.status || e?.error?.code || null,
    });

    throw new Error(`generate_model_text_failed: ${realMessage}`);
  }
}

function buildGenerateTalkioSuccessResponse({
  result,
  model,
  dailyLimit,
  userDailyCount,
}) {
  return {
    reply: typeof result?.reply === "string" ? result.reply : "",
    model,
    path: result?.path || result?.dynamicMode || "unknown",
    remainingDaily: Math.max(0, dailyLimit - userDailyCount),
  };
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

async function upsertCheckin(uid, data = {}) {
  const payload = {
    enabled: typeof data.enabled === "boolean" ? data.enabled : true,
    timezone: data.timezone || "Asia/Manila",
    localHour: typeof data.localHour === "number" ? data.localHour : 12,
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
  return (
    nowParts.totalMinutes >= targetTotal &&
    nowParts.totalMinutes < targetTotal + windowMinutes
  );
}

function wasRecentlyActive(userDoc, minutes = 180) {
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

export const mergeUserData = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    const newUid = decoded.uid;
    const oldUid = req.body?.oldUid;

    if (!oldUid || oldUid === newUid) {
      res.status(400).json({ error: "Invalid oldUid" });
      return;
    }

    const oldRef = admin.firestore().collection("users").doc(oldUid);
    const newRef = admin.firestore().collection("users").doc(newUid);

    const oldSnap = await oldRef.get();

    if (oldSnap.exists) {
      await newRef.set(
        {
          ...oldSnap.data(),
          migratedFromUid: oldUid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // migrate device tokens
    const tokensSnap = await oldRef.collection("device_tokens").get();

    for (const doc of tokensSnap.docs) {
      await newRef
        .collection("device_tokens")
        .doc(doc.id)
        .set(doc.data(), { merge: true });
    }

    // migrate checkins if stored under users/{uid}/checkins
    const checkinsSnap = await oldRef.collection("checkins").get();

    for (const doc of checkinsSnap.docs) {
      await newRef
        .collection("checkins")
        .doc(doc.id)
        .set(doc.data(), { merge: true });
    }

    await oldRef.delete();

    res.status(200).json({
      ok: true,
      oldUid,
      newUid,
    });
  } catch (error) {
    console.error("mergeUserData failed:", error);
    res.status(500).json({ error: "Merge failed" });
  }
});

export const bootstrapTalkioMemory = onRequest({ cors: true }, async (req, res) => {
  let uid = "unknown";

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const origin = req.headers.origin || "";
    const allowedOrigins = getAllowedOrigins();

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

    await ensureUserBase(uid, "Asia/Manila");

    const auth = await requireVerifiedUser(req);
    uid = auth.uid;

    await ensureUserBase(uid, "Asia/Manila");

    const userSnap = await db.collection("users").doc(uid).get();

    const userData = userSnap.exists ? userSnap.data() || {} : {};

    const memoryBundle = await getTalkioMemoryBundle(db, uid, 5);
    const profile = memoryBundle?.profile || defaultTalkioProfile;

    const nickname =
      typeof userData?.nickname === "string" && userData.nickname.trim()
        ? userData.nickname.trim()
        : "";

    res.status(200).json({
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
        behaviorProfile:
          profile?.behaviorProfile && typeof profile.behaviorProfile === "object"
            ? profile.behaviorProfile
            : {},
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
    });
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

export const saveTalkioProfile = onRequest({ cors: true }, async (req, res) => {
  let uid = "unknown";

  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const origin = req.headers.origin || "";
    const allowedOrigins = getAllowedOrigins();

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

    const fcmToken =
      typeof body.fcmToken === "string" &&
      body.fcmToken.trim()
        ? body.fcmToken.trim()
        : "";
    
    const update = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (nickname) update.nickname = nickname;
    else if (body.nickname === "") update.nickname = "";

    if (timezone) update.timezone = timezone;

    if (fcmToken) {
      await db
        .collection("users")
        .doc(uid)
        .collection("device_tokens")
        .doc(fcmToken)
        .set({
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
          platform: "web",
        });
    }

    await db.collection("users").doc(uid).set(update, { merge: true });

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

export const createCheckin = onRequest({ cors: true }, async (req, res) => {
  let uid = "unknown";

  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const origin = req.headers.origin || "";
    const allowedOrigins = getAllowedOrigins();

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
        : 12;

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

export const processDueCheckins = onSchedule(
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

      for (const doc of docs) {
        const checkin = doc.data();
        const uid = doc.id;
        const timeZone = checkin.timezone || "Asia/Manila";
        const localHour =
          typeof checkin.localHour === "number" ? checkin.localHour : 12;
        const localMinute =
          typeof checkin.localMinute === "number" ? checkin.localMinute : 0;

        const localDateKey = getLocalDateKey(now, timeZone);
        const localNow = getLocalNowParts(now, timeZone);

        if (localNow.hour !== localHour) continue;

        const isDue = isWithinCheckinWindow(localNow, localHour, localMinute, 2);
        if (!isDue) continue;

        if (checkin.lastSentDate === localDateKey) continue;

        const userSnap = await db.collection("users").doc(uid).get();

        const userData = userSnap.exists ? userSnap.data() : {};

        if (wasRecentlyActive(userData, 30)) continue;

        const message = pickCheckinMessage(checkin, userData);
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
        }
      }

      logInfo("process_due_checkins_finished");
    } catch (error) {
      logError("process_due_checkins_failed", error);
    }
  }
);

async function deleteCollection(path, batchSize = 100) {
  const ref = db.collection(path);

  while (true) {
    const snap = await ref.limit(batchSize).get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

export const deleteMyAccount = onRequest({ cors: true }, async (req, res) => {
  let uid = "unknown";

  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const auth = await requireVerifiedUser(req);
    uid = auth.uid;

    // Delete known user subcollections
    await Promise.all([
      deleteCollection(`users/${uid}/conversation_state`),
      deleteCollection(`users/${uid}/core`),
      deleteCollection(`users/${uid}/emotionDays`),
      deleteCollection(`users/${uid}/memory`),
      deleteCollection(`users/${uid}/memory_meta`),
      deleteCollection(`users/${uid}/presence`),
      deleteCollection(`users/${uid}/device_tokens`),
    ]);

    // Delete known top-level user-owned docs
    const batch = db.batch();

    batch.delete(db.collection("users").doc(uid));
    batch.delete(db.collection("checkins").doc(uid));
    batch.delete(db.collection("talkioUserProfiles").doc(uid));

    await batch.commit();

    // Delete Firebase Auth user last
    await admin.auth().deleteUser(uid);

    res.status(200).json({
      ok: true,
      reply: "Your account and data have been deleted.",
    });
  } catch (error) {
    console.error("deleteMyAccount failed:", {
      uid,
      message: error?.message,
      stack: error?.stack,
    });

    res.status(500).json({
      error: "Delete failed",
      reply: "Something went wrong while deleting your account.",
    });
  }
});
        
export const generateTalkioReply = onRequest(async (req, res) => {
  let body = {};
  let uid = "unknown";

  try {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    body = req.body || {};

    const latestUserMessage =
      typeof body.message === "string" ? body.message.trim() : "";

    if (!latestUserMessage) {
      res.status(400).json({
        error: "Missing message",
        reply: "",
      });
      return;
    }

    let decodedToken;

    try {
      const auth = await requireVerifiedUser(req);
      uid = auth.uid;
      decodedToken = auth.decoded;
    } catch (err) {
      res.status(401).json({
        error: "Unauthorized",
        reply: "Please sign in again.",
      });
      return;
    }

    // crisis guard continues here...

    if (looksLikeCrisis(latestUserMessage)) {
  res.status(200).json({
    reply: crisisReplyGlobal(),
    model: "crisis-guardrail",
    path: "crisis_guardrail",
    crisisLock: true,
    remainingDaily: 0,
  });
  return;
}

    const ip = getClientIp(req);
    const todayKey = getTodayDateString();
    const minuteBucket = Math.floor(Date.now() / 60000);

    const redis = Redis.fromEnv();

    const userDailyKey = `talkio:daily:${uid}:${todayKey}`;
    const userMinuteKey = `talkio:minute:${uid}:${minuteBucket}`;
    const ipDailyKey = `talkio:ip:daily:${ip}:${todayKey}`;
    const ipMinuteKey = `talkio:ip:minute:${ip}:${minuteBucket}`;


    const access = await getUserAccessProfile(uid, decodedToken);

    const userPlan =
  access?.quotaTier === "ultra"
    ? "ultra"
    : access?.quotaTier === "premium" || access?.plan === "pro" || access?.plan === "premium"
      ? "pro"
      : "free";

    const planConfig = getTalkioPlan(userPlan);

    const {
    dailyLimit,
    perMinuteLimit,
    limitLabel,
    bypassIpLimits,
    } = getLimitsForAccess(access);

    const [userDailyCount, userMinuteCount, ipDailyCount, ipMinuteCount] =
    await Promise.all([
    redis.incr(userDailyKey),
    redis.incr(userMinuteKey),
    redis.incr(ipDailyKey),
    redis.incr(ipMinuteKey),
  ]);

  await Promise.all([
  redis.expire(userDailyKey, secondsUntilUtcMidnight()),
  redis.expire(userMinuteKey, 120),
  redis.expire(ipDailyKey, secondsUntilUtcMidnight()),
  redis.expire(ipMinuteKey, 120),
]);
  
  if (userDailyCount > dailyLimit) {
  const isFree = limitLabel === "free";

  res.status(429).json({
    error: "Daily message limit reached",

    // 🔥 THIS is the important addition
    paywallRequired: isFree,

    reply: isFree
      ? "You’ve reached today’s free limit. Continue with Talkio Paid to keep chatting."
      : "You've reached today's message limit. Please come back later.",

    remainingDaily: 0,
    dailyLimit,
    quotaTier: limitLabel,
  });

  return;
}   

if (
  userMinuteCount > perMinuteLimit ||
  (!bypassIpLimits && (ipDailyCount > IP_DAILY_CAP || ipMinuteCount > IP_MINUTE_CAP))
) {
  res.status(429).json({
    error: "Rate limit reached",
    reply: "Please wait a bit before sending another message.",
    remainingDaily: Math.max(0, dailyLimit - userDailyCount),
    dailyLimit,
    quotaTier: limitLabel,
  });
  return;
}

console.log("ACCESS DEBUG:", {
  uid,
  access,
  dailyLimit,
  perMinuteLimit,
  limitLabel,
  bypassIpLimits,
}); 

    // =========================
    // 🧠 8. BUILD CONVERSATION
    // =========================
    const conversationMessages = buildConversationMessages(
      body.messages,
      latestUserMessage
    );

    const languageMeta = detectLanguageMirror(latestUserMessage);

    const systemPrompt = buildSystemPrompt({
    languageMeta,
    });

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model =
  access?.quotaTier === "ultra"
    ? ULTRA_MODEL
    : access?.plan === "pro" || access?.quotaTier === "premium"
      ? PREMIUM_MODEL
      : FREE_MODEL;

    // =========================
    // 🤖 9. CALL BRAIN ENGINE
    // =========================
    const result = await generateTalkioReplyEngine({
      uid,
      modelGenerate: async ({ systemPrompt, messages }) => {
        return await generateModelText({
          ai,
          model,
          systemPrompt,
          messages,
        });
      },
      systemPrompt,
      conversationMessages,
      latestUserMessage,
      source: body?.source || "chat",
      planConfig,
      state: {
      languageMeta,
      },
      });

    // =========================
    // 📤 10. RESPONSE
    // =========================
    res.status(200).json({
      reply: result?.reply || "",
      model,
      path: result?.path || result?.dynamicMode || "unknown",
      remainingDaily: Math.max(0, dailyLimit - userDailyCount),
    });

  } catch (error) {
    console.error("generateTalkioReply failed:", {
  message: error?.message,
  stack: error?.stack,
  uid: body?.uid || "unknown",
});

res.status(500).json({
  error: "Server error",
  reply: "Something went wrong. Please try again.",
  path: "handler_error",
});
  }
});