"use strict";

const {
  WEEKLY_REFLECTION_SYSTEM_PROMPT,
  buildWeeklyReflectionUserPrompt,
} = require("./reflectionPrompt");
const { prepareWeeklyConversation } = require("./reflectionAnalyzer");
const {
  loadMessagesForPeriod,
  getWeeklyReflection,
  saveWeeklyReflection,
} = require("./reflectionStorage");

const DEFAULT_MODEL = "gemini-3.5-flash";

function datePartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

function zonedLocalDateTimeToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  // Iterative conversion handles daylight-saving offsets without external packages.
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = datePartsInTimeZone(new Date(utcMs), timeZone);
    const representedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      0,
      0
    );

    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    utcMs += targetAsUtc - representedAsUtc;
  }

  return new Date(utcMs);
}

function addDaysToDateParts({ year, month, day }, days) {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function isoLocalDate(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getPreviousLocalWeekBounds(timeZone, now = new Date()) {
  const current = datePartsInTimeZone(now, timeZone);
  const currentDate = {
    year: Number(current.year),
    month: Number(current.month),
    day: Number(current.day),
  };

  // This function is intended to run Monday local time.
  const endLocal = currentDate;
  const startLocal = addDaysToDateParts(endLocal, -7);
  const displayEndLocal = addDaysToDateParts(endLocal, -1);

  return {
    startUtc: zonedLocalDateTimeToUtc(startLocal, timeZone),
    endUtc: zonedLocalDateTimeToUtc(endLocal, timeZone),
    periodStart: isoLocalDate(startLocal),
    periodEnd: isoLocalDate(displayEndLocal),
    reflectionId: `${isoLocalDate(startLocal)}_${isoLocalDate(displayEndLocal)}`,
  };
}

function shouldGenerateInCurrentHour(timeZone, now = new Date()) {
  try {
    const parts = datePartsInTimeZone(now, timeZone);
    return parts.weekday === "Mon" && Number(parts.hour) === 0;
  } catch {
    return false;
  }
}

function stripCodeFences(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function clampString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function clampStringArray(value, maxItems, maxLength) {
  return Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string" && item.trim())
        .slice(0, maxItems)
        .map((item) => item.trim().slice(0, maxLength))
    : [];
}

function validateReflectionPayload(payload) {
  const reflection = {
    lookingBack: clampString(payload?.lookingBack, 1800),
    whatWeighedOnYou: clampStringArray(payload?.whatWeighedOnYou, 4, 180),
    whatHelped: clampStringArray(payload?.whatHelped, 4, 220),
    momentsThatMattered: clampStringArray(payload?.momentsThatMattered, 3, 240),
    somethingToCarryForward: clampString(payload?.somethingToCarryForward, 500),
    oneThingINoticed: clampString(payload?.oneThingINoticed, 500),
    language: clampString(payload?.language, 40) || "unknown",
  };

  if (
    !reflection.lookingBack ||
    !reflection.somethingToCarryForward ||
    !reflection.oneThingINoticed
  ) {
    throw new Error("Reflection model output is missing required fields");
  }

  return reflection;
}

async function callReflectionModel({ model, prompt }) {
  const { GoogleGenAI } = await import("@google/genai");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: WEEKLY_REFLECTION_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      temperature: 0.35,
    },
  });

  const rawText =
    typeof response?.text === "function"
      ? response.text()
      : typeof response?.text === "string"
        ? response.text
        : response?.candidates?.[0]?.content?.parts
            ?.map((part) => part?.text || "")
            .join("") || "";

  const parsed = JSON.parse(stripCodeFences(rawText));
  return validateReflectionPayload(parsed);
}

async function generateWeeklyReflectionForUser({
  uid,
  timezone = "UTC",
  nickname = "",
  now = new Date(),
  force = false,
  model = DEFAULT_MODEL,
}) {
  if (!uid) throw new Error("uid is required");

  let safeTimezone = timezone || "UTC";
  try {
    datePartsInTimeZone(now, safeTimezone);
  } catch {
    safeTimezone = "UTC";
  }

  const bounds = getPreviousLocalWeekBounds(safeTimezone, now);
  const existing = await getWeeklyReflection(uid, bounds.reflectionId);

  if (existing?.status === "ready" && !force) {
    return { outcome: "already_exists", reflection: existing };
  }

  const messages = await loadMessagesForPeriod({
    uid,
    startUtc: bounds.startUtc,
    endUtc: bounds.endUtc,
  });

  const prepared = prepareWeeklyConversation(messages);

  if (!prepared.eligible) {
    const data = {
      status: "insufficient_activity",
      timezone: safeTimezone,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      sourceMessageCount: prepared.messageCount,
      sourceUserMessageCount: prepared.userMessageCount,
      generatedAt: new Date().toISOString(),
      schemaVersion: 1,
    };

    await saveWeeklyReflection({ uid, reflectionId: bounds.reflectionId, data });
    return { outcome: "insufficient_activity", reflection: { id: bounds.reflectionId, ...data } };
  }

  await saveWeeklyReflection({
    uid,
    reflectionId: bounds.reflectionId,
    data: {
      status: "generating",
      timezone: safeTimezone,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      sourceMessageCount: prepared.messageCount,
      sourceUserMessageCount: prepared.userMessageCount,
      generationStartedAt: new Date().toISOString(),
      schemaVersion: 1,
    },
  });

  try {
    const prompt = buildWeeklyReflectionUserPrompt({
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      conversationText: prepared.conversationText,
      nickname,
    });

    const reflectionContent = await callReflectionModel({ model, prompt });

    const data = {
      ...reflectionContent,
      status: "ready",
      timezone: safeTimezone,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      generatedAt: new Date().toISOString(),
      sourceMessageCount: prepared.messageCount,
      sourceUserMessageCount: prepared.userMessageCount,
      model,
      schemaVersion: 1,
    };

    await saveWeeklyReflection({ uid, reflectionId: bounds.reflectionId, data });
    return { outcome: "generated", reflection: { id: bounds.reflectionId, ...data } };
  } catch (error) {
    await saveWeeklyReflection({
      uid,
      reflectionId: bounds.reflectionId,
      data: {
        status: "failed",
        timezone: safeTimezone,
        periodStart: bounds.periodStart,
        periodEnd: bounds.periodEnd,
        failedAt: new Date().toISOString(),
        errorCode: "generation_failed",
        schemaVersion: 1,
      },
    });
    throw error;
  }
}

module.exports = {
  DEFAULT_MODEL,
  shouldGenerateInCurrentHour,
  getPreviousLocalWeekBounds,
  generateWeeklyReflectionForUser,
};