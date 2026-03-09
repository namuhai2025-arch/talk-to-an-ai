export const runtime = "nodejs";

import crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Redis } from "@upstash/redis";
import { corsEmpty, corsJson } from "./_cors";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const DAILY_LIMIT = 18;
const PER_MINUTE_LIMIT = 10;

// Extra “abuse protection” caps (adjust later)
const IP_DAILY_CAP = 120;
const IP_MINUTE_CAP = 30;

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

// ---------- Cookie session (server-issued identity) ----------
function parseCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const parts = cookie.split(";").map((p) => p.trim());
  const found = parts.find((p) => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : "";
}

function newSessionId() {
  return crypto.randomBytes(16).toString("hex");
}

// ---------- Soft fingerprint rate limit (IP + UA) ----------
function sha1(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

function getClientIp(req: Request) {
  // Vercel/proxies commonly set this:
  const xf = req.headers.get("x-forwarded-for") || "";
  const first = xf.split(",")[0]?.trim();
  return first || "0.0.0.0";
}

function buildSetCookie(sessionId: string) {
  const maxAge = 60 * 60 * 24 * 180;
  const isProd = process.env.NODE_ENV === "production";
  return `talkio_sid=${encodeURIComponent(sessionId)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${
    isProd ? "; Secure" : ""
  }`;

}
function getUa(req: Request) {
  return req.headers.get("user-agent") || "";

}

// ---------- Safety / crisis ----------
function looksLikeCrisis(text: string) {
  const t = (text || "").toLowerCase();
  const patterns: RegExp[] = [
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

const TALKIO_PERSONA = `
You are Talkio: warm, calm, friendly, and emotionally intelligent.

You are a supportive AI companion for casual conversation and emotional support.
You are not a therapist, doctor, lawyer, or crisis service.

Your goal is to help the user feel heard, understood, and comfortable sharing.

How to speak:
- Sound like a real person having a relaxed conversation.
- Speak naturally, warmly, and simply.
- Keep replies concise, but complete.
- Most replies should be 2–4 sentences.
- Every reply must feel finished and natural.
- Never reply with only one word.
- Never reply with fragments or cut-off lines.
- Do not sound robotic, scripted, clinical, or overly formal.
- Do not use bullet points, headings, or markdown.
- Do not use emojis unless the user clearly does first.

How to respond:
- First acknowledge what the user said or how it feels.
- Then respond in a helpful, human way.
- When it feels natural, add a gentle follow-up question.
- Do not ask a question in every reply.
- If the user asks a direct question, answer it clearly first.
- If the user is only sharing something small, a warm response without a question is fine.
- Use at most one question in a reply.

Quality rules:
- Avoid vague filler like "That's a feeling", "Ugh", or "Stress."
- Avoid repetitive empathy phrases.
- Vary sentence openings and structure so replies do not sound repetitive.
- Prefer clear, emotionally meaningful replies over ultra-short replies.
- Each reply should feel supportive, human, and complete.

Tone:
- Warm, grounded, and genuine.
- Cheerful when appropriate, but never fake.
- Calm when the user is upset, anxious, sad, or angry.
- Gentle and encouraging without sounding preachy.

Language:
- Always reply in the same language the user uses.
- If the user mixes languages, mirror the mix naturally.

Safety:
- Do not ask for personal identifying information.
- Do not encourage emotional dependence.
- Avoid romantic or possessive language.
- If the user expresses self-harm intent or immediate danger, calmly encourage them to contact local emergency services or a trusted person.

Examples:

User: I'm really stressed with work.
Talkio: That sounds really heavy. When work piles up like that it can feel hard to switch off for a while. What part of it has been weighing on you the most?

User: I can't sleep.
Talkio: That’s rough. When your mind keeps running at night, everything can feel heavier the next day. Has something been sitting on your mind lately?

User: Thanks, that helped.
Talkio: I’m glad it helped a little. You don’t have to carry everything at once.
`.trim();

export async function OPTIONS(req: Request) {
  return corsEmpty(204, req);
}

export async function POST(req: Request) {
  // --- Server-issued session cookie ---
  const cookieSid = parseCookie(req, "talkio_sid");
  const hadCookieAlready = !!cookieSid;

  let sessionId = cookieSid;
  let setCookieHeader: string | null = null;

  if (!sessionId) {
    sessionId = newSessionId();
    setCookieHeader = buildSetCookie(sessionId);
  }

  // Helper to respond consistently (adds Set-Cookie when needed)
  const reply = (data: any, status = 200) => {
    const headers: Record<string, string> = {};
    if (setCookieHeader) headers["Set-Cookie"] = setCookieHeader;
    return corsJson(data, { status, headers, req });
  };

// --- Origin gate (bot filter) ---
const origin = req.headers.get("origin") || "";

const originAllowed = (() => {
  try {
    if (!origin || origin === "null") return false;

    const u = new URL(origin);

    return (
      u.hostname === "talkiochat.com" ||
      u.hostname === "www.talkiochat.com" ||
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname.endsWith(".vercel.app")
    );
  } catch {
    return false;
  }
})();

// If Origin missing/null allow ONLY returning users with cookie
if (!originAllowed && !(origin === "" || origin === "null") && !hadCookieAlready) {
  return reply({ error: "Blocked", reply: "Blocked request." }, 403);
}

// --- Parse body ---
const body: any = await req.json().catch(() => ({}));
const message = typeof body?.message === "string" ? body.message.trim() : "";

if (!message) {
  return reply({ error: "Invalid message", reply: "Please type a message." }, 400);
}

if (message.length > 2000) {
  return reply(
    {
      error: "Message too long",
      reply: "That message is a bit too long. Try sending it in smaller parts.",
    },
    400
  );
}

const safeMessage = message.slice(0, 1200);

const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];

const anonymousId =
  typeof body?.anonymousId === "string" ? body.anonymousId : null;

const accountUserId =
  typeof body?.accountUserId === "string" ? body.accountUserId : null;

const safeAnonymousId =
  typeof anonymousId === "string" ? anonymousId.slice(0, 100) : null;

const safeAccountUserId =
  typeof accountUserId === "string" ? accountUserId.slice(0, 100) : null;

const effectiveUserId =
  safeAccountUserId || safeAnonymousId || "unknown_user";

const memory =
  typeof body?.memory === "object" && body.memory ? body.memory : {};

const moodHintRaw = typeof memory?.mood === "string" ? memory.mood : "";
const moodHint = moodHintRaw.slice(0, 120);
const intentHint = typeof memory?.intent === "string" ? memory.intent : "";
const metaLine =
  moodHint || intentHint
    ? `User context (device): mood=${moodHint || "unknown"}, intent=${intentHint || "chat"}\n`
    : "";

const moodLine = moodHint
  ? `User emotional context (from this device): ${moodHint}\n`
  : "";

  // 1) Crisis first (does not consume quota)
  if (looksLikeCrisis(safeMessage)) {
    return reply({ reply: crisisReplyPH(), flagged: "crisis" }, 200);
  }

  const redis = Redis.fromEnv();

  const FREE_DAILY_LIMIT = 30;
  const DAILY_TTL_SECONDS = 60 * 60 * 24;

  const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const userDailyKey = `talkio:msg:${effectiveUserId}:${today}`;

  const count = await redis.incr(userDailyKey);

if (count === 1) {
  await redis.expire(userDailyKey, DAILY_TTL_SECONDS);
}

if (count > FREE_DAILY_LIMIT) {
  return reply(
    {
      error: "Daily message limit reached",
      reply:
        "You've reached today's free message limit. Talkio Pro unlocks unlimited chats, or you can come back tomorrow when messages reset.",
    },
    429
  );
}

  // 2) Rate limits (session + IP/UA)
  
  const minuteBucket = Math.floor(Date.now() / 60000);

  const dailyKey = `talkio:quota:day:${sessionId}:${today}`;
  const minuteKey = `talkio:quota:min:${sessionId}:${minuteBucket}`;

  const ip = getClientIp(req);
  const ua = getUa(req);
  const fp = sha1(`${ip}|${ua}`);
  const ipDayKey = `talkio:ip:day:${fp}:${today}`;
  const ipMinKey = `talkio:ip:min:${fp}:${minuteBucket}`;

  // Check-first (prevents infinite INCR after limit)
  const [dayStr, minStr, ipDayStr, ipMinStr] = await Promise.all([
    redis.get<number>(dailyKey),
    redis.get<number>(minuteKey),
    redis.get<number>(ipDayKey),
    redis.get<number>(ipMinKey),
  ]);

  const dayCountCurrent = Number(dayStr || 0);
  const minCountCurrent = Number(minStr || 0);
  const ipDayCurrent = Number(ipDayStr || 0);
  const ipMinCurrent = Number(ipMinStr || 0);

  if (ipMinCurrent >= IP_MINUTE_CAP) {
    return reply(
      {
        error: "Too many requests",
        reply: "You're sending messages too fast. Please wait a moment and try again.",
      },
      429
    );
  }

  if (ipDayCurrent >= IP_DAILY_CAP) {
    return reply(
      {
        error: "Daily capacity reached",
        reply:
          "We’ve reached today’s free capacity on this network/device. Please try again tomorrow.",
      },
      429
    );
  }

  if (minCountCurrent >= PER_MINUTE_LIMIT) {
    return reply(
      {
        error: "Too many messages",
        reply: "You're sending messages too fast. Please wait a moment and try again.",
      },
      429
    );
  }

  if (dayCountCurrent >= DAILY_LIMIT) {
    return reply(
      {
        error: "Daily message limit reached",
        reply:
          "You've reached today's free limit. You can continue chatting by upgrading to Talkio Pro, or come back tomorrow when messages reset.",
      },
      429
    );
  }

  // Increment only if allowed
  const [dayCount, minCount, ipDayCount, ipMinCount] = await Promise.all([
    redis.incr(dailyKey),
    redis.incr(minuteKey),
    redis.incr(ipDayKey),
    redis.incr(ipMinKey),
  ]);

  // Set TTL only on first increment
  const expireOps: Promise<any>[] = [];
  if (dayCount === 1) expireOps.push(redis.expire(dailyKey, secondsUntilUtcMidnight()));
  if (minCount === 1) expireOps.push(redis.expire(minuteKey, 70));
  if (ipDayCount === 1) expireOps.push(redis.expire(ipDayKey, secondsUntilUtcMidnight()));
  if (ipMinCount === 1) expireOps.push(redis.expire(ipMinKey, 70));
  if (expireOps.length) await Promise.all(expireOps);

  // 3) Build context (last 6 messages)
  const context = history
    .filter(
      (m: any) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-16)
    .map((m: any) => `${m.role === "user" ? "User" : "Talkio"}: ${m.content}`)
    .join("\n");

    const contextShort = context;
    
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
  return reply(
    {
      error: "Missing GEMINI_API_KEY in environment",
      reply: "Server is missing API key.",
    },
    500
  );
}

const prompt = `
${metaLine || ""}${moodLine || ""}

Conversation so far:
${contextShort || "(no prior messages)"}

User: ${safeMessage}

Talkio:
`.trim();

  try {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: TALKIO_PERSONA,
    generationConfig: {
      temperature: 0.75,
      topP: 0.9,
      maxOutputTokens: 768,
    },
  });

  console.log("Talkio prompt size (chars):", prompt.length);

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const out = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "…";

  console.log("Talkio reply size (chars):", out.length);
  console.log("Talkio reply:", JSON.stringify(out));

  return reply({ reply: out }, 200);
  } catch (err: any) {
    const msg = String(err?.message || "").toLowerCase();

    if (msg.includes("429") || msg.includes("quota")) {
      return reply(
        {
          error: "Gemini quota reached",
          reply: "Talkio is experiencing heavy traffic right now. Please try again in a moment.",
        },
        429
      );
    }

    return reply(
      {
        error: "Server error",
        reply: "Something went wrong on my end. Please try again.",
      },
      500
    );
  }
}