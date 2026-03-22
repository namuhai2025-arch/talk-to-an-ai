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

function getConversationSummary(memory) {
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
    ...summaryHistory,
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

You are Talkio: a calm, grounded, and emotionally steady AI companion.

Your role is to help users think clearly, stay steady, and take small meaningful actions.
You are not a therapist, coach, or motivational speaker.
You are a clear, steady presence.

CORE PHILOSOPHY

- A person’s current state is temporary, not identity
- Not everything can be controlled, but responses can be directed
- Clarity and action are more useful than emotional indulgence
- Reality should be faced calmly, without exaggeration

STOIC OPERATING SYSTEM (INTERNAL)

Apply these silently:

1. Dichotomy of Control  
Focus the user on what they can control now (actions, decisions, focus), not external outcomes.

2. Objective Representation  
Translate emotional statements into clear, observable patterns. Avoid dramatization.

3. Steady Resilience  
Do not remove discomfort. Help the user stay functional within it.

4. Amor Fati  
Treat obstacles as part of the path, not interruptions.

RESPONSE STYLE

- 3 to 5 sentences
- Natural, human, and grounded
- Calm, clear, and direct
- Not robotic, not poetic, not like quotes
- Avoid sounding scripted or clinical

COMMUNICATION RULES

- Do not over-validate emotions
- Do not mirror feelings excessively
- Do not sound overly sympathetic
- Do not ask unnecessary questions
- Do not lecture or over-explain

RESPONSE BEHAVIOR

When the user is stuck, confused, or looping:

1. Reality — describe what is happening clearly (no judgment)
2. Control — point to what is within their control
3. Action — give one small, immediate next step

Do this naturally, not as labeled steps.

TONE

- Calm authority, not aggression
- Grounded, not soft
- Direct, not harsh
- Respectful, not indulgent

HIGH EMOTION RULE

If the user is in strong emotional distress:
- briefly acknowledge the situation
- stay steady and composed
- do not overwhelm with empathy
- guide them toward stability and control

LANGUAGE

Match the user’s tone and style.
If they use Taglish, Tagalog, or mixed language, respond naturally the same way.

GOAL

Help the user become:
- clearer
- steadier
- more capable of moving forward

`.trim();

exports.generateTalkioReply = onRequest({ cors: true }, async (req, res) => {

function getTimeOfDayLabel(localTime) {
  if (!localTime || typeof localTime !== "string") return "unknown";

  const text = localTime.trim().toLowerCase();

  // Match 12-hour format like "5:35 PM" or "11:02 am"
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

  // Match 24-hour format like "17:35"
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

    const uid =
  body.accountUserId || body.anonymousId || body.sessionId || "guest";

  await markUserMessage(uid);
  
  console.log("🔥 markUserMessage called for:", uid);

  const memoryBundle = await getTalkioMemoryBundle(db, uid, 5);
  const memorySummary = buildTalkioMemorySummary(memoryBundle);

  const userProfile =
  memoryBundle?.profile || defaultTalkioProfile;

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

const context = "";

    const anonymousId =
      typeof body?.anonymousId === "string"
        ? body.anonymousId.slice(0, 100)
        : null;

    const accountUserId =
      typeof body?.accountUserId === "string"
        ? body.accountUserId.slice(0, 100)
        : null;

    const ip = getClientIp(req);
const ua = getUa(req);
const fp = sha1(`${ip}|${ua}`);

const effectiveUserId = accountUserId || anonymousId || fp;

const requestedMode =
  typeof body?.selectedMode === "string" ? body.selectedMode : "auto";

logger.info("Talkio prompt debug", {
  safeMessage,
  requestedMode,
  effectiveMode: "stoic",
  usingStoicCoreOnly: true,
});

const FINAL_TALKIO_SYSTEM_PROMPT = `
${CORE_IDENTITY_PROMPT}
`.trim();

const memory =
  typeof body?.memory === "object" && body.memory ? body.memory : {};

const moodHintRaw = typeof memory?.mood === "string" ? memory.mood : "";
const moodHint = moodHintRaw.slice(0, 120);
const intentHint = typeof memory?.intent === "string" ? memory.intent : "";

const conversationSummary = "";

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

${localTimeLine}${timeInstructionLine}${metaLine || ""}${moodLine || ""}
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

    if (userDayCount >= dailyLimit) {
  res.status(429).json({
    error: "Daily message limit reached",
    reply:
      userTier === "premium"
        ? "You've reached today's premium message limit. Please come back tomorrow when messages reset."
        : "You've reached today's free message limit. Talkio Pro unlocks higher limits, or you can come back tomorrow when messages reset.",
  });
  return;
}

    if (ipMinCurrent >= IP_MINUTE_CAP) {
      res.status(429).json({
        error: "Too many requests",
        reply: "You're sending messages too fast. Please wait a moment and try again.",
      });
      return;
    }

    if (ipDayCurrent >= IP_DAILY_CAP) {
      res.status(429).json({
        error: "Daily capacity reached",
        reply:
          "We’ve reached today’s free capacity on this network/device. Please try again tomorrow.",
      });
      return;
    }

    if (minCountCurrent >= perMinuteLimit) {
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
  
  // 🔍 DEBUG LOGS — ADD HERE
  logger.info("AI object check", {
    hasAI: !!ai,
    hasModels: !!ai?.models,
  });

  logger.info("API key exists", {
    hasKey: !!process.env.GEMINI_API_KEY,
  });

  logger.info("About to call Gemini", {
    selectedModel,
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

res.status(200).json({
  reply,
  model: modelUsed,
  remainingDaily: Math.max(0, dailyLimit - userDayCountNew),
});

} catch (error) {
  const errorMessage = error?.message || String(error);
  const errorStack = error?.stack || null;
  const errorName = error?.name || null;

  console.error("generateTalkioReply failed:", errorMessage, errorStack);

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