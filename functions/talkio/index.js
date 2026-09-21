"use strict";

const admin = require("firebase-admin");
const { generateTalkioReply } = require("./generateTalkioReply");

if (!admin.apps.length) {
  admin.initializeApp();
}

const AUTHORIZED_EMAIL = "lacidamuriel@gmail.com";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildConversationMessages(
  messages = [],
  latestUserMessage = "",
  incomingAttachments = []
) {
  const safeHistory = Array.isArray(messages)
    ? messages
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant" || m.role === "system") &&
            (typeof m.content === "string" || Array.isArray(m.attachments) || m.attachment)
        )
        .map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content.trim() : "",
          ...(m.attachments ? { attachments: m.attachments } : {}),
          ...(m.attachment ? { attachment: m.attachment } : {}),
        }))
    : [];

  const latest = normalizeText(latestUserMessage);
  const lastHistoryItem = safeHistory[safeHistory.length - 1];

  const activeAttachments = Array.isArray(incomingAttachments)
    ? incomingAttachments
    : incomingAttachments
    ? [incomingAttachments]
    : [];

  if (
    (latest || activeAttachments.length > 0) &&
    !(
      lastHistoryItem &&
      lastHistoryItem.role === "user" &&
      lastHistoryItem.content === latest &&
      !activeAttachments.length
    )
  ) {
    safeHistory.push({
      role: "user",
      content: latest,
      ...(activeAttachments.length > 0 ? { attachments: activeAttachments } : {}),
    });
  }

  return safeHistory;
}

function buildWorkspaceSystemPrompt({ latestUserMessage = "" } = {}) {
  return `You are an expert full-stack engineer and deep technical collaborator operating in an unconstrained personal workspace.

OPERATING PRINCIPLES:
1. Provide deep, comprehensive, and exhaustive answers. Never artificially shorten responses.
2. Deliver full, production-ready code solutions without skipping logic or using placeholder comments (avoid "// rest of code here").
3. Do not adopt a companion or therapist persona; avoid empty conversational filler. Focus strictly on technical depth, architecture, and actionable implementations.
4. When long explanations or multi-file code blocks are needed, write them completely.

LATEST USER MESSAGE
"${latestUserMessage}"`.trim();
}

async function generateTalkioReplyEngine({
  uid = "personal-workspace-user",
  modelGenerate,
  messages,
  latestUserMessage,
  attachments = [],
  attachment = null,
  source = "chat",
  planConfig = { replyLength: "unrestricted", replyDepth: "deep" },
}) {
  const cleanedLatestUserMessage = normalizeText(latestUserMessage);

  const incomingAttachments =
    Array.isArray(attachments) && attachments.length > 0
      ? attachments
      : attachment
      ? [attachment]
      : [];

  const conversationMessages = buildConversationMessages(
    messages,
    cleanedLatestUserMessage,
    incomingAttachments
  );

  return generateTalkioReply({
    uid,
    modelGenerate,
    conversationMessages,
    latestUserMessage: cleanedLatestUserMessage,
    source,
    planConfig,
  });
}

// ==========================================
// Cloud Run HTTP Entrypoint
// ==========================================
async function generateTalkioReplyEndpoint(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1. Cryptographic token verification
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return res.status(401).json({ error: "Access Denied: Missing Bearer token." });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token, true);

    if (decodedToken.email?.toLowerCase() !== AUTHORIZED_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: "Forbidden: Unauthorized operator." });
    }
  } catch (err) {
    return res.status(401).json({ error: "Invalid, expired, or revoked token signature." });
  }

  // 2. Dispatch to execution engine
  try {
    const result = await generateTalkioReplyEngine({
      uid: "operator-admin",
      messages: req.body.messages || [],
      latestUserMessage: req.body.message || "",
      attachments: req.body.attachments || [],
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
}

module.exports = {
  generateTalkioReply: generateTalkioReplyEndpoint,
  generateTalkioReplyEngine,
  buildConversationMessages,
  buildTalkioSystemPrompt: buildWorkspaceSystemPrompt,
};