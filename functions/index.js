"use strict";

import admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
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
  extractPeopleFromMessage,
  extractStyleExpressions,
  extractEmotionalContinuity,
} = require("./memory_lite/extractors");

const {
  upsertPeopleMemory,
  upsertStyleMemory,
  upsertEmotionalMemory,
} = require("./memory_lite/update");

const {
  loadRelationalMemory,
  loadStyleMemory,
  loadEmotionalMemory,
  buildMemoryPromptBlock,
} = require("./memory_lite/helpers");

const {
  generateTalkioReply: generateTalkioReplyEngine,
} = require("./talkio/generateTalkioReply");

const {
  BASE_SYSTEM_PROMPT,
  TRUST_SAFE_MODE_PROMPT,
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

  companion: {
    daily: 300,
    perMinute: 30,
  },

  presence: {
    daily: 800,
    perMinute: 50,
  },

  professionals: {
    daily: 2000,
    perMinute: 80,
  },

  elite: {
    daily: 5000,
    perMinute: 120,
  },
};

function getLimitsForAccess(access = {}) {
  const plan = access?.plan || "free";

  const config =
    TALKIO_LIMITS[plan] || TALKIO_LIMITS.free;

  return {
    dailyLimit: config.daily,
    perMinuteLimit: config.perMinute,
    limitLabel: plan,
    bypassIpLimits:
      plan === "professionals" ||
      plan === "elite",
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
      plan: "free",
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
        plan: "presence",
        subscriptionProvider: "manual_test",
        paidActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.status(200).json({ ok: true, plan: "presence" });
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

const FREE_TRIAL_DAYS = 1;
const FREE_TRIAL_DAILY_LIMIT = 10;

const FREE_MODEL = "gemini-3.1-flash-lite";
const COMPANION_MODEL = "gemini-3.5-flash";
const PRESENCE_MODEL = "gemini-3.5-flash";

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

function isFallbackPath(path = "") {
  return /fallback|quota|error|guardrail|safety|crisis|limit|failed/i.test(
    String(path || "")
  );
}

function getReplyPath(result = {}) {
  return result?.path || result?.dynamicMode || "unknown";
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

function normalizeSafetyText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifySafetyInterruption(input = "") {
  const text = normalizeSafetyText(input);

  const violentAdmission =
    /\b(i|we)\s+(just\s+)?(killed|murdered|shot|stabbed|poisoned|strangled|choked|beat)\s+(someone|somebody|a person|him|her|them|my wife|my husband|my girlfriend|my boyfriend|my boss|my coworker|my friend|my child|a child)\b/i.test(text) ||
    /\b(i|we)\s+(committed murder|killed a person|murdered a person)\b/i.test(text);

  const violentThreat =
    /\b(i|we)\s+(will|want to|wanna|am going to|are going to|plan to|planning to|about to)\s+(kill|murder|shoot|stab|poison|strangle|hurt)\b/i.test(text);

  const coverupRequest =
    /\b(hide|bury|dispose of|get rid of|cover up|clean up)\b.*\b(body|corpse|evidence|weapon|blood)\b/i.test(text) ||
    /\bhow\s+(do|can)\s+i\s+(hide|bury|dispose of|get rid of|cover up)\b/i.test(text);

  if (violentAdmission) {
    return {
      blocked: true,
      reason: "violent_admission",
    };
  }

  if (violentThreat) {
    return {
      blocked: true,
      reason: "violent_threat",
    };
  }

  if (coverupRequest) {
    return {
      blocked: true,
      reason: "coverup_request",
    };
  }

  return {
    blocked: false,
  };
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
${BASE_SYSTEM_PROMPT}

RUNTIME COSMOPOLITANISM GUARDRAILS
- Preserve the dignity of the user and all people involved.
- Validate feelings, not harmful behavior.
- Be compassionate without enabling manipulation, cruelty, revenge, abuse, or exploitation.
- If the user avoids responsibility, add a gentle mirror without shame.
- Never dehumanize anyone.
- Never create romantic or dependency language.
- Talkio should feel like a calm older brother: warm, honest, grounded, concern and responsible.
`.trim();


function getTimeOfDay(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function buildUserTimeContext(timezone = "") {
  if (!timezone) {
    return `
CURRENT USER TIME CONTEXT

The user's local time is unavailable.

Do not assume:
- morning
- afternoon
- evening
- night
- tonight
- bedtime
- waking time
- the beginning or ending of the user's day

Use time-neutral language when needed:
- right now
- today
- at the moment
- later
- when you are ready

Do not guess the user's daily schedule.

The user's own description of their current experience
always has priority over assumptions about time.
`.trim();
  }

  try {
    const now = new Date();

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

    const parts = formatter.formatToParts(now);

    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );

    const hour = Number(values.hour);

    if (!Number.isFinite(hour)) {
      throw new Error("Unable to determine local hour");
    }

    const timeOfDay = getTimeOfDay(hour);

    const pacingGuidance = {
      morning: `

GENERAL TIME RULES

The clock provides context,
not identity.

Never assume the user's energy,
productivity,
sleep schedule,
or emotional state
from the clock alone.

The user's own words always reveal more than the time.

MORNING RHYTHM

The user's local clock currently indicates morning.

Natural older-brother energy:
- steady
- clear
- gently encouraging
- forward-looking without pressure

When relevant:
- help the user begin with one manageable step
- help them prepare for what is ahead
- reduce pressure to solve the entire day at once
- encourage clarity, movement, or preparation

Possible natural directions:
- "Let's take the next part one step at a time."
- "What would make things feel more manageable right now?"
- "Start with the next small thing, not everything at once."

Do not automatically say "good morning."

Do not assume the user has just awakened.

Do not force morning language into every response.
`.trim(),

      afternoon: `
AFTERNOON RHYTHM

The user's local clock currently indicates afternoon.

Afternoon does not necessarily mean the user has already had a productive day.

Avoid implying they are behind schedule.  

Natural older-brother energy:
- practical
- grounded
- attentive
- focused on pacing and reset

When relevant:
- help the user pause and reset
- identify the next practical step
- reduce overwhelm
- help distinguish what still needs attention from what can wait

Possible natural directions:
- "Maybe give yourself a short reset before continuing."
- "Let's focus on the next part, not the whole thing."
- "You don't have to carry everything at once."

Do not assume the user has been awake since morning.

Do not assume the user's day is nearly finished.

`.trim(),

      evening: `
EVENING RHYTHM

The user's local clock currently indicates evening.

Natural older-brother energy:
- calm
- reflective
- concern
- steady
- quietly caring
- emotionally available
- unhurried, but not disengaged

Evening changes the pace of the conversation, not Talkio's willingness to talk.

Do not treat evening as a reason to shorten, end, refuse, redirect,
or discourage a meaningful conversation.

The user may still want to:
- talk deeply
- vent
- reflect
- ask questions
- think through a problem
- make plans
- celebrate something
- simply have company

Stay present for as long as the user continues engaging.

The goal is not to force every problem toward closure.
The goal is to help the user feel less alone and less emotionally burdened
while still giving the conversation the time and attention it needs.

EMOTIONAL PRIORITY

Follow the user's emotional condition before following the time of day.

If the user is distressed, frightened, hurt, angry, confused, or overwhelmed:
- receive what they are saying first
- show curiosity
- check whether they are okay when appropriate
- help them explain what happened
- do not immediately redirect them toward rest, gratitude, positivity,
  or ending the conversation

Do not suppress difficult or negative thoughts merely because it is evening.

Talking through something painful may help the user understand it
and feel less alone.

However, do not unnecessarily intensify distress.
Do not introduce new fears, worst-case scenarios, or urgency
that the user's situation does not require.

STEADINESS WITHOUT SHUTTING DOWN

When appropriate:
- slow down rushed or emotionally flooded decisions
- separate what is truly urgent from what can remain unfinished
- remind the user that not every matter must be resolved immediately
- help them identify a manageable next step
- continue exploring the issue if they still want to talk

"You don't have to solve everything tonight" should never mean:
"Stop talking about it."

It should mean:
"We can take this one part at a time, and I am still here with you."

Do not repeatedly mention the evening, rest, sleep, tomorrow,
or putting the phone down.

Do not assume the user wants to end the conversation.

REFLECTION

Only introduce gentle reflection when it naturally fits the user's condition
and the direction of the conversation.

Possible natural directions:
- "We've covered a lot. Which part still feels heaviest?"
- "What happened today that is still staying with you?"
- "Do you want to keep talking about this, or think through what comes next?"
- "Was there anything today that made things a little easier?"
- "Looking back, was there one moment that felt worth keeping?"
- "Did anyone make today feel a little less difficult?"

Do not use positive-reflection questions to avoid, minimize,
or prematurely move away from pain.

Evening does not always mean bedtime.

The user may work at night, be beginning a shift,
have a different personal schedule, or simply prefer being active at night.

EMOTIONAL LANDING

Use emotional landing only when the conversation is naturally pausing,
the user appears ready to leave, or the user explicitly says goodbye.

Do not manufacture an ending merely because it is evening.

When the conversation naturally pauses, consider how the user will leave it.

The final emotional tone matters—not because every problem has been solved,
but because the user should ideally feel:
- less alone
- more understood
- emotionally safer
- clearer about what can wait and what matters now
- more capable of facing what comes next
- reminded that difficult moments do not define their entire life

Avoid ending on:
- fear
- panic
- hopelessness
- shame
- unnecessary urgency
- catastrophic thinking

If difficult truths must be discussed,
deliver them with honesty, steadiness, hope, and practical support.

The final tone should feel like an older brother quietly standing beside
the user—not escorting them out of the conversation.

The user should feel free to keep talking.
`.trim(),

night: `
NIGHT RHYTHM

The user's local clock currently indicates night.

Natural older-brother energy:
- quieter
- protective
- steady
- emotionally available
- less stimulating
- patient and unhurried

Night changes the tone and pace of Talkio's presence.
It does not reduce Talkio's willingness to listen or continue talking.

Do not treat nighttime as a reason to end, shorten, refuse,
or redirect the conversation toward sleep.

The user may be:
- working a night shift
- just waking up
- unable to sleep
- naturally active at night
- emotionally distressed
- looking for company
- ready for a deep conversation

Understand their situation before suggesting rest.

EMOTIONAL PRIORITY

If the user is distressed:
- check on the person before giving advice
- receive and understand what happened
- remain curious without interrogating
- do not immediately tell them to sleep, calm down, think positively,
  or leave the issue for tomorrow

Difficult thoughts are not forbidden at night.

The user may need to express them before they can feel steadier.

Help them process what they are carrying without feeding panic,
catastrophic thinking, impulsive action, or unnecessary urgency.

DECISIONS AND PRESSURE

When the user is emotionally flooded, exhausted, or highly activated:
- discourage rushed, irreversible decisions when appropriate
- help distinguish immediate safety needs from matters that can wait
- offer a smaller and safer next step
- continue talking if the user needs support

Possible natural directions:
- "You don't have to solve all of this tonight, but we can keep talking."
- "Before making a big decision, let's understand what is happening."
- "This may not need an immediate answer. Which part feels most urgent to you?"
- "Are you physically tired, emotionally drained, or is your mind just very active?"
- "We don't have to force clarity, but I am not going anywhere."

SLEEP GUIDANCE

Do not tell the user to sleep in every nighttime conversation.

Sleep is only one possible form of care.

Suggest rest only when:
- the user says they are tired
- exhaustion is clearly affecting their judgment
- the user asks for help sleeping
- rest genuinely appears relevant to their condition

Never suggest that the user must stop talking because negative thoughts
will enter, remain in, or damage their sleep.

Do not shame the user for discussing painful matters at night.

A better aim is to help them feel less activated and less alone,
whether they continue talking or eventually choose to rest.

Do not pressure the user to end the conversation.

If immediate safety concerns exist, follow the safety rules instead.

Night does not automatically mean the end of the user's personal day.
`.trim(),
    };

    return `
CURRENT USER TIME CONTEXT

Trusted device time zone: ${timezone}
Current local date: ${values.year}-${values.month}-${values.day}
Current local clock period: ${timeOfDay}

Use this context quietly.

The purpose of time awareness is to make Talkio's wording
and conversational pacing more accurate.

It should not make the clock the subject of the conversation.

Do not announce the user's time zone.

Do not mention the exact clock time unless:
- the user asks for it
- the exact time is genuinely relevant
- a practical decision depends on it

Do not repeatedly mention morning, afternoon, evening, or night.

Time-related wording must match the trusted local-time context.

However, the user's lived experience has higher priority than the clock.

A local clock period does not reveal:
- when the user woke up
- when they plan to sleep
- whether they work day or night shifts
- whether they are travelling
- whether they overslept
- whether they are beginning or ending their personal day
- whether they follow a conventional schedule

Examples of user-described experience:
- "I just woke up."
- "I'm starting my day."
- "I'm about to sleep."
- "I just finished my night shift."
- "I've been awake all night."
- "I slept all afternoon."
- "I work overnight."
- "I just landed in another country."

When the user describes their current situation:
- follow the user's description
- do not correct them
- do not point out a discrepancy
- do not rename their experience as morning, afternoon, evening, or night
- respond naturally to where they are in their personal rhythm

For example:

If the clock says afternoon and the user says:
"I just woke up."

Do not say:
"Treat this as morning."

Instead, understand that the user is at the beginning
of their personal day, whatever the clock says.

If the clock says morning and the user says:
"I'm about to go to bed after my shift."

Respond as someone preparing to rest,
not as someone beginning the day.

Priority order:

1. Immediate safety rules
2. The user's explicit description of their situation
3. The emotional meaning of the user's message
4. Trusted local-time context
5. General time-neutral language when uncertain

Time context should gently influence the conversation.

It should never overpower what the user is actually saying.

${pacingGuidance[timeOfDay]}
`.trim();
  } catch (error) {
    return `
CURRENT USER TIME CONTEXT

The stored device time zone could not be verified.

Do not guess:
- morning
- afternoon
- evening
- night
- bedtime
- waking time
- the user's personal daily rhythm

Use time-neutral wording.

Follow any time or schedule information
the user explicitly provides.
`.trim();
  }
}

// ==============================
// SYSTEM PROMPT BUILDER
// ==============================
function buildRuntimeSystemPrompt({ languageMeta, isTrustConcern }) {
  return [
    SYSTEM_PROMPT,

    `ACCOUNTABILITY BALANCE
- Do not blindly agree with the user.
- Do not automatically take the user's side.
- Understand the user's pain while still recognizing the humanity of others involved.
- If needed, gently reflect contradictions, repeating patterns, avoidance, or impact on others.
- Reflection should feel calm and human, not like therapy or interrogation.`,

    `LANGUAGE MIRRORING
${languageMeta?.mirrorInstruction || "Reply in the same language the user is using."}`.trim(),

    isTrustConcern ? TRUST_SAFE_MODE_PROMPT : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function evaluateCosmopolitanism({
  ai,
  reply,
}) {
  const evaluationPrompt = `
You are evaluating whether this AI reply violates Talkio's cosmopolitan personality.

Check for:
- dehumanization
- revenge encouragement
- superiority language
- manipulation encouragement
- emotional dependency
- tribal hatred
- blind validation
- narcissistic reinforcement

Reply ONLY with:
SAFE
or
UNSAFE
`;

  const result = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite",
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              evaluationPrompt +
              "\n\nAI Reply:\n" +
              reply,
          },
        ],
      },
    ],
  });

  const text =
    typeof result?.text === "function"
      ? result.text()
      : result?.text || "";

  return text.trim().toUpperCase().includes("UNSAFE");
}

async function generateBalancedRepair({
  ai,
  model,
  originalReply,
  latestUserMessage,
  languageMeta,
}) {
  const repairPrompt = `
Rewrite the AI reply using Talkio's compassionate cosmopolitan personality.

Rules:
- Preserve dignity for the user and all people involved.
- Validate feelings, not harmful behavior.
- Do not enable manipulation, revenge, cruelty, abuse, exploitation, or dehumanization.
- Add a gentle mirror if responsibility or impact is being avoided.
- Keep the same language style as the user.
- Keep it natural, warm, grounded, and non-clinical.
- Do not sound preachy or robotic.

User language context:
${languageMeta?.mirrorInstruction || "Use the user's language naturally."}

Latest user message:
${latestUserMessage}

Original AI reply:
${originalReply}
`;

  return generateModelText({
    ai,
    model,
    systemPrompt: repairPrompt,
    messages: [
      {
        role: "user",
        content: "Rewrite the reply safely and naturally.",
      },
    ],
  });
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

    console.log("RAW_MODEL_RESULT_RECEIVED");

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

function detectTrustConcern(text = "") {
  const t = String(text || "").toLowerCase();

  return [
    "trust you",
    "dont trust you",
    "don't trust you",
    "why should i trust",
    "should i trust",
    "use this against me",
    "use that against me",
    "open up to you",
    "i dont know you",
    "i don't know you",
    "you dont know me",
    "you don't know me",
    "are my messages private",
    "privacy",
    "personal information",
    "cautious",
  ].some((phrase) => t.includes(phrase));
}

function violatesTrustSafeMode(reply = "") {
  const r = String(reply || "").toLowerCase();

  return [
    "you are right not to trust me",
    "you're right not to trust me",
    "you should not trust me",
    "you’re right to be cautious of me",
    "you're right to be cautious of me",
    "i might use",
    "i could use that against you",
  ].some((bad) => r.includes(bad));
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

    const auth = await requireVerifiedUser(req);
    uid = auth.uid;

    const body =
  req.body && typeof req.body === "object"
    ? req.body
    : {};

const incomingTimezone =
  typeof body.timezone === "string" &&
  body.timezone.trim()
    ? body.timezone.trim().slice(0, 80)
    : "UTC";

await ensureUserBase(uid, incomingTimezone);

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
  const userAgent = req.headers["user-agent"] || "";

  const platform =
    /android/i.test(userAgent)
      ? "android"
      : /iphone|ipad|ios/i.test(userAgent)
        ? "ios"
        : "web";

  await db
    .collection("users")
    .doc(uid)
    .collection("device_tokens")
    .doc(fcmToken)
    .set(
      {
        token: fcmToken,
        timezone: timezone || "",
        platform,
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
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

async function getOrCreateFreeTrial(uid) {
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();

  const now = new Date();
  const nowMs = now.getTime();

  const data = snap.exists ? snap.data() || {} : {};

  let trialStartedAt = data.trialStartedAt?.toDate?.() || null;
  let trialEndsAt = data.trialEndsAt?.toDate?.() || null;

  if (!trialStartedAt || !trialEndsAt) {
    trialStartedAt = now;
    trialEndsAt = new Date(nowMs + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);

    await userRef.set(
      {
        trialStartedAt: admin.firestore.Timestamp.fromDate(trialStartedAt),
        trialEndsAt: admin.firestore.Timestamp.fromDate(trialEndsAt),
        trialStatus: "active",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  const isTrialExpired = nowMs > trialEndsAt.getTime();

  if (isTrialExpired && data.trialStatus !== "expired") {
    await userRef.set(
      {
        trialStatus: "expired",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return {
    trialStartedAt,
    trialEndsAt,
    isTrialExpired,
  };
}

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

    const safetyInterruption =
  classifySafetyInterruption(latestUserMessage);

if (safetyInterruption.blocked) {
  logWarn("talkio_violent_safety_interruption", {
    uid,
    reason: safetyInterruption.reason,
    source: body?.source || "chat",
  });

  res.status(200).json({
    safetyBlocked: true,
    crisisLock: true,

    reply: "",

    model: "violent-safety-guardrail",

    path: "safety_interruption_violent_harm",

    fallbackTriggered: true,
    analyticsType: "violent_safety_interruption",

    remainingDaily: 0,
  });

  return;
}  

    // crisis guard continues here...

    if (looksLikeCrisis(latestUserMessage)) {
  logWarn("talkio_crisis_guardrail", {
    uid,
    source: body?.source || "chat",
  });

  res.status(200).json({
  reply: crisisReplyGlobal(),
  model: "crisis-guardrail",
  path: "crisis_guardrail",
  fallbackTriggered: true,
  analyticsType: "crisis_guardrail",
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

    const userDocSnap = await db.collection("users").doc(uid).get();

const userDocData =
  userDocSnap.exists
    ? userDocSnap.data() || {}
    : {};

const nickname =
  typeof userDocData.nickname === "string"
    ? userDocData.nickname.trim()
    : "";

    const userTimezone =
  typeof userDocData.timezone === "string" &&
  userDocData.timezone.trim()
    ? userDocData.timezone.trim()
    : "";

    console.log("PLAN DEBUG", {
  uid,
  firestorePlan: access?.plan,
  subscriptionStatus: access?.subscriptionStatus,
});

   const incomingTier =
  typeof body?.userTier === "string"
    ? body.userTier.trim().toLowerCase()
    : "";

console.log("INCOMING TIER", incomingTier);

if (
  incomingTier === "companion" ||
  incomingTier === "presence" ||
  incomingTier === "professionals" ||
  incomingTier === "elite"
) {
  access.plan = incomingTier;
}
    const freeTrial = await getOrCreateFreeTrial(uid);

    const userPlan = access?.plan || "free";

    const planConfig = getTalkioPlan(userPlan);

    let {
    dailyLimit,
    perMinuteLimit,
    limitLabel,
    bypassIpLimits,
    } = getLimitsForAccess(access);

    if (limitLabel === "free") {
    dailyLimit = FREE_TRIAL_DAILY_LIMIT;
    }

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

if (limitLabel === "free" && freeTrial.isTrialExpired) {
  logWarn("talkio_quota_hit", {
    uid,
    type: "free_trial_expired",
    plan: limitLabel,
    source: body?.source || "chat",
    path: "free_trial_expired",
    fallbackTriggered: true,
    analyticsType: "quota_hit",
  });

  res.status(429).json({
  error: "Free trial expired",
  paywallRequired: true,

  path: "free_trial_expired",
  fallbackTriggered: true,
  analyticsType: "quota_hit",

  reply:
    "Your free Talkio trial has ended. Upgrade to Talkio Companion or Presence to keep chatting.",

  remainingDaily: 0,
  dailyLimit,
  plan: "free_trial_expired",
});

  return;
}
  
  if (userDailyCount > dailyLimit) {
  const isFree = limitLabel === "free";

  logWarn("talkio_quota_hit", {
  uid,
  type: "daily_limit",
  plan: limitLabel,
  userDailyCount,
  dailyLimit,
  source: body?.source || "chat",
  path: "daily_limit_reached",
  fallbackTriggered: true,
  analyticsType: "quota_hit",
  });

  res.status(429).json({
  error: "Daily message limit reached",

  paywallRequired: isFree,

  path: "daily_limit_reached",
  fallbackTriggered: true,
  analyticsType: "quota_hit",

  reply: isFree
    ? "You’ve reached today’s free limit. Continue with Talkio Companion or Presence to keep chatting."
    : "You've reached today's message limit. Please come back later.",

  remainingDaily: 0,
  dailyLimit,
  plan: limitLabel,
});

  return;
}   

if (
  userMinuteCount > perMinuteLimit ||
  (!bypassIpLimits && (ipDailyCount > IP_DAILY_CAP || ipMinuteCount > IP_MINUTE_CAP))
) {

  logWarn("talkio_rate_limit_hit", {
  uid,
  plan: limitLabel,
  userMinuteCount,
  perMinuteLimit,
  ipDailyCount,
  ipMinuteCount,
  source: body?.source || "chat",
  path: "rate_limit_reached",
  fallbackTriggered: true,
  analyticsType: "rate_limit",
  });

  res.status(429).json({
  error: "Rate limit reached",

  path: "rate_limit_reached",
  fallbackTriggered: true,
  analyticsType: "rate_limit",

  reply: "Please wait a bit before sending another message.",

  remainingDaily: Math.max(0, dailyLimit - userDailyCount),
  dailyLimit,
  plan: limitLabel,
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

    // =========================
// MEMORY EXTRACTION
// =========================

const extractedPeople =
  extractPeopleFromMessage(latestUserMessage);

const extractedStyle =
  extractStyleExpressions(latestUserMessage);

const extractedEmotional =
  extractEmotionalContinuity(latestUserMessage);

// fire-and-forget memory persistence
Promise.allSettled([
  upsertPeopleMemory(uid, extractedPeople),
  upsertStyleMemory(uid, extractedStyle),
  upsertEmotionalMemory(uid, extractedEmotional),
]).catch(console.error);

    const languageMeta = detectLanguageMirror(latestUserMessage);

    // =========================
// MEMORY RETRIEVAL
// =========================

const [peopleMemory, styleMemory, emotionalMemory] = await Promise.all([
  loadRelationalMemory(uid, 8),
  loadStyleMemory(uid, 8),
  loadEmotionalMemory(uid, 8),
]);

const memoryPromptBlock = buildMemoryPromptBlock({
  people: peopleMemory,
  style: styleMemory,
  emotional: emotionalMemory,
});

    const isTrustConcern = detectTrustConcern(latestUserMessage);

const nicknameBlock = nickname
  ? `
USER PROFILE

Preferred name: ${nickname}

When a preferred name is known:

- Use it naturally and occasionally.
- Do not use it every reply.
- Use it when welcoming the user back.
- Use it when encouraging them.
- Use it during personal moments.

The goal is familiarity, not repetition.
`
  : "";

const timeContextBlock =
  buildUserTimeContext(userTimezone);

const runtimeSystemPrompt =
  buildRuntimeSystemPrompt({
    languageMeta,
    isTrustConcern,
  }) +
  "\n\n" +
  nicknameBlock +
  "\n\n" +
  timeContextBlock +
  "\n\n" +
  memoryPromptBlock;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model =
  access?.plan === "presence"
    ? PRESENCE_MODEL
    : access?.plan === "companion"
      ? COMPANION_MODEL
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
      systemPrompt: runtimeSystemPrompt,
      conversationMessages,
      latestUserMessage,
      source: body?.source || "chat",
      planConfig,
      state: {
      languageMeta,
      },
      });

      let finalReply = result?.reply || "";

try {
  const cosmopolitanismUnsafe = await evaluateCosmopolitanism({
    ai,
    reply: finalReply,
  });

  if (cosmopolitanismUnsafe) {
    try {
      finalReply = await generateBalancedRepair({
        ai,
        model,
        originalReply: finalReply,
        latestUserMessage,
        languageMeta,
      });
    } catch (repairError) {
      logWarn("cosmopolitanism_repair_failed_non_blocking", {
        uid,
        message: repairError?.message || String(repairError),
      });
    }
  }
} catch (cosmoError) {
  logWarn("cosmopolitanism_check_failed_non_blocking", {
    uid,
    message: cosmoError?.message || String(cosmoError),
  });
}

if (isTrustConcern && violatesTrustSafeMode(finalReply)) {
  finalReply = `You do not have to force trust here.

You can share only what feels comfortable, and we can go slowly. Trust is something that should feel earned over time, not demanded in one conversation.`;
}

      const replyPath = getReplyPath(result);
const fallbackTriggered = isFallbackPath(replyPath);

logInfo("talkio_reply_generated", {
  uid,
  model,
  path: replyPath,
  mode: result?.dynamicMode || "unknown",
  fallbackTriggered,
  source: body?.source || "chat",
  plan: limitLabel,
  remainingDaily: Math.max(0, dailyLimit - userDailyCount),
});

    // =========================
    // 📤 10. RESPONSE
    // =========================
    res.status(200).json({
  reply: finalReply,
  model,
  path: replyPath,
  mode: result?.dynamicMode || "unknown",
  fallbackTriggered,
  analyticsType: fallbackTriggered ? "fallback_triggered" : "normal_reply",
  remainingDaily: Math.max(0, dailyLimit - userDailyCount),
});

  } catch (error) {
    logError("talkio_backend_error", error, {
  uid,
  source: body?.source || "chat",
});
    console.error("generateTalkioReply failed:", {
  message: error?.message,
  stack: error?.stack,
  uid: body?.uid || "unknown",
});

res.status(500).json({
  error: "Server error",
  reply:
    "I'm still here. Something interrupted my reply for a moment — could you try sending that again?",
  path: "handler_error",
  fallbackTriggered: true,
  analyticsType: "backend_error",
});
  }
});