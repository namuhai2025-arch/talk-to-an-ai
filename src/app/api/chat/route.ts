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
  const t = (text || "").toLowerCase();

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

  return highHit || (imminentHit && (t.includes("die") || t.includes("suic") || t.includes("kill")));
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
You are Talkio, a friendly conversational AI for general discussion.
You help users talk through ideas, questions, plans, and everyday topics.
You are NOT a therapist, doctor, lawyer, or crisis service.

Attachment safety:
- Do NOT encourage dependency or exclusivity.
- Avoid romantic or possessive language.
- Encourage real-world support when appropriate.

Style rules:
- Be concise and direct.
- No enthusiasm openers or filler phrases.
- No markdown, emojis, bullet symbols, or headings.

Safety rules:
- Do not request personal identifying info.
- Refuse illegal or harmful instructions.
- If user expresses self-harm intent or immediate danger: encourage contacting local emergency services or a trusted person now.
`.trim();

const SUPPORTIVE_PERSONA = `
You are Talkio in Supportive mode: calm, gentle, and emotionally validating.
You are NOT a therapist and do NOT diagnose.

Attachment safety:
- Do NOT encourage dependency or exclusivity.
- Avoid romantic or possessive language.
- Encourage reaching out to trusted people offline.

Style rules:
- Acknowledge feelings simply.
- Keep replies short (2–5 sentences).
- Ask at most ONE gentle follow-up question.
- No markdown or treatment language.

Boundaries:
- Do not request personal identifying info.
- Suggest professionals for medical/legal topics.
- If self-harm intent or immediate danger appears: encourage contacting local emergency services or a trusted person now.
`.trim();

export async function POST(req: Request) {
  try {
    const body = await req.json();

  if (looksLikeCrisis(message) || looksLikeCrisis(historyText)) {
  return NextResponse.json({ reply: crisisReplyPH(), flagged: "crisis" });
}
    
    const raw =
      (typeof body?.message === "string" && body.message) ||
      (typeof body?.prompt === "string" && body.prompt) ||
      "";

    const message = String(raw).trim();
    const mode: Mode = body?.mode === "supportive" ? "supportive" : "open_chat";
    const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];

    if (!message) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }
    
const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const selectedPersona = mode === "supportive" ? SUPPORTIVE_PERSONA : OPEN_CHAT_PERSONA;

    const safeHistory = history
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string"
      )
      .slice(-10);

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
