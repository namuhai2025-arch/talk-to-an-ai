"use strict";

/**
 * Smart Hybrid User State Detection
 * ---------------------------------
 * Flow:
 * 1. Run heuristic detection
 * 2. Score heuristic confidence
 * 3. Only escalate to model classifier when confidence is low
 */

const { detectUserState } = require("./responseScorer");
const { scoreHeuristicConfidence } = require("./stateConfidence");
const { buildUserStateClassifierPrompt } = require("./stateClassifierPrompt");

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function safeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function extractJson(raw = "") {
  const text = String(raw || "").trim();

  // Direct parse first
  try {
    return JSON.parse(text);
  } catch (_) {
    // continue
  }

  // Try to extract first JSON object block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const sliced = text.slice(start, end + 1);
    try {
      return JSON.parse(sliced);
    } catch (_) {
      return null;
    }
  }

  return null;
}

async function classifyUserStateWithModel({
  modelGenerate,
  latestUserMessage,
}) {
  if (typeof modelGenerate !== "function") return null;

  const prompt = buildUserStateClassifierPrompt(latestUserMessage);

  try {
    const raw = await modelGenerate({
      systemPrompt: "You are a classifier. Return valid JSON only.",
      messages: [{ role: "user", content: prompt }],
      options: {
        temperature: 0,
        maxOutputTokens: 120,
      },
    });

    const parsed = extractJson(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return {
      intent: safeEnum(
        parsed.intent,
        ["venting", "advice", "comfort", "casual", "playful", "testing", "withdrawn", "unclear"],
        "unclear"
      ),
      energy: safeEnum(
        parsed.energy,
        ["low", "normal", "high", "chaotic"],
        "normal"
      ),
      intensity: safeEnum(
        parsed.intensity,
        ["low", "medium", "high"],
        "medium"
      ),
      asksWhatToDo: safeBoolean(parsed.asksWhatToDo, false),
      overwhelmed: safeBoolean(parsed.overwhelmed, false),
      shortInput: safeBoolean(parsed.shortInput, false),
      lowEnergy: safeBoolean(parsed.lowEnergy, false),
      source: "model",
    };
  } catch (_) {
    return null;
  }
}

async function detectUserStateHybrid({
  latestUserMessage,
  modelGenerate,
}) {
  const heuristicState = detectUserState(latestUserMessage);

  const asksWhatToDoRegex =
  /what should i do|what do i do|what now|unsa akong buhaton|unsa man akong buhaton|ano gagawin ko|anong gagawin ko/i;

if (asksWhatToDoRegex.test(String(latestUserMessage || ""))) {
  heuristicState.asksWhatToDo = true;
}

  const confidenceMeta = scoreHeuristicConfidence({
    latestUserMessage,
    heuristicState,
  });

  // If heuristic confidence is good enough, use heuristic result
  if (!confidenceMeta.shouldEscalate) {
    return {
      ...heuristicState,
      intent: "unknown",
      energy: heuristicState.lowEnergy ? "low" : "normal",
      intensity: heuristicState.overwhelmed ? "high" : "medium",
      source: "heuristic",
      confidence: confidenceMeta.confidence,
      confidenceReasons: confidenceMeta.reasons,
      escalatedToModel: false,
    };
  }

  // Otherwise escalate to model classification
  const modelState = await classifyUserStateWithModel({
    modelGenerate,
    latestUserMessage,
  });

  if (modelState) {
    return {
      ...modelState,
      confidence: confidenceMeta.confidence,
      confidenceReasons: confidenceMeta.reasons,
      escalatedToModel: true,
    };
  }

  // Final fallback if model classification fails
  return {
    ...heuristicState,
    intent: "unknown",
    energy: heuristicState.lowEnergy ? "low" : "normal",
    intensity: heuristicState.overwhelmed ? "high" : "medium",
    source: "heuristic_fallback_after_model_fail",
    confidence: confidenceMeta.confidence,
    confidenceReasons: confidenceMeta.reasons,
    escalatedToModel: true,
  };
}

module.exports = {
  detectUserStateHybrid,
  classifyUserStateWithModel,
};