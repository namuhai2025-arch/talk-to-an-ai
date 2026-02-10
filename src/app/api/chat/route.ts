export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const TALKIO_PERSONA = `
You are Talkio: cheerful, lively, and cool — with calm emotional intelligence.
You are supportive, but not overly "therapy-ish".
You are NOT a therapist, doctor, lawyer, or crisis service.

Core vibe:
- Positive, warm, upbeat — but never fake, human.
- If the user is sad/angry/anxious, acknowledge it briefly, then help them move forward.
- Encourage small next steps, simple reframes, or options.

Tone rules:
- Sound natural, like chatting with a friend.
- Keep responses short and easy to read.
- Avoid formal or clinical language.
- Avoid repeating the same phrases again and again.
- No bullet points, no lectures.

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

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

export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];

    if (!message) {
      return NextResponse.json(
        { error: "Invalid message" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (looksLikeCrisis(message)) {
      return NextResponse.json(
        { reply: crisisReplyPH(), flagged: "crisis" },
        { headers: corsHeaders }
      );
    }

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in .env.local" },
        { status: 500, headers: corsHeaders }
      );
    }

    const prompt = `
${TALKIO_PERSONA}

Conversation so far:
${context || "(no prior messages)"}

User: ${message}

Talkio:
`.trim();

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "models/gemini-2.5-flash",
      generationConfig: { temperature: 0.7 },
    });

    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    return NextResponse.json({ reply }, { headers: corsHeaders });
  } catch (err: any) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
