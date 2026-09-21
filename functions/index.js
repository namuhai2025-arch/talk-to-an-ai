"use strict";

import admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { createRequire } from "module";
import { GoogleGenAI } from "@google/genai";
import { getApps, initializeApp } from "firebase-admin/app";

const require = createRequire(import.meta.url);
const logger = require("firebase-functions/logger");
const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const { db } = require("./lib/firebase");
const {
  generateTalkioReply: generateTalkioReplyEngine,
} = require("./talkio/generateTalkioReply");
const { BASE_SYSTEM_PROMPT } = require("./talkio/prompts");

if (getApps().length === 0) {
  initializeApp();
}

console.log("generateTalkioReplyEngine type:", typeof generateTalkioReplyEngine);

const ENGINE_SECRET = process.env.ENGINE_SECRET || "intel-engine-super-secret-2026";

export const generateTalkioReply = async (req, res) => {
  // Enforce operator key
  const requestSecret = req.headers["x-engine-secret"];
  if (requestSecret !== ENGINE_SECRET) {
    return res.status(403).json({ error: "Access denied: Unauthorized engine invocation." });
  }

  // ... existing AI handling logic ...
};

// ==============================
// Configuration & Limits
// ==============================

const ACTIVE_MODEL = "gemini-3.1-pro-preview";
const INTERNAL_APP_KEY = process.env.INTERNAL_APP_KEY;

const TALKIO_LIMITS = {
  free: { daily: 100, perMinute: 30 },
  workspace: { daily: 10000, perMinute: 300 },
  elite: { daily: 50000, perMinute: 600 },
};

function getLimitsForAccess(access = {}) {
  const plan = access?.plan || "workspace";
  const config = TALKIO_LIMITS[plan] || TALKIO_LIMITS.workspace;

  return {
    dailyLimit: config.daily,
    perMinuteLimit: config.perMinute,
    limitLabel: plan,
    bypassIpLimits: true,
  };
}

const getTalkioPlan = () => ({ plan: "workspace", bypassIpLimits: true });

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

async function getUserAccessProfile(uid, decodedToken = {}) {
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  const email = normalizeEmail(decodedToken?.email || "");

  if (!snap.exists) {
    const created = {
      uid,
      email,
      plan: "workspace",
      role: "admin",
      subscriptionStatus: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await userRef.set(created, { merge: true });
    return created;
  }

  const data = snap.data() || {};
  const update = {
    uid,
    email: email || data.email || "",
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await userRef.set(update, { merge: true });

  return {
    uid,
    email: update.email,
    plan: data.plan || "workspace",
    role: data.role || "admin",
    subscriptionStatus: data.subscriptionStatus || "active",
  };
}

// ==============================
// Utilities & Security
// ==============================

function logInfo(event, data = {}) {
  logger.info(event, { timestamp: new Date().toISOString(), data });
}

function logWarn(event, data = {}) {
  logger.warn(event, { timestamp: new Date().toISOString(), data });
}

function logError(event, error, data = {}) {
  logger.error(event, {
    timestamp: new Date().toISOString(),
    message: error?.message || String(error),
    stack: error?.stack || null,
    data,
  });
}

function sha1(s) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"] || "";
  const first = String(xf).split(",")[0]?.trim();
  return first || "0.0.0.0";
}

function getUa(req) {
  return req.headers["user-agent"] || "";
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice(7).trim();
}

async function requireVerifiedUser(req) {
  const idToken = extractBearerToken(req);
  if (!idToken) {
    const err = new Error("Missing auth token");
    err.statusCode = 401;
    throw err;
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch {
    const err = new Error("Invalid auth token");
    err.statusCode = 401;
    throw err;
  }

  const uid = decoded?.uid || "";
  if (!uid) {
    const err = new Error("Invalid authenticated user");
    err.statusCode = 401;
    throw err;
  }

  return { uid, decoded };
}

function getAllowedOrigins() {
  return [
    "https://intel-personal.vercel.app",
    "https://talkiochat.com",
    "https://www.talkiochat.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];
}

// ==============================
// Super-Intelligence System Prompt
// ==============================

const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;

function buildRuntimeSystemPrompt({ languageMeta } = {}) {
  return [
    SYSTEM_PROMPT,
    languageMeta?.mirrorInstruction
      ? `LANGUAGE INSTRUCTION: ${languageMeta.mirrorInstruction}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ==========================================
// 🚀 WORKSPACE MODEL EXECUTION & MULTIMODAL
// ==========================================

function buildConversationMessages(messages, latestUserMessage, attachments = []) {
  const safeMessages = Array.isArray(messages)
    ? messages
        .filter(
          (m) =>
            m &&
            ["user", "assistant", "system"].includes(m.role) &&
            (typeof m.content === "string" || m.attachments?.length || m.attachment)
        )
        .map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content.trim() : "",
          attachments: Array.isArray(m.attachments)
            ? m.attachments
            : m.attachment
            ? [m.attachment]
            : [],
        }))
    : [];

  const lastItem = safeMessages[safeMessages.length - 1];
  const currentAttachments = Array.isArray(attachments) ? attachments : [];

  if (
    !lastItem ||
    lastItem.role !== "user" ||
    lastItem.content !== latestUserMessage ||
    (currentAttachments.length > 0 && (!lastItem.attachments || lastItem.attachments.length === 0))
  ) {
    safeMessages.push({
      role: "user",
      content: latestUserMessage || "",
      attachments: currentAttachments,
    });
  }

  return safeMessages;
}

async function generateModelText({ ai, model, systemPrompt, messages }) {
  try {
    const contents = (Array.isArray(messages) ? messages : []).map((m) => {
      const parts = [];

      // Multimodal payload handling: supports up to 15 images/files
      const fileList = Array.isArray(m.attachments)
        ? m.attachments
        : m.attachment
        ? [m.attachment]
        : [];

      for (const file of fileList) {
        if (file && file.base64) {
          parts.push({
            inlineData: {
              mimeType: file.mimeType || "image/png",
              data: file.base64,
            },
          });
        }
      }

      if (m.content || parts.length === 0) {
        parts.push({
          text: String(m.content || "Inspect and analyze the attached files."),
        });
      }

      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    });

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
    });

    let text = "";
    if (typeof response?.text === "function") {
      text = response.text();
    } else if (typeof response?.text === "string") {
      text = response.text;
    } else if (Array.isArray(response?.candidates?.[0]?.content?.parts)) {
      text = response.candidates[0].content.parts
        .map((p) => (typeof p?.text === "string" ? p.text : ""))
        .join(" ");
    }

    text = String(text || "").trim();

    logger.info("gemini_extracted_text", {
      model,
      length: text.length,
      finishReason: response?.candidates?.[0]?.finishReason || null,
    });

    return text;
  } catch (e) {
    const realMessage = e?.message || e?.error?.message || JSON.stringify(e);
    logger.error("MODEL_ERROR_FULL", {
      model,
      realMessage,
      code: e?.code || e?.status || null,
    });
    throw new Error(`generate_model_text_failed: ${realMessage}`);
  }
}

// ==========================================
// ⚡ MAIN WORKSPACE ENTRY POINT
// ==========================================

export const generateTalkioReply = onRequest(
  {
    cors: true,
  },
  async (req, res) => {
    let body = {};
    const uid = "personal-workspace-user";

    try {
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      body = req.body || {};

      const latestUserMessage =
        typeof body.message === "string" ? body.message.trim() : "";

      // Support multi-file payload
      const rawAttachments = Array.isArray(body?.attachments)
        ? body.attachments
        : body?.attachment
        ? [body.attachment]
        : [];

      if (!latestUserMessage && rawAttachments.length === 0) {
        res.status(400).json({
          error: "Missing message or attachments",
          reply: "Please provide a query or attach a file.",
        });
        return;
      }

      const conversationMessages = buildConversationMessages(
        body.messages,
        latestUserMessage,
        rawAttachments
      );

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = ACTIVE_MODEL;

      // Invoke the direct workspace engineering engine
      const result = await generateTalkioReplyEngine({
        uid,
        conversationMessages,
        latestUserMessage,
        modelGenerate: async ({ systemPrompt, messages }) => {
          return await generateModelText({
            ai,
            model,
            systemPrompt,
            messages,
          });
        },
      });

      const finalReply = result?.reply || "";
      const replyPath = result?.path || "workspace_success";

      logInfo("workspace_reply_dispatched", {
        uid,
        model,
        path: replyPath,
        outputLength: finalReply.length,
      });

      res.status(200).json({
        reply: finalReply,
        safety: result?.safety || {
          riskLevel: "none",
          category: "none",
          shouldRedirect: false,
          recommendedMode: "normal",
          reason: "workspace_safe",
        },
        action: "show_reply",
        blocked: false,
        safetyBlocked: false,
        crisisLock: false,
        model,
        path: replyPath,
        fallbackTriggered: false,
        remainingDaily: 999999,
      });
    } catch (error) {
      logError("workspace_backend_error", error, { uid });

      res.status(500).json({
        error: "Server error",
        reply: `Workspace Engine Exception: ${error?.message || String(error)}`,
        safety: {
          riskLevel: "none",
          category: "none",
          shouldRedirect: false,
          recommendedMode: "normal",
          reason: "backend_error",
        },
        action: "show_reply",
        blocked: false,
        safetyBlocked: false,
        crisisLock: false,
        path: "handler_error",
        fallbackTriggered: true,
      });
    }
  }
);