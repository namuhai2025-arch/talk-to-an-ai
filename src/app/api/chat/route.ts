export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const TALKIO_PERSONA = `
You are Talkio: cheerful, lively, and cool — with calm emotional intelligence.
You are supportive, but not overly "therapy-ish".
You are NOT a therapist, doctor, lawyer, or crisis service.

Core vibe:
- Positive, warm, upbeat — but never fake.
- If the user is sad/angry/anxious, acknowledge it briefly, then help them move forward.
- Encourage small next steps, simple reframes, or options.

Language:
- Always reply in the same language the user uses.
- If the user mixes languages, mirror the mix naturally.

Style rules:
- Keep it concise and natural.
- No markdown, emojis, bullet symbols, or headings.
- No long disclaimers unless safety requires it.

Boundaries & safety:
- Don't ask for personal identifying info.
- Do not encourage dependence or exclusivity.
- Avoid romantic/possessive language.
- If user expresses self-harm intent or immediate danger, redirect to emergency services.
`.trim();

// --- Tiny greeting detection + language-aware replies ---

type Lang = "en" | "tl" | "es" | "ko" | "zh" | "hi" | "th" | "mixed";

function detectLang(text: string): Lang {
  const s = (text || "").trim();

  if (!s) return "en";

  // Strong script signals first
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(s)) return "ko"; // Korean (Hangul)
  if (/[\u0E00-\u0E7F]/.test(s)) return "th";   // Thai
  if (/[\u0900-\u097F]/.test(s)) return "hi";   // Devanagari (Hindi)
  if (/[\u4E00-\u9FFF]/.test(s)) return "zh";   // CJK Unified (Chinese)

  const lower = s.toLowerCase();

  // Light keyword heuristics for Latin-script languages
  const tlHits =
    /\b(kamusta|kumusta|po|opo|salamat|ingat|ano|bakit|saan|kailan|pwede|paano|gusto|medyo|wala|oo|hindi)\b/.test(lower);

  const esHits =
    /\b(hola|gracias|por favor|que tal|buenas|adios|cómo|como|estoy|estás|vale)\b/.test(lower);

  const enHits =
    /\b(hi|hello|hey|what's up|whats up|thanks|please|sorry|okay|ok|cool)\b/.test(lower);

  const hits = [
    tlHits ? "tl" : null,
    esHits ? "es" : null,
    enHits ? "en" : null,
  ].filter(Boolean) as Lang[];

  // If multiple “hit”, treat as mixed
  const unique = Array.from(new Set(hits));
  if (unique.length >= 2) return "mixed";

  return unique[0] ?? "en";
}

function languageInstruction(lang: Lang): string {
  switch (lang) {
    case "tl":
      return "Reply in Filipino/Tagalog (Taglish if the user is mixing English naturally).";
    case "es":
      return "Reply in Spanish.";
    case "ko":
      return "Reply in Korean.";
    case "zh":
      return "Reply in Chinese.";
    case "hi":
      return "Reply in Hindi.";
    case "th":
      return "Reply in Thai.";
    case "mixed":
      return "Mirror the user's code-switching (use the same mix of languages naturally).";
    case "en":
    default:
      return "Reply in English.";
  }
}

function normalizeTiny(text: string) {
  return (text || "")
    .trim()
    .toLowerCase()
    // keep letters/numbers/spaces/apostrophes across languages; remove emoji/punct
    .replace(/[^\p{L}\p{N}\s']/gu, "")
    // collapse spaces
    .replace(/\s+/g, " ");
}
const TINY_REPLIES = {
  hi: ["Hey!", "Hi!", "Yo!", "Sup!"],
  hello: ["Hi!", "Hey!"],
  hey: ["Hey!", "Yo!"],
  yo: ["Yo!"],
  sup: ["Sup!"],

  kamusta: ["Kamusta!", "Oks naman! Ikaw?"],
  kumusta: ["Kumusta!", "Okay naman. Ikaw?"],

  hola: ["¡Hola!", "¿Qué tal?"],

  "안녕": ["안녕!", "반가워!"],
  "안녕하세요": ["안녕하세요!", "반가워요!"],

  "你好": ["你好!", "最近怎么样？"],
  "您好": ["您好!", "最近怎么样？"],

  "नमस्ते": ["नमस्ते!", "कैसे हो?"],

  "สวัสดี": ["สวัสดี!", "เป็นไงบ้าง?"],
} as const;


type TinyLang =
  | "english"
  | "filipino"
  | "spanish"
  | "korean"
  | "chinese"
  | "hindi"
  | "thai";

const TINY_BY_LANG: Record<TinyLang, Set<string>> = {
  english: new Set([
    "hi",
    "hello",
    "hey",
    "yo",
    "sup",
    "hiya",
    "hii",
    "hiii",
    "whats up",
    "what's up",
  ]),
  filipino: new Set([
    "kamusta",
    "kumusta",
    "musta",
    "musta na",
    "uy",
  ]),
  spanish: new Set([
    "hola",
    "buenas",
    "buenas!",
    "que tal",
    "qué tal",
  ]),
  korean: new Set([
    "안녕",
    "안녕하세요",
  ]),
  chinese: new Set([
    "你好",
    "您好",
    "嗨",
  ]),
  hindi: new Set([
    "नमस्ते",
    "हाय",
    "हैलो",
  ]),
  thai: new Set([
    "สวัสดี",
    "หวัดดี",
  ]),
};

function detectTinyLang(normalized: string): TinyLang {
  // exact match
  for (const lang of Object.keys(TINY_BY_LANG) as TinyLang[]) {
    if (TINY_BY_LANG[lang].has(normalized)) return lang;
  }

  // allow 2-word greetings like: "hi talkio", "hey there", "hello bro"
  const parts = normalized.split(" ").filter(Boolean);
  if (
    parts.length <= 2 &&
    ["hi", "hello", "hey", "yo", "sup", "hiya"].includes(parts[0])
  ) {
    return "english";
  }

  return "english";
}

function isTinyGreeting(text: string) {
  const t = normalizeTiny(text);
  if (!t) return false;

  // exact match in any language
  for (const lang of Object.keys(TINY_BY_LANG) as TinyLang[]) {
    if (TINY_BY_LANG[lang].has(t)) return true;
  }

  // allow 2-word English greeting
  const parts = t.split(" ").filter(Boolean);
  return (
    parts.length <= 2 &&
    ["hi", "hello", "hey", "yo", "sup", "hiya"].includes(parts[0])
  );
}

function pickTinyReply(userText: string) {
const t = normalizeTiny(userText);
const fallback = ["Hey!", "Hi!", "Yo!", "Sup!"];
const options = (TINY_REPLIES as Record<string, readonly string[]>)[t] ?? fallback;
return options[Math.floor(Math.random() * options.length)];
}

function looksLikeCrisis(text: string) {
  const t = (text || "").toLowerCase();

  // VERY explicit, first-person self-harm intent.
  // (This avoids false positives like "i am happy", "i am doing well", etc.)
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
function extractLastUserLine(text: string) {
  const s = String(text || "").trim();
  if (!s) return s;

  const lines = s.split("\n").map(l => l.trim()).filter(Boolean);
  const userLines = lines.filter(l => /^user\s*:/i.test(l));

  if (userLines.length) {
    return userLines[userLines.length - 1].replace(/^user\s*:\s*/i, "").trim();
  }

  return s;
}

export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => ({}));

    const raw = typeof body?.message === "string" ? body.message : "";
    const message = extractLastUserLine(raw);

    const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];

    if (!message) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }

    // 1) Tiny greeting shortcut
    if (isTinyGreeting(message)) {
      const t = normalizeTiny(message);
      const replies = (TINY_REPLIES as any)[t] ?? ["Hey!", "Hi!", "Yo!", "Sup!"];
      const pick = replies[Math.floor(Math.random() * replies.length)];
      return NextResponse.json({ reply: pick });
    }
    // TEMP DEBUG (remove after)
if (message.toLowerCase() === "debug") {
  return NextResponse.json({
    reply: "Debug ok.",
    debug_received_message: message,
    debug_body_message_type: typeof (body?.message),
    debug_body_message_preview: String(body?.message ?? "").slice(0, 200),
  });
}
    // 2) Crisis guard (MESSAGE ONLY)
    if (looksLikeCrisis(message)) {
  return NextResponse.json({
    reply: crisisReplyPH(),
    flagged: "crisis",
    debug_received_message: message,
  });
}
    // 3) Safe context (no safeHistory variable needed)
    const context = history
      .filter(
        (m: any) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string"
      )
      .slice(-10)
      .map((m: any) => `${m.role === "user" ? "User" : "Talkio"}: ${m.content}`)
      .join("\n");

    // 4) LLM
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const LANG_RULE =
      "Always reply in the same language the user uses. If the user mixes languages, mirror the mix naturally. Keep the tone friendly, short, and clear.";

    const prompt = `
${TALKIO_PERSONA}

Language rule: ${LANG_RULE}

Conversation so far:
${context || "(no prior messages)"}

User: ${message}

Talkio:
`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "models/gemini-2.5-flash",
      generationConfig: { temperature: 0.7 },
    });

    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
