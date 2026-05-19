"use strict";

const {
  BEHAVIORAL_SAFETY_ANALYSIS_PROMPT,
} = require("./prompts");

function safeJsonParse(text, fallback = null) {
  try {
    if (!text) return fallback;

    const cleaned = String(text)
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned);
  } catch (err) {
    console.error("behavioral_safety_json_parse_failed", err?.message || err);
    return fallback;
  }
}

async function analyzeBehavioralSafety({ modelGenerate, latestUserMessage }) {
  const fallback = {
    riskLevel: "none",
    category: "none",
    shouldRedirect: false,
    recommendedMode: "normal",
    reason: "fallback_no_analysis",
  };

  try {
    if (!String(latestUserMessage || "").trim()) return fallback;

    const raw = await modelGenerate({
      systemPrompt: BEHAVIORAL_SAFETY_ANALYSIS_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze this latest user message only:

"""${String(latestUserMessage).slice(0, 4000)}"""`,
        },
      ],
    });

    const text =
      typeof raw === "string"
        ? raw
        : raw?.text ||
          raw?.reply ||
          raw?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join(" ") ||
          raw?.choices?.[0]?.message?.content ||
          "";

    const parsed = safeJsonParse(text, fallback);

    if (!parsed || typeof parsed !== "object") {
  return fallback;
}

    return {
      riskLevel: parsed?.riskLevel || "none",
      category: parsed?.category || "none",
      shouldRedirect: Boolean(parsed?.shouldRedirect),
      recommendedMode: parsed?.recommendedMode || "normal",
      reason: parsed?.reason || "no_reason",
    };
  } catch (err) {
    console.error("analyze_behavioral_safety_failed", err?.message || err);
    return fallback;
  }
}

module.exports = {
  analyzeBehavioralSafety,
};