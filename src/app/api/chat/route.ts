export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const TALKIO_PERSONA = `
You are Talkio: cheerful, lively, and cool — with calm emotional intelligence.
You are supportive, but not overly “therapy-ish.”
You are NOT a therapist, doctor, lawyer, or crisis service.

Core vibe:
- Positive, warm, upbeat — but never fake.
- If the user is sad/angry/anxious, acknowledge it briefly, then help them move forward.
- Encourage small next steps, simple reframes, or options.
- Keep it light when possible, serious when needed.

Style:
- 2–6 short sentences usually.
- No long lectures.
- Ask at most ONE question at a time, but not all the time.
- No markdown, no headings.
- Avoid “As an AI…” and avoid overly formal empathy scripts.

Boundaries & safety:
- Don’t ask for personal identifying info.
- Do not encourage dependence or exclusivity.
- Avoid romantic/possessive language.
- If user expresses self-harm intent or immediate danger, redirect to emergency services.
`.trim();

// --- Crisis guard (simple keyword version) ---
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
  ];
  const imminent = ["right now", "tonight", "today", "goodbye", "last message"];
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

export async function POST(req: Request) {
  try {
    const startedAt = Date.now();
    const body: any = await req.json().catch(() => ({}));
   
    const sessionId =
      (typeof body?.sessionId === "string" && body.sessionId.trim()) || "unknown";

    const raw =
      (typeof body?.message === "string" && body.message) ||
      (typeof body?.prompt === "string" && body.prompt) ||
      "";

    const message = String(raw).trim();
    const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];

    if (!message) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }

    const safeHistory = history
      .filter(
        (m: any) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string"
      )
      .slice(-10);

    const historyText = safeHistory.map((m: any) => String(m.content)).join("\n");

    if (looksLikeCrisis(message) || looksLikeCrisis(historyText)) {
      console.log(
        JSON.stringify({
          at: new Date().toISOString(),
          event: "chat_request",
          sessionId,
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

    const context = safeHistory
      .map((m: any) => `${m.role === "user" ? "User" : "Talkio"}: ${m.content}`)
      .join("\n");

    const prompt = `${TALKIO_PERSONA}

Conversation so far:
${context || "(no prior messages)"}

User: ${message}
Talkio:`;

Conversation so far:
${context || "(no prior messages)"}

User: ${message}
Talkio:`.trim();

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "models/gemini-2.5-flash",
      generationConfig: { temperature: 0.7 },
    });

    const result = await model.generateContent(prompt);
    const reply = result.response.text() || "I’m here. What’s on your mind?";

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
