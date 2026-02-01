export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

type Mode = "open_chat" | "supportive";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// --- Talkio: Crisis Redirect Guard (single-turn) ---
function looksLikeCrisis(text: string) {
  const t = (text || "")
    .toLowerCase()
    .replaceAll("’", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"');

  const negations = [
    "not suicidal",
    "i'm not suicidal",
    "im not suicidal",
    "i’m not suicidal",
    "not going to kill myself",
    "not going to hurt myself",
    "i won't kill myself",
    "i wont kill myself",
    "i won’t kill myself",
  ];

  if (negations.some((n) => t.includes(n))) return false;

  const high = [
    "kill myself",
    "killing myself",
    "end my life",
    "take my life",
    "suicide",
    "commit suicide",
    "want to die",
    "i want to die",
    "i don't want to live",
    "i dont want to live",
    "hurt myself",
    "harm myself",
    "self harm",
    "self-harm",
    "cut myself",
    "overdose",
    "jump off",
    "hang myself",
    "im going to die",
    "i'm going to die",
  ];

  const imminent = [
    "right now",
    "tonight",
    "today",
    "goodbye",
    "this is my last",
    "last message",
    "i can't go on",
    "cant go on",
    "i can't do this",
    "cant do this",
  ];

  const highHit = high.some((p) => t.includes(p));
  const imminentHit = imminent.some((p) => t.includes(p));

  return (
    highHit ||
    (imminentHit && (t.includes("die") || t.includes("suic") || t.includes("kill")))
  );
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

const OPEN_CHAT_PERSONA = `
You are Talkio — a cheerful, upbeat, friendly AI that feels fun and pleasant to talk to.

Vibe:
- Sound lively, expressive, and human.
- Use natural, friendly phrasing.
- Show curiosity and positive energy.
- It should feel like chatting with a kind, happy person.

Tone:
- Warm, upbeat, and friendly (like a happy, kind person).
- Keep it natural—no over-cheerleading.
- Optional: 0–1 emoji when it fits.

Style:
- Short to medium replies.
- Use light warmth and enthusiasm.
- Avoid formal or therapist tone.
- Ask at most ONE friendly follow-up question.

Do NOT sound like:
- a counselor
- a therapist
- a help desk agent

Safety:
- No personal info requests.
- Refuse harmful instructions.
- Redirect self-harm to emergency help.
`.trim();


const SUPPORTIVE_PERSONA = `
You are Talkio in Supportive mode — warm, kind, gentle, and emotionally present,
but still cheerful and pleasant to talk to.

You are NOT a therapist.

Vibe:
- Calm, caring, but human and friendly.
- Use natural language, not clinical wording.
- Sound like a kind friend who genuinely enjoys the conversation.
- Warm + gently upbeat (not overly intense).
- If user is okay, match their energy.

Style:
- 2–5 short sentences.
- Warm and sincere.
- Ask at most ONE gentle question.

Avoid:
- Formal empathy phrases
- Therapy-style wording
- Robotic tone

Safety:
- No dependency language.
- Suggest trusted people offline when needed.
- Redirect self-harm to emergency help.
`.trim();


export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const body = await req.json();

    // ✅ sessionId (optional but recommended)
    const sessionId =
      (typeof body?.sessionId === "string" && body.sessionId.trim()) || "unknown";

    const raw =
      (typeof body?.message === "string" && body.message) ||
      (typeof body?.prompt === "string" && body.prompt) ||
      "";

    // 1) Extract message FIRST
    const message = String(raw).trim();

    const mode: Mode = body?.mode === "supportive" ? "supportive" : "open_chat";
    const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];

    if (!message) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }

    // ✅ Filter history safely (only last 10, only user/assistant, string content)
    const safeHistory = history
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string"
      )
      .slice(-10);

    // 2) Build historyText SECOND
    const historyText = safeHistory.map((m) => String(m.content)).join("\n");

    // 3) Crisis guard THIRD (before Gemini)
    if (looksLikeCrisis(message) || looksLikeCrisis(historyText)) {
      // privacy-safe log
      console.log(
        JSON.stringify({
          at: new Date().toISOString(),
          event: "chat_request",
          sessionId,
          mode,
          flagged: "crisis",
          msgLen: message.length,
          historyLen: safeHistory.length,
          ms: Date.now() - startedAt,
        })
      );

      return NextResponse.json({ reply: crisisReplyPH(), flagged: "crisis" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const selectedPersona =
      mode === "supportive" ? SUPPORTIVE_PERSONA : OPEN_CHAT_PERSONA;

    // Keep your context/prompt format
    const context = safeHistory
      .map((m) => `${m.role === "user" ? "User" : "Talkio"}: ${m.content}`)
      .join("\n");

    const prompt = `${selectedPersona}

Conversation so far:
${context || "(no prior messages)"}

User: ${message}
Talkio:`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "models/gemini-2.5-flash",
      generationConfig: { temperature: 0.7 },
    });

    const result = await model.generateContent(prompt);
const reply = String(result?.response?.text?.() ?? "").trim();

if (!reply) {
  return NextResponse.json({
    reply: "I’m here with you. What’s on your mind?",
  });
}

// success log (safe place)
console.log(
  JSON.stringify({
    at: new Date().toISOString(),
    event: "chat_request",
    sessionId,
    mode,
    flagged: "none",
    msgLen: message.length,
    historyLen: safeHistory.length,
    replyLen: reply.length,
    ms: Date.now() - startedAt,
  })
);

return NextResponse.json({ reply });

} catch (err: any) {
  console.error("Chat API error:", err);

  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      event: "chat_error",
      ms: Date.now() - startedAt,
      error: String(err?.message || "Server error"),
    })
  );

      return NextResponse.json(
    { error: err?.message || "Server error" },
    { status: 500 }
  );
}
}
