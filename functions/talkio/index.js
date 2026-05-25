"use strict";

const { generateTalkioReply } = require("./generateTalkioReply");

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildConversationMessages(messages = [], latestUserMessage = "") {
  const safeHistory = Array.isArray(messages)
    ? messages
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant" || m.role === "system") &&
            typeof m.content === "string" &&
            m.content.trim()
        )
        .map((m) => ({
          role: m.role,
          content: m.content.trim(),
        }))
    : [];

  const latest = normalizeText(latestUserMessage);
  const lastHistoryItem = safeHistory[safeHistory.length - 1];

  if (
    latest &&
    !(
      lastHistoryItem &&
      lastHistoryItem.role === "user" &&
      lastHistoryItem.content === latest
    )
  ) {
    safeHistory.push({
      role: "user",
      content: latest,
    });
  }

  return safeHistory;
}

function buildTalkioSystemPrompt({
  coreIdentityPrompt,
  cosmopolitanismPrompt = "",
  latestUserMessage,
}) {
  return `
${coreIdentityPrompt}

${cosmopolitanismPrompt}

RUNTIME CONTEXT
- Mirror the user's current language naturally.
- If the user mixes languages, mirror that naturally.

LATEST USER MESSAGE
"${latestUserMessage}"
`.trim();
}

async function generateTalkioReplyEngine({
  modelGenerate,
  coreIdentityPrompt,
  cosmopolitanismPrompt = "",
  messages,
  latestUserMessage,
}) {
  const cleanedLatestUserMessage = normalizeText(latestUserMessage);

  const conversationMessages = buildConversationMessages(
    messages,
    cleanedLatestUserMessage
  );

  const systemPrompt = buildTalkioSystemPrompt({
    coreIdentityPrompt,
    cosmopolitanismPrompt,
    latestUserMessage: cleanedLatestUserMessage,
  });

  return generateTalkioReply({
    modelGenerate,
    systemPrompt,
    conversationMessages,
    latestUserMessage: cleanedLatestUserMessage,
  });
}

module.exports = {
  generateTalkioReplyEngine,
  buildConversationMessages,
  buildTalkioSystemPrompt,
};