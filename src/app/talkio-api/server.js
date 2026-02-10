import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

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
  "สวัสดี": ["สวัสดี!", "เป็นไงบ้าง?"]
};

function normalizeTiny(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, "")
    .replace(/\s+/g, " ");
}

function isTinyGreeting(text) {
  const t = normalizeTiny(text);
  if (!t) return false;
  if (Object.prototype.hasOwnProperty.call(TINY_REPLIES, t)) return true;
  const parts = t.split(" ").filter(Boolean);
  return parts.length <= 2 && ["hi", "hello", "hey", "yo", "sup", "hiya"].includes(parts[0]);
}

function pickTinyReply(text) {
  const t = normalizeTiny(text);
  const options = TINY_REPLIES[t] ?? ["Hey!", "Hi!", "Yo!", "Sup!"];
  return options[Math.floor(Math.random() * options.length)];
}

function looksLikeCrisis(text) {
  const t = String(text || "").toLowerCase();
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

function extractLastUserLine(text) {
  const s = String(text || "").trim();
  if (!s) return s;
  const lines = s.split("\n").map(l => l.trim()).filter(Boolean);
  const userLines = lines.filter(l => /^user\s*:/i.test(l));
  if (userLines.length) return userLines[userLines.length - 1].replace(/^user\s*:\s*/i, "").trim();
  return s;
}

app.post("/api/chat", async (req, res) => {
  try {
    const body = req.body ?? {};
    const raw = typeof body?.message === "string" ? body.message : "";
    const message = extractLastUserLine(raw);
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!message) return res.status(400).json({ error: "Invalid message" });

    if (isTinyGreeting(message)) {
      return res.json({ reply: pickTinyReply(message) });
    }

    if (looksLikeCrisis(message)) {
      return res.json({ reply: crisisReplyPH(), flagged: "crisis" });
    }

    const context = history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map((m) => `${m.role === "user" ? "User" : "Talkio"}: ${m.content}`)
      .join("\n");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

    const prompt = `
${TALKIO_PERSONA}

Language rule: Always reply in the same language the user uses. If the user mixes languages, mirror the mix naturally. Keep the tone friendly, short, and clear.

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
    return res.json({ reply });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Talkio API listening on", port));
