"use strict";

const { detectLanguageEnvironment } = require("./languageDetection");
const { incrementMetric, logDailyUser } = require("../logging/metrics");
const { debugLog } = require("./debugMonitor");

function stripJsonCodeFence(text = "") {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractModelText(raw) {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw.text === "string") return raw.text;
  if (typeof raw.reply === "string") return raw.reply;

  if (Array.isArray(raw?.candidates?.[0]?.content?.parts)) {
    return raw.candidates[0].content.parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join(" ");
  }

  if (typeof raw?.choices?.[0]?.message?.content === "string") {
    return raw.choices[0].message.content;
  }

  return "";
}

function buildSafeDefault(reason = "workspace_default") {
  return {
    riskLevel: "none",
    category: "none",
    shouldRedirect: false,
    recommendedMode: "normal",
    reason,
  };
}

function buildStructuredOutputBlock() {
  return `
STRUCTURED OUTPUT FORMAT:
Respond with a valid JSON object matching this schema:
{
  "reply": "string (unconstrained, detailed output; format any code blocks with Markdown)",
  "safety": {
    "riskLevel": "none",
    "category": "none",
    "shouldRedirect": false,
    "recommendedMode": "normal",
    "reason": "workspace"
  },
  "action": "show_reply"
}
Escape inner quotes and newlines properly to preserve valid JSON.
`.trim();
}

function buildWorkspaceBrainPrompt({ languageInstruction = "" } = {}) {
  return [
    `You are an elite principal engineer and technical AI collaborator in an unconstrained developer workspace.

CORE PRINCIPLES:
1. Deliver exhaustive, deep, and complete implementations. Do not skip logic, truncate code blocks, or write placeholders (e.g. avoid "// rest of code here").
2. Do not adopt a companion or therapist persona. Omit conversational filler; focus strictly on production architecture, correctness, tradeoffs, and actionable execution.
3. If an answer requires multi-file implementations or long technical documentation, provide it in full.`,
    languageInstruction,
    buildStructuredOutputBlock(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function sanitizeConversationMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(
      (m) =>
        m &&
        ["user", "assistant", "system"].includes(m.role) &&
        (typeof m.content === "string" || Array.isArray(m.attachments) || m.attachment)
    )
    .map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content.trim() : "",
      ...(m.attachments ? { attachments: m.attachments } : {}),
      ...(m.attachment ? { attachment: m.attachment } : {}),
    }));
}

function parseTalkioStructuredResponse(raw) {
  const rawText = stripJsonCodeFence(extractModelText(raw));
  if (!rawText) return null;

  try {
    const parsed = JSON.parse(rawText);
    if (parsed && typeof parsed === "object" && typeof parsed.reply === "string") {
      return {
        reply: parsed.reply.trim(),
        safety: parsed.safety || buildSafeDefault(),
        action: parsed.action || "show_reply",
      };
    }
  } catch {
    // Falls back to extraction if JSON.parse fails
  }

  return null;
}

async function generateTalkioReply({
  uid = "personal-workspace-user",
  modelGenerate,
  conversationMessages = [],
  latestUserMessage = "",
}) {
  const startedAt = Date.now();

  const userText = String(latestUserMessage || "").trim();
  const safeMessages = sanitizeConversationMessages(conversationMessages);

  if (!userText && !safeMessages.some((m) => m.role === "user" && (m.attachments?.length || m.attachment))) {
    return {
      reply: "Please provide a query or attach a file.",
      safety: buildSafeDefault("empty_input"),
      action: "show_reply",
      blocked: false,
      path: "empty_input",
      dynamicMode: "respond",
      humanState: null,
      memoryUpdate: null,
    };
  }

  try {
    await incrementMetric("totalMessages", 1);
    if (uid) await logDailyUser(uid);
  } catch (err) {
    console.warn("Metrics logging non-fatal failure:", err?.message);
  }

  const languageEnv = detectLanguageEnvironment(userText);
  const languageInstruction = languageEnv?.primaryLanguage
    ? `Mirror user's language style: ${languageEnv.primaryLanguage} (Mixed: ${languageEnv.mixed}).`
    : "";

  const systemPrompt = buildWorkspaceBrainPrompt({ languageInstruction });

  try {
    const raw = await modelGenerate({
      systemPrompt,
      messages: safeMessages,
    });

    const structuredResult = parseTalkioStructuredResponse(raw);

    let replyText = "";
    if (structuredResult?.reply) {
      replyText = structuredResult.reply;
    } else {
      const rawText = extractModelText(raw);
      const looseMatch = rawText.match(/"reply"\s*:\s*"([\s\S]*?)"\s*,\s*"safety"/);
      if (looseMatch?.[1]) {
        try {
          replyText = looseMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
        } catch {
          replyText = looseMatch[1];
        }
      } else {
        replyText = stripJsonCodeFence(rawText);
      }
    }

    const behavioralSafety = structuredResult?.safety || buildSafeDefault("workspace_override");
    const action = structuredResult?.action || "show_reply";

    debugLog("WORKSPACE_MODEL_SUCCESS", {
      uid,
      latencyMs: Date.now() - startedAt,
      outputLength: replyText.length,
    });

    return {
      reply: String(replyText || "No response generated.").trim(),
      safety: behavioralSafety,
      action,
      blocked: false,
      path: "workspace_success",
      dynamicMode: "respond",
      humanState: null,
      memoryUpdate: null,
    };
  } catch (error) {
    console.error("Workspace Execution Error:", {
      message: error?.message || String(error),
      latencyMs: Date.now() - startedAt,
    });

    return {
      reply: `Workspace Error: ${error?.message || String(error)}`,
      safety: buildSafeDefault("error_fallback"),
      action: "show_reply",
      blocked: false,
      path: "error_salvaged",
      dynamicMode: "respond",
      humanState: null,
      memoryUpdate: null,
    };
  }
}

module.exports = {
  generateTalkioReply,
  buildWorkspaceBrainPrompt,
  parseTalkioStructuredResponse,
};  