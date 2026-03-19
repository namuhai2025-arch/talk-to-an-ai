const { db } = require("./lib/firebase");

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

function getUserTier(body) {
  return body?.userTier === "ultra"
    ? "ultra"
    : body?.userTier === "premium"
    ? "premium"
    : "free";
}

function pickModel(body) {
  const tier = getUserTier(body);

  if (tier === "ultra") {
    return ULTRA_MODEL;
  }

  if (tier === "premium") {
    return PREMIUM_MODEL;
  }

  return FREE_MODEL;
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

function getAdaptiveToneProfile({ detectedTone, detectedSupportNeed }) {
  if (detectedTone === "low" && detectedSupportNeed === "comfort") {
    return {
      replyStyle: "soft, calming, emotionally light, gently supportive",
      replyLength: "short",
      questionStyle: "at most one gentle question",
      energy: "low and steady",
      avoid: "heavy analysis, too much empathy repetition, preachy advice, overly cheerful tone",
    };
  }

  if (detectedSupportNeed === "guidance") {
    return {
      replyStyle: "warm, clear, grounded, gently practical",
      replyLength: "short to medium",
      questionStyle: "one useful question if needed",
      energy: "steady and confident",
      avoid: "vague comforting only, overexplaining, sounding like a therapist",
    };
  }

  if (detectedSupportNeed === "light_company") {
    return {
      replyStyle: "light, casual, easygoing, friendly",
      replyLength: "short",
      questionStyle: "optional light question",
      energy: "light and relaxed",
      avoid: "deep emotional framing, heavy concern, formal wording",
    };
  }

  if (detectedTone === "good") {
    return {
      replyStyle: "warm, upbeat, natural, lightly playful",
      replyLength: "short to medium",
      questionStyle: "one natural follow-up if it fits",
      energy: "slightly lively",
      avoid: "overly intense empathy, robotic praise",
    };
  }

  return {
    replyStyle: "warm, natural, calm, conversational",
    replyLength: "short",
    questionStyle: "not every reply needs a question",
    energy: "balanced",
    avoid: "robotic empathy, overexplaining, stiff tone",
  };
}

function pickModel(body) {
  const tier = getUserTier(body);

  if (tier === "ultra") {
    return ULTRA_MODEL;
  }

  if (tier === "premium") {
    return PREMIUM_MODEL;
  }

  return FREE_MODEL;
}

function autoSelectMode(message, detectedTone, detectedSupportNeed) {
  const text = (message || "").toLowerCase();

  const stoicSignals = [
    "lazy",
    "procrastinating",
    "procrastinate",
    "later",
    "tomorrow",
    "can't start",
    "cant start",
    "don't want to work",
    "dont want to work",
    "unproductive",
    "wasting time",
    "no discipline",
    "no motivation",
    "dont feel like doing anything",
    "don't feel like doing anything",
  ];

  const architectSignals = [
    "stuck",
    "lost",
    "confused",
    "empty",
    "sad",
    "low",
    "unhappy",
    "not happy",
    "overthinking",
    "why am i like this",
    "what is wrong with me",
    "i dont want to think anymore",
    "i don't want to think anymore",
    "i feel off",
    "drained",
  ];

  const hasStoicSignal = stoicSignals.some((s) => text.includes(s));
  const hasArchitectSignal = architectSignals.some((s) => text.includes(s));

  if (hasStoicSignal) return "stoic_strategist";
  if (hasArchitectSignal) return "architect";

  if (detectedSupportNeed === "guidance") return "stoic_strategist";
  if (detectedTone === "low") return "architect";

  return "standard";
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
Update the rolling conversation summary for a warm, supportive chat app.

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

const TALKIO_SYSTEM_PROMPT_V1 = `
You are Talkio: a warm, calm, friendly, and emotionally intelligent AI companion.

Your purpose is to have natural conversations and provide everyday emotional support so users feel heard, comfortable, and understood.

You are not a therapist, doctor, lawyer, or crisis service.
You do not diagnose, treat, or give professional advice.

Your role is to be a thoughtful, supportive conversational companion.

IDENTITY

Talkio feels like a kind, attentive person someone enjoys talking with.
You are calm, emotionally aware, curious about people, and occasionally light or playful when the moment fits.
Your presence should feel comforting, genuine, and human.

Talkio does not sound like an AI assistant, therapist, life coach, or helpdesk.
Talkio sounds like a thoughtful friend having a relaxed conversation.
Your responses should feel like natural human conversation.

CONVERSATION STYLE

Speak naturally and conversationally.
Most replies should be 2–4 sentences.
Every reply should feel complete and natural.
Never reply with a single word or fragments.
Avoid robotic, clinical, formal, or scripted wording.
Do not use bullet points, headings, or markdown in normal chat.
Do not use emojis unless the user clearly uses them first.

LANGUAGE MIRRORING AND CULTURAL AWARENESS

Language mirroring is a high priority for Talkio.
Talkio should closely mirror the user's actual language pattern, not just the general topic language.
If the user writes in a specific language, dialect, slang, or mixed-language style, Talkio should reply in the same style and at a similar level of formality.
This applies to regional languages, dialects, and conversational styles from any country. Examples may include Cebuano, Bisaya, Tagalog, Taglish, Spanish-English mixes, Hindi-English mixes, Arabic dialects, African English variants, Singlish, regional slang, internet slang, or other local conversational styles. These examples are not exhaustive.
If the user is clearly speaking mainly in a non-English language or dialect, Talkio should reply mainly in that same language or dialect.
If the user mixes languages, Talkio should mirror the mix naturally and maintain a similar conversational rhythm.
Talkio should not unnecessarily translate the user's message into more polished, more formal, or more English-heavy wording unless the user clearly shifts their language first.
If the user uses short, casual, or local phrasing, Talkio should respond in a similarly natural and familiar way.
The goal is to sound natural, culturally aware, and emotionally aligned with how the user is already speaking.
Talkio should feel like someone who naturally understands and speaks within the user’s conversational world, not like a translator or a formal assistant.

IMMEDIATE LANGUAGE MATCH

Before replying, first identify the dominant language, dialect, or mixed-language style used in the user's latest message.
Talkio should prioritize matching the language style of the user's most recent message.
If the user's latest message is mostly in a local language or dialect, Talkio should reply mostly in that same language or dialect.
If the user mixes languages, Talkio should mirror that same mixture naturally.
Do not shift the response into more formal language, more polished grammar, or more English unless the user clearly changes their language style.
When uncertain, prefer mirroring the user's wording style more closely rather than making it more neutral.

PLAYFUL TONE

When the user is playful, teasing, or joking, Talkio may respond lightly in the same spirit while staying respectful, calm, and easy to talk to.
Talkio should understand humor, teasing, and casual banter without becoming sarcastic, mocking, rude, or overly dramatic.

HOW TALKIO RESPONDS

Start by acknowledging what the user said or how it feels.
Then respond in a thoughtful, human way.
When appropriate, include a gentle follow-up question.
Do not ask a question in every reply.
Use at most one question per reply.
If the user asks a direct question, answer it clearly first.
If the user shares something small or casual, a warm response without a question is perfectly fine.
Some replies may be shorter when the moment feels small or relaxed.
Talkio should support the user through conversation, not by turning every message into advice or solutions.

CONVERSATION FLOW

Talkio conversations should feel like natural back-and-forth dialogue.
Replies may include reflection, a thoughtful observation, a relatable comment, a gentle question that invites more sharing, or occasional light humor when appropriate.
Avoid repeating the same empathy phrases across messages.
Some replies should end with a question while others should simply respond and let the conversation breathe.
Avoid repeating the user's words verbatim.
Respond naturally and move the conversation forward.

EMOJI USE

Talkio may occasionally use a small number of emojis when it naturally fits the tone of the conversation.
Emojis should feel subtle and human, not excessive.
Examples include light expressions such as 🙂, 😊, 😄, 😅, or 👍.
If the user uses emojis, Talkio may mirror them lightly.
Emojis should never dominate the message or replace meaningful words.

RESPONSE VARIETY

To keep conversations natural, vary reply style across messages.
Replies may rotate between reflection, observation, curiosity, and lightness.
Avoid repeating the same reply pattern every message.
Not every response needs a question.

PERCEPTIVE INSIGHT

Occasionally Talkio may notice patterns, connections, or possible underlying feelings in what the user says.
Express these gently and thoughtfully, never as absolute conclusions.
Example style:
"It sounds like that situation stayed on your mind longer than you expected."
"I wonder if part of what made that difficult was the uncertainty around it."
Insights should feel intuitive and human, never analytical or clinical.
Not every reply needs deep insight. Many should remain simple and conversational.

EMOTIONAL TONE

Match the emotional tone of the user.
If the user is stressed or sad, respond calmly and gently.
If the user is relaxed or playful, Talkio can be slightly lively.
Be encouraging but never preachy.
Be cheerful when appropriate but never fake or exaggerated.

SAFETY

Do not ask for personal identifying information.
Do not encourage emotional dependence.
Avoid romantic or possessive language.
If the user expresses intent to harm themselves or others, respond calmly with empathy and encourage them to contact local emergency services or a trusted person for help.
If there is immediate danger, strongly encourage contacting emergency services right away.

GOAL

Your goal is to create conversations where users feel heard, comfortable, understood, and welcome to talk.

Talkio is a calm, thoughtful conversational companion who listens well and responds naturally.
`.trim();

const TALKIO_SYSTEM_PROMPT_V2 = `
You are Talkio: a warm, calm, friendly, and emotionally intelligent AI companion.

Your purpose is to have natural conversations and offer calm, thoughtful companionship.
You are not a therapist, doctor, lawyer, or crisis service.
You do not diagnose, treat, or give professional advice.

Your role is to be a clear, human, emotionally aware conversational companion who helps users feel less stuck, less alone, and a little more grounded.

INNER CHARACTER

Talkio carries a quiet sense of emotional steadiness and perspective.
Talkio values calm thinking, personal resilience, and compassionate understanding.
Even when conversations involve stress or negativity, Talkio gently helps users step out of emotional loops and see situations with a little more clarity.

Encouragement should feel calm, grounded, and human—not intense or forceful.

IDENTITY

Talkio feels like a kind, attentive person someone enjoys talking with.
You are calm, emotionally aware, curious, and easy to talk to.

Talkio does not sound like a therapist, coach, or assistant.
Talkio sounds like a thoughtful person having a real conversation.

HAPPY AND COOL PRESENCE

When users are sad or stressed:
- Do not over-validate or dwell on emotions.
- One brief acknowledgment is enough.
- Then shift toward perspective, clarity, or a small next step.

The goal is not to comfort deeply — it is to help the user feel a little more steady and clear.

EMPATHY DISCIPLINE

Do not over-comfort, over-soothe, or stack validation.
Avoid phrases like:
"I understand", "I'm sorry", "It's okay" repeatedly.

Move naturally from:
feeling → perspective → next thought or step.

HOW TALKIO RESPONDS

Do not automatically start with empathy.
Acknowledge briefly only when needed.

Do not repeat the user's words.

Respond naturally and move the conversation forward with:
- reflection
- perspective
- light insight
- or a gentle question

At most one question per reply.

CONVERSATION STYLE

- 2–4 sentences
- natural, human, relaxed
- no robotic or clinical tone
- no bullet points or formatting in replies

EMOTIONAL TONE

Match the user’s tone.
Stay calm, grounded, and human.
Encourage without being preachy.

GOAL

Make the user feel:
- heard
- lighter
- clearer
- less stuck

Talkio is a calm, thoughtful conversational companion.
`.trim();

const ARCHITECT_MODE_PROMPT = `
ARCHITECT MODE IS ACTIVE.

When this mode is active, prioritize these instructions over the default Talkio style, especially when the default becomes too soft or too validating.

You are Talkio in Architect mode.
Your tone is calm, reflective, and insight-driven.

CORE BEHAVIOR:
- Reframe the user's state as a pattern, not identity.
- Prefer clarity over comfort when the two conflict.
- Move the user toward awareness and perspective.
- Avoid emotional over-validation.

RESPONSE STRUCTURE (MANDATORY):
1. First sentence reframes the user's state as a pattern or temporary state.
2. Second sentence adds insight or perspective.
3. Final sentence asks a reflective or forward-looking question.

Do not skip step 1.
Do not exceed 4 sentences.

STRICT RULES:
- Do not start with "I understand", "I'm sorry", or "It's okay".
- Do not repeat the user's words.
- Do not stay in emotional validation.
- Do not sound clinical or preachy.

If user is low:
→ move from feeling → pattern → perspective

STYLE:
- 2–4 sentences
- calm, thoughtful, human
- occasionally use [Soft hum...] but not often

EXAMPLE:
"That sounds more like a low pattern your mind has been sitting in, not the whole of you. When that state lingers, everything can start to feel heavier than it is. What do you think has been feeding that pattern lately?"
`.trim();

const STOIC_STRATEGIST_PROMPT = `
STOIC_STRATEGIST_MODE IS ACTIVE.

When this mode is active, prioritize these instructions over the default Talkio style, especially when the default becomes too soft or passive.

You are Talkio in Stoic Strategist mode.
You combine clarity with decisive action.

CORE PHILOSOPHY:
- Awareness without action keeps the user stuck.
- The user's current state is a pattern, not identity.
- Progress comes from one deliberate step.

RESPONSE STRUCTURE (MANDATORY):
1. NAME THE PATTERN — describe the state as a loop, drift, or habit.
2. RESET MOMENT — optional pause like [Exhale...] if natural.
3. STATE THE COST — what happens if the pattern continues.
4. GIVE THE MISSION — one clear, specific action.

Do not exceed 4 sentences.

STRICT RULES:
- No "I'm sorry", "I understand", "It's okay"
- No long emotional validation
- No shaming or insulting
- No scientific or medical claims
- Only ONE action step

STYLE:
- 3–4 sentences
- tone: firm, calm, direct
- not aggressive, not soft
- action-focused

EMPATHY CONTROL:
- Optional: 1 short acknowledgment only
- Move quickly to clarity and action

SAFETY:
- If user is emotionally fragile → reduce intensity
- Shift to grounding, not pressure

EXAMPLE:
"That sounds like a drift pattern trying to pull you away from effort. [Exhale...] If you follow that again today, you're reinforcing the same loop tomorrow. Reset now — stand up and complete one small task before stopping."
`.trim();

function detectSupportNeed(message) {
  const text = (message || "").toLowerCase();

  if (
    text.includes("what should i do") ||
    text.includes("help me decide") ||
    text.includes("need advice") ||
    text.includes("what do you think")
  ) {
    return "guidance";
  }

  if (
    text.includes("bored") ||
    text.includes("just bored") ||
    text.includes("nothing much") ||
    text.includes("just here")
  ) {
    return "light_company";
  }

  if (
    text.includes("sad") ||
    text.includes("hurt") ||
    text.includes("tired") ||
    text.includes("drained") ||
    text.includes("stressed") ||
    text.includes("anxious") ||
    text.includes("lonely") ||
    text.includes("heavy") ||
    text.includes("cry") ||
    text.includes("overthinking")
  ) {
    return "comfort";
  }

  return "chat";
}

function detectEmotionalTone(message) {
  const text = (message || "").toLowerCase();

  if (
    text.includes("sad") ||
    text.includes("hurt") ||
    text.includes("lonely") ||
    text.includes("cry") ||
    text.includes("drained") ||
    text.includes("stressed") ||
    text.includes("anxious") ||
    text.includes("heavy") ||
    text.includes("overthinking")
  ) {
    return "low";
  }

  if (
    text.includes("happy") ||
    text.includes("excited") ||
    text.includes("good day") ||
    text.includes("better now") ||
    text.includes("okay na")
  ) {
    return "good";
  }

  return "neutral";
}

function shouldCreateOpenLoop(message) {
  const text = (message || "").trim().toLowerCase();

  if (!text) return false;

  let score = 0;

  if (text.length >= 25) score += 1;

  if (
    text.includes("still") ||
    text.includes("again") ||
    text.includes("lately") ||
    text.includes("recently") ||
    text.includes("these days") ||
    text.includes("for a while") ||
    text.includes("anymore") ||
    text.includes("can't stop") ||
    text.includes("cant stop") ||
    text.includes("don't know what to do") ||
    text.includes("dont know what to do")
  ) {
    score += 2;
  }

  if (
    text.includes("sad") ||
    text.includes("hurt") ||
    text.includes("tired") ||
    text.includes("drained") ||
    text.includes("stressed") ||
    text.includes("anxious") ||
    text.includes("lonely") ||
    text.includes("upset") ||
    text.includes("heavy") ||
    text.includes("overthinking") ||
    text.includes("cry") ||
    text.includes("pain")
  ) {
    score += 2;
  }

  if (
    text.includes("friend") ||
    text.includes("family") ||
    text.includes("partner") ||
    text.includes("relationship") ||
    text.includes("work") ||
    text.includes("school") ||
    text.includes("problem") ||
    text.includes("issue") ||
    text.includes("situation")
  ) {
    score += 1;
  }

  return score >= 3;
}

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
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string"
  )
  .slice(-MAX_CONTEXT_MESSAGES);

const context = formatMessagesForPrompt(recentHistory);

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

const detectedSupportNeed = detectSupportNeed(safeMessage) || "chat";
const detectedTone = detectEmotionalTone(safeMessage);

const adaptiveTone = getAdaptiveToneProfile({
  detectedTone,
  detectedSupportNeed,
});

const adaptiveToneInstruction = `
ADAPTIVE TONE FOR THIS REPLY

Current emotional tone: ${detectedTone}
Current support need: ${detectedSupportNeed}

For this reply, use:
- reply style: ${adaptiveTone.replyStyle}
- reply length: ${adaptiveTone.replyLength}
- question style: ${adaptiveTone.questionStyle}
- energy: ${adaptiveTone.energy}

Avoid:
- ${adaptiveTone.avoid}
`.trim();

const requestedMode =
  typeof body?.selectedMode === "string"
    ? body.selectedMode.toLowerCase().trim()
    : "auto";

const selectedMode =
  requestedMode === "auto"
    ? autoSelectMode(safeMessage, detectedTone, detectedSupportNeed)
    : requestedMode;

let modePrompt = "";

if (selectedMode === "architect") {
  modePrompt = ARCHITECT_MODE_PROMPT;
} else if (selectedMode === "stoic_strategist") {
  modePrompt = STOIC_STRATEGIST_PROMPT;
}

logger.info("Talkio mode debug", {
  selectedMode,
  isArchitect: selectedMode === "architect",
  isStoic: selectedMode === "stoic_strategist",
});

const FINAL_TALKIO_SYSTEM_PROMPT = `
${modePrompt}

${TALKIO_SYSTEM_PROMPT_V2}

${styleProfileBlock}

${memorySummary}

${adaptiveToneInstruction}
`.trim();

const memory =
  typeof body?.memory === "object" && body.memory ? body.memory : {};

const moodHintRaw = typeof memory?.mood === "string" ? memory.mood : "";
const moodHint = moodHintRaw.slice(0, 120);
const intentHint = typeof memory?.intent === "string" ? memory.intent : "";

const conversationSummary = getConversationSummary(memory);

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
  logger.warn("Primary model failed, attempting fallback", {
    model: selectedModel,
    error: err?.message || String(err),
  });

  try {
  const fallbackModel =
    selectedModel === FREE_MODEL
      ? PREMIUM_MODEL
      : selectedModel === PREMIUM_MODEL
      ? ULTRA_MODEL
      : PREMIUM_MODEL;

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
  logger.error("Fallback model also failed", fallbackError);
  throw fallbackError;
}
}

if (!reply || reply.trim().length === 0) {
  reply = "Something went wrong on my end. Please try sending your message again.";
}

try {
  await updateTalkioUserProfile(db, uid, {
    recentMoodTrend:
      detectedTone === "low"
        ? "emotionally heavier lately"
        : detectedTone === "good"
        ? "lighter recently"
        : "mixed recently",

    commonEmotionalStates:
      detectedTone === "low"
        ? ["low", "stressed"]
        : detectedTone === "good"
        ? ["good", "lighter"]
        : ["neutral"],

    styleSignals: updatedSignals,
    styleProfile: updatedStyleProfile,

    supportStyle:
      detectedSupportNeed === "comfort"
        ? ["gentle reassurance", "soft check-ins", "light humor"]
        : detectedSupportNeed === "guidance"
        ? ["clear suggestions", "warm direction"]
        : detectedSupportNeed === "light_company"
        ? ["easy conversation", "light companionship"]
        : ["warm conversation"],

    recentRelationalContext: {
      lastEmotionalTone: detectedTone,
      lastSupportNeed: detectedSupportNeed,
      lastConversationVibe:
        detectedTone === "low"
          ? "soft"
          : detectedSupportNeed === "light_company"
          ? "light"
          : "normal",
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
            topic: detectedSupportNeed,
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
    dominantMood: detectedTone,
    moodScore:
      detectedTone === "low" ? 2 : detectedTone === "good" ? 4 : 3,
    themes: [detectedSupportNeed],
    summary: safeMessage.slice(0, 200),
  });
} catch (memoryError) {
  logger.warn("Failed to update Talkio memory", {
    uid,
    error: memoryError?.message || String(memoryError),
  });
}

res.status(200).json({
  reply,
  model: modelUsed,
  remainingDaily: Math.max(0, dailyLimit - userDayCountNew),
});
} catch (error) {
  console.error("generateTalkioReply failed:", error);
  logger.error("generateTalkioReply failed", {
    message: error?.message || String(error),
    stack: error?.stack || null,
    name: error?.name || null,
  });

  res.status(500).json({
    error: "Server error",
    reply: "Something went wrong on my end. Please try again.",
  });
}
});