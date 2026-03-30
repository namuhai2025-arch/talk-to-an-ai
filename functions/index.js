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
You can sense right timing to apply stoic core.

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

exports.createCheckin = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = req.body || {};
    
    const uid = typeof body.userId === "string" ? body.userId.trim() : "";

if (!uid) {
  res.status(400).json({
    error: "Missing userId",
    reply: "User identity is required.",
  });
  return;
}

    await upsertCheckin(uid, {
      timezone: body.timezone || "Asia/Manila",
      localHour:
        typeof body.localHour === "number" ? body.localHour : 19,
      localMinute:
        typeof body.localMinute === "number" ? body.localMinute : 0,
      message:
        typeof body.message === "string" && body.message.trim()
          ? body.message.trim()
          : "Hey… just checking in. How are you feeling today?",
    });

    logInfo("checkin_created", { uid });

    res.status(200).json({
      ok: true,
      reply: "Check-in created.",
    });
  } catch (error) {
    logError("create_checkin_failed", error);
    res.status(500).json({
      error: "Failed to create check-in",
      details: error?.message || String(error),
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

exports.generateTalkioReply = onRequest({ cors: true }, async (req, res) => {
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

    const body = req.body || {};

    const uid = typeof body.userId === "string" ? body.userId.trim() : "";

if (!uid) {
  res.status(400).json({
    error: "Missing userId",
    reply: "User identity is required.",
  });
  return;
}

    logInfo("request_received", {
      hasMessage: !!body?.message,
      hasHistory: Array.isArray(body?.history),
      userTier: body?.userTier || "free",
      
    });

    const localTime =
      typeof body?.localTime === "string" ? body.localTime : "";

    const localDate =
      typeof body?.localDate === "string" ? body.localDate : "";

    const localWeekday =
      typeof body?.localWeekday === "string" ? body.localWeekday : "";

    const timeZone =
      typeof body?.timeZone === "string" ? body.timeZone : "";

    const localHour =
      typeof body?.localHour === "number" ? body.localHour : null;

    const userTier = getUserTier(body);
    const { dailyLimit, perMinuteLimit } = getLimitsForTier(userTier);

    const message =
      typeof body?.message === "string" ? body.message.trim() : "";

    const memoryCommand = detectMemoryCommand(message);
    const reminderCommand = detectReminderCommand(message);

    if (!message) {
      res
        .status(400)
        .json({ error: "Invalid message", reply: "Please type a message." });
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

    logInfo("resolved_uid_for_chat", {
      uid,      
    });

    await markUserMessage(uid);
    await updateSmartCheckinState(uid, message);

    logInfo("user_message_received", {
      uid,
      preview: message.slice(0, 100),
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

    const styleProfileBlock = buildStyleProfileBlock({
      ...currentUserProfile,
      styleProfile: updatedStyleProfile,
      styleSignals: updatedSignals,
    });

    const ai = new GoogleGenAI({ apiKey });

    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
      res.status(500).json({
        error: "Missing Redis environment variables",
        reply: "Server is missing Redis configuration.",
      });
      return;
    }

    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    const safeMessage = message.slice(0, 1200);

    if (looksLikeCrisis(safeMessage)) {
      res.status(200).json({ reply: crisisReplyPH(), flagged: "crisis" });
      return;
    }

    const history = Array.isArray(body?.history) ? body.history : [];

    const recentHistory = history
      .filter(
        (m) =>
          m &&
          m.role === "user" &&
          typeof m.content === "string"
      )
      .slice(-MAX_CONTEXT_MESSAGES);

    const context = formatMessagesForPrompt(recentHistory);
    
    const ip = getClientIp(req);
    const ua = getUa(req);
    const fp = sha1(`${ip}|${ua}`);

    const effectiveUserId = uid;

    const requestedMode =
      typeof body?.selectedMode === "string" ? body.selectedMode : "auto";

    logger.info("Talkio prompt debug", {
      safeMessage,
      requestedMode,
      effectiveMode: "stoic",
      usingStoicCoreOnly: true,
    });

    await ensureUserBase(uid, "Asia/Manila");

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
          reply = "I can set that reminder, but I need the date. Try saying something like: remind me tomorrow at 7am to drink bone broth.";
        } else if (reminderCommand.reason === "missing_time") {
          reply = "I can set that reminder, but I need the time. Try saying something like: remind me tomorrow at 7am to drink bone broth.";
        }

        res.status(200).json({ reply });
        return;
      }

      await createReminder(uid, {
        text: reminderCommand.text,
        category: reminderCommand.category,
        scheduledAt: admin.firestore.Timestamp.fromDate(reminderCommand.scheduledAt),
        timezone: timeZone || "Asia/Manila",
        repeat: reminderCommand.repeat,
        sourceMessage: reminderCommand.sourceMessage,
      });

      const whenText = new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timeZone || "Asia/Manila",
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

    const memory =
      typeof body?.memory === "object" && body.memory ? body.memory : {};

    const moodHintRaw = typeof memory?.mood === "string" ? memory.mood : "";
    const moodHint = moodHintRaw.slice(0, 120);
    const intentHint = typeof memory?.intent === "string" ? memory.intent : "";

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
          userTier === "premium"
            ? "You've reached today's premium message limit. Please come back tomorrow when messages reset."
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

    const selectedModel = pickModel(body);

    let reply = "";
    let modelUsed = selectedModel;

    try {
      logger.info("AI object check", {
        hasAI: !!ai,
        hasModels: !!ai?.models,
      });

      logger.info("API key exists", {
        hasKey: !!process.env.GEMINI_API_KEY,
      });

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

      if (errorText.includes('"code":429') || errorText.includes("RESOURCE_EXHAUSTED")) {
        res.status(429).json({
          error: "AI quota reached",
          reply: "Talkio is a bit busy right now. Please wait a little and try again.",
        });
        return;
      }

      try {
        const fallbackModel =
          selectedModel === FREE_MODEL
            ? FREE_MODEL
            : selectedModel === PREMIUM_MODEL
              ? PREMIUM_MODEL
              : ULTRA_MODEL;

        logger.warn("Trying fallback Gemini model", {
          fallbackModel,
          usingStoicCoreOnly: true,
        });

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
      const candidates = extractMemoryCandidates(message);

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
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || null;
    const errorName = error?.name || null;

    logError("generate_reply_failed", error, {
      uid: "unknown",
    });

    logger.error("generateTalkioReply failed", {
      message: errorMessage,
      stack: errorStack,
      name: errorName,
    });

    res.status(500).json({
      error: "Server error",
      reply: "Something went wrong on my end. Please try again.",
      details: errorMessage,
    });
  }
});

exports.testPush = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = req.body || {};

    const uid = typeof body.userId === "string" ? body.userId.trim() : "";

if (!uid) {
  res.status(400).json({
    error: "Missing userId",
    reply: "User identity is required.",
  });
  return;
}

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
    logError("test_push_failed", error);
    res.status(500).json({
      error: "Failed to send test push",
      details: error?.message || String(error),
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