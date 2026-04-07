"use strict";

const { scoreReply } = require("./responseScorer");
const { repairReply } = require("./replyRepair");
const { buildFallbackReply } = require("./fallbackReply");
const { detectUserStateHybrid } = require("./detectUserStateHybrid");
const { logTalkioEvent } = require("./analyticsLogger");

const DEFAULT_THRESHOLDS = {
  ACCEPT_THRESHOLD: 80,
  REWRITE_THRESHOLD: 68,
  DISCARD_THRESHOLD: 50,
};

function getPreviousAssistantReply(messages = []) {
  return [...messages]
    .reverse()
    .find((m) => m && m.role === "assistant" && m.content)
    ?.content || "";
}

function buildRewritePrompt({
  latestUserMessage,
  previousAssistantReply,
  badDraft,
  reasons = [],
}) {
  return `
Rewrite this assistant reply to fit Talkio better.

Latest user message:
"${latestUserMessage}"

Previous assistant reply:
"${previousAssistantReply}"

Weak draft:
"${badDraft}"

Problems to fix:
${reasons.length ? reasons.join(", ") : "general quality issues"}

Rules:
- Keep it natural and human
- Max 3 sentences
- Max 1 question
- Be specific to the user's wording
- Do not sound like a therapist or customer support
- Avoid generic empathy phrases
- If the user asks what to do, give one grounded next step
- If the user is overwhelmed, keep it calm and simple
- Do not repeat the previous assistant structure
`.trim();
}

function rankCandidates(candidates = []) {
  return [...candidates].sort((a, b) => {
    if (b.quality.total !== a.quality.total) {
      return b.quality.total - a.quality.total;
    }
    return (a.reply?.length || 0) - (b.reply?.length || 0);
  });
}

async function generateTalkioReply({
  modelGenerate,
  systemPrompt,
  conversationMessages,
  latestUserMessage,
  thresholds = DEFAULT_THRESHOLDS,
  enableModelRewrite = true,
}) {
  if (typeof modelGenerate !== "function") {
    throw new Error("generateTalkioReply requires a valid async modelGenerate function.");
  }

  const previousAssistantReply = getPreviousAssistantReply(conversationMessages);
  const turnIndex = Array.isArray(conversationMessages)
    ? conversationMessages.length
    : 0;

  // NEW: Smart Hybrid state detection
  const userState = await detectUserStateHybrid({
    latestUserMessage,
    modelGenerate,
  });

  // 1) First draft
  let draft = "";
  try {
    draft = await modelGenerate({
      systemPrompt,
      messages: conversationMessages,
    });
  } catch (err) {
    const fallback = buildFallbackReply(latestUserMessage);
    return {
      reply: fallback,
      quality: {
        total: 0,
        breakdown: {},
        reasons: ["initial_generation_failed"],
        shouldRewrite: false,
        shouldDiscard: false,
      },
      rewritten: false,
      rewriteType: "fallback_after_generation_error",
      debug: {
        userState,
        error: err?.message || String(err),
      },
    };
  }

  const score1 = scoreReply({
    reply: draft,
    latestUserMessage,
    previousAssistantReply,
    turnIndex,
    userStateOverride: userState,
  });

  if (score1.total >= thresholds.ACCEPT_THRESHOLD && !score1.shouldRewrite) {
    return {
      reply: draft,
      quality: score1,
      rewritten: false,
      rewriteType: null,
      debug: {
        userState,
        candidateScores: [{ type: "draft", total: score1.total }],
      },
    };
  }

  // 2) Repair pass
  const repaired = repairReply({
    reply: draft,
    latestUserMessage,
    previousAssistantReply,
  });

  const score2 = scoreReply({
    reply: repaired,
    latestUserMessage,
    previousAssistantReply,
    turnIndex,
    userStateOverride: userState,
  });

  const candidates = [
    {
      type: "draft",
      reply: draft,
      quality: score1,
      rewritten: false,
      rewriteType: null,
    },
    {
      type: "repair_pass",
      reply: repaired,
      quality: score2,
      rewritten: true,
      rewriteType: "repair_pass",
    },
  ];

  // 3) Optional model rewrite
  if (enableModelRewrite) {
    try {
      const rewritePrompt = buildRewritePrompt({
        latestUserMessage,
        previousAssistantReply,
        badDraft: draft,
        reasons: score1.reasons,
      });

      const rewritten = await modelGenerate({
        systemPrompt,
        messages: [
          ...conversationMessages,
          { role: "system", content: rewritePrompt },
        ],
      });

      const score3 = scoreReply({
        reply: rewritten,
        latestUserMessage,
        previousAssistantReply,
        turnIndex,
        userStateOverride: userState,
      });

      candidates.push({
        type: "model_rewrite",
        reply: rewritten,
        quality: score3,
        rewritten: true,
        rewriteType: "model_rewrite",
      });
    } catch (err) {
      candidates.push({
        type: "model_rewrite_error",
        reply: "",
        quality: {
          total: 0,
          breakdown: {},
          reasons: ["model_rewrite_failed"],
          shouldRewrite: false,
          shouldDiscard: true,
        },
        rewritten: true,
        rewriteType: "model_rewrite_error",
      });
    }
  }

  const ranked = rankCandidates(
    candidates.filter((c) => c.reply && !c.quality.shouldDiscard)
  );

  if (ranked.length) {
    const best = ranked[0];

    if (best.quality.total >= thresholds.REWRITE_THRESHOLD) {
      logTalkioEvent({
  latestUserMessage,
  draftReply: draft,
  finalReply: best.reply,
  scoreBefore: score1,
  scoreAfter: best.quality,
  rewriteUsed: best.rewritten,
  rewriteType: best.rewriteType,
  reasons: best.quality.reasons,
  userState,
});
      return {
        reply: best.reply,
        quality: best.quality,
        rewritten: best.rewritten,
        rewriteType: best.rewriteType,
        debug: {
          userState,
          candidateScores: candidates.map((c) => ({
            type: c.type,
            total: c.quality.total,
            reasons: c.quality.reasons,
          })),
        },
      };
    }
  }

  // 4) Final fallback
  const fallback = buildFallbackReply(latestUserMessage);
  const fallbackScore = scoreReply({
    reply: fallback,
    latestUserMessage,
    previousAssistantReply,
    turnIndex,
    userStateOverride: userState,
  });

  logTalkioEvent({
  latestUserMessage,
  draftReply: draft,
  finalReply: fallback,
  scoreBefore: score1,
  scoreAfter: fallbackScore,
  rewriteUsed: true,
  rewriteType: "fallback",
  reasons: ["fallback_used"],
  userState,
});

  return {
    reply: fallback,
    quality: fallbackScore,
    rewritten: true,
    rewriteType: "fallback_reply",
    debug: {
      userState,
      candidateScores: candidates.map((c) => ({
        type: c.type,
        total: c.quality.total,
        reasons: c.quality.reasons,
      })),
    },
  };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  generateTalkioReply,
  buildRewritePrompt,
};