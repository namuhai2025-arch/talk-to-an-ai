export const runtime = "nodejs";

import { corsEmpty, corsJson } from "./_cors";

const FIREBASE_FUNCTION_URL =
  "https://generatetalkioreply-ndury54xsq-uc.a.run.app";

const FIREBASE_TIMEOUT_MS = 45_000;

export async function OPTIONS(req: Request) {
  return corsEmpty(204, req);
}

export async function POST(req: Request) {
  const reply = (data: unknown, status = 200) => {
    return corsJson(data, { status, req });
  };

  try {
    const authHeader = req.headers.get("authorization") || "";

    if (!authHeader.startsWith("Bearer ")) {
      return reply(
        {
          error: "Unauthorized",
          reply: "",
        },
        401
      );
    }

    const rawBody = await req.text();
    let body: Record<string, unknown> = {};

    try {
      body = rawBody
        ? (JSON.parse(rawBody) as Record<string, unknown>)
        : {};
    } catch {
      return reply(
        {
          error: "Invalid JSON body",
          reply: "",
        },
        400
      );
    }

    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return reply(
        {
          error: "Invalid message",
          reply: "",
        },
        400
      );
    }

    const payload = {
      message,
      messages: Array.isArray(body.messages) ? body.messages : [],
      userTier:
        typeof body.userTier === "string" && body.userTier.trim()
          ? body.userTier.trim()
          : "free",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      FIREBASE_TIMEOUT_MS
    );

    let firebaseRes: Response;

    try {
      firebaseRes = await fetch(FIREBASE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          "x-talkio-app-key": process.env.INTERNAL_APP_KEY || "",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const rawText = await firebaseRes.text();

    let data: Record<string, any> = {};

    try {
      data = rawText
        ? (JSON.parse(rawText) as Record<string, any>)
        : {};
    } catch {
      console.error("Firebase returned non-JSON:", {
        status: firebaseRes.status,
        statusText: firebaseRes.statusText,
        rawText: rawText.slice(0, 1000),
      });

      return reply(
        {
          error: "Firebase returned non-JSON",
          reply: "",
          upstreamStatus: firebaseRes.status,
          rawText: rawText.slice(0, 500),
        },
        502
      );
    }

    if (!firebaseRes.ok) {
      console.error("Firebase function returned an error:", {
        status: firebaseRes.status,
        statusText: firebaseRes.statusText,
        error: data.error || null,
        details: data.details || null,
        reason: data.reason || null,
        path: data.path || null,
        model: data.model || null,
        analyticsType: data.analyticsType || null,
        fallbackTriggered: data.fallbackTriggered === true,
        rawText: rawText.slice(0, 1000),
      });
    }

    if (typeof data.reply !== "string" || !data.reply.trim()) {
      console.error("Firebase function returned no usable reply:", {
        status: firebaseRes.status,
        statusText: firebaseRes.statusText,
        error: data.error || null,
        details: data.details || null,
        reason: data.reason || null,
        path: data.path || null,
        model: data.model || null,
        analyticsType: data.analyticsType || null,
        fallbackTriggered: data.fallbackTriggered === true,
        rawText: rawText.slice(0, 1000),
      });
    }

    return reply(
      {
        reply:
          typeof data.reply === "string"
            ? data.reply
            : "",
        error: data.error || null,
        details: data.details || null,
        reason: data.reason || null,
        model: data.model || null,
        path: data.path || null,
        analyticsType: data.analyticsType || null,
        fallbackTriggered: data.fallbackTriggered === true,
        crisisLock: data.crisisLock === true,
        remainingDaily: data.remainingDaily ?? null,
        upstreamStatus: firebaseRes.status,
      },
      firebaseRes.status
    );
  } catch (error: unknown) {
    const details =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : {
            name: "UnknownError",
            message: String(error),
            stack: null,
          };

    const timedOut =
      error instanceof Error && error.name === "AbortError";

    console.error("Talkio /api/chat request failed:", {
      ...details,
      timedOut,
    });

    return reply(
      {
        error: timedOut
          ? "Upstream request timed out"
          : "Server error",
        reply: "",
        details: details.message,
        path: timedOut
          ? "api_chat_timeout"
          : "api_chat_exception",
      },
      timedOut ? 504 : 500
    );
  }
}