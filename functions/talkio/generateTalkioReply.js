"use strict";

function normalizeReply(reply) {
  return String(reply || "").trim();
}

function isUsableReply(reply) {
  const text = normalizeReply(reply);

  if (!text) return false;
  if (text.length < 4) return false;

  if (/^i['’]?m here\.?\s*go on\.?$/i.test(text)) return false;
  if (/^something went wrong/i.test(text)) return false;

  return true;
}

function buildRetryPrompt(latestUserMessage) {
  return `
The previous reply was weak, empty, generic, or off-target.

Write one better reply to the user's latest message.

Latest user message:
"${latestUserMessage}"

Requirements:
- sound like a real human, not a bot
- be specific to what the user said
- do not sound like customer support or a therapist
- do not use canned empathy
- do not start with fillers like "Yeah", "Oh wow", "Oh man"
- keep it concise and natural
- if the user is asking what to do, give one grounded next step
- reply in the same language as the user
`.trim();
}

async function generateTalkioReply({
  modelGenerate,
  systemPrompt,
  conversationMessages,
  latestUserMessage,
}) {
  const safeMessages = Array.isArray(conversationMessages)
    ? conversationMessages.filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant" || m.role === "system") &&
          typeof m.content === "string" &&
          m.content.trim()
      )
    : [];

  const messagesForModel = [
    ...safeMessages,
    {
      role: "user",
      content: String(latestUserMessage || "").trim(),
    },
  ].filter((m) => m.content);

  try {
    const firstDraft = normalizeReply(
      await modelGenerate({
        systemPrompt,
        messages: messagesForModel,
      })
    );

    if (isUsableReply(firstDraft)) {
      return { reply: firstDraft };
    }

    const retryPrompt = buildRetryPrompt(latestUserMessage);

    const retryDraft = normalizeReply(
      await modelGenerate({
        systemPrompt: `${systemPrompt}\n\n${retryPrompt}`,
        messages: messagesForModel,
      })
    );

    if (isUsableReply(retryDraft)) {
      return { reply: retryDraft };
    }

    return { reply: "..." };
  } catch (err) {
    console.error("generateTalkioReply failed:", err);
    return { reply: "..." };
  }
}

module.exports = {
  generateTalkioReply,
};