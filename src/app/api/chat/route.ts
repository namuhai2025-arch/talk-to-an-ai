export const runtime = "nodejs";

import { corsEmpty, corsJson } from "./_cors";

const FIREBASE_FUNCTION_URL =
  "https://generatetalkioreply-ndury54xsq-uc.a.run.app";

export async function OPTIONS(req: Request) {
  return corsEmpty(204, req);
}

export async function POST(req: Request) {
  const reply = (data: any, status = 200) => {
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
    let body: any = {};

    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = {};
    }

    const message =
      typeof body?.message === "string" ? body.message.trim() : "";

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
      messages: Array.isArray(body?.messages) ? body.messages : [],
      userTier:
        typeof body?.userTier === "string" && body.userTier.trim()
          ? body.userTier
          : "free",
    };

    const firebaseRes = await fetch(FIREBASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        "x-talkio-app-key": process.env.INTERNAL_APP_KEY || "",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

        const rawText = await firebaseRes.text();

    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      console.error("Firebase returned non-JSON:", {
        status: firebaseRes.status,
        rawText,
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

    return reply(
      {
        reply: typeof data?.reply === "string" ? data.reply : "",
        error: data?.error || null,
        model: data?.model || null,
        path: data?.path || null,
        crisisLock: data?.crisisLock === true,
        remainingDaily: data?.remainingDaily ?? null,
        upstreamStatus: firebaseRes.status,
      },
      firebaseRes.status
    );
  } catch (error: any) {
    return reply(
      {
        error: "Server error",
        reply: "",
        details: error?.message || String(error),
      },
      500
    );
  }
}