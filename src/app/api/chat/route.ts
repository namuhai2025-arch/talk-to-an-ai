export const runtime = "nodejs";

import { corsEmpty, corsJson } from "./_cors";

const FIREBASE_FUNCTION_URL =
  "https://generatetalkioreply-ndury54xsq-uc.a.run.app";

export async function OPTIONS(req: Request) {
  return corsEmpty(204, req);
}

export async function POST(req: Request) {
  console.log("🔥 ROUTE HIT");
  const reply = (data: any, status = 200) => {
    return corsJson(data, { status, req });
  };

  try {
    const authHeader = req.headers.get("authorization") || "";

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply(
        {
          error: "Unauthorized",
          reply: "Please sign in again and try once more.",
        },
        401
      );
    }

    const rawBody = await req.text();
    let body: any = {};

    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      console.error("chat route invalid JSON body:", rawBody);
      body = {};
    }

    console.log("chat route parsed body:", body);

    const message =
      typeof body?.message === "string" ? body.message.trim() : "";

    if (!message) {
      return reply(
        {
          error: "Invalid message",
          reply: "Please type a message.",
        },
        400
      );
    }

    const localTime =
      typeof body?.localTime === "string" ? body.localTime : "";

    const localDate =
      typeof body?.localDate === "string" ? body.localDate : "";

    const localWeekday =
      typeof body?.localWeekday === "string" ? body.localWeekday : "";

    const timeZone =
      typeof body?.timeZone === "string" ? body.timeZone : "unknown";

    const localHour =
      typeof body?.localHour === "number" ? body.localHour : null;

    const selectedMode =
      typeof body?.selectedMode === "string" ? body.selectedMode : "auto";

    const payload = {
      message,
      history: Array.isArray(body?.history) ? body.history : [],
      memory:
        body?.memory && typeof body.memory === "object" ? body.memory : {},
      userTier:
        typeof body?.userTier === "string" && body.userTier.trim()
          ? body.userTier
          : "free",
      selectedMode,
      localTime,
      localDate,
      localWeekday,
      timeZone,
      localHour,
    };

    console.log("🔥 calling firebase...");
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

    console.log("🔥 firebase response status:", firebaseRes.status);
    const rawText = await firebaseRes.text();

    let data: any;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {
        error: "Invalid upstream response",
        reply: "Something went wrong on my end. Please try again.",
        upstreamStatus: firebaseRes.status,
        upstreamBody: rawText,
      };
    }

    if (!firebaseRes.ok) {
      return reply(
        {
          error: data?.error || "Firebase upstream error",
          reply: data?.reply || "Firebase error",
          upstreamStatus: firebaseRes.status,
          upstreamBody: rawText,
          firebaseDetails: data?.details || null,
        },
        firebaseRes.status
      );
    }

    return reply(data, firebaseRes.status);
  } catch (error: any) {
    console.error("Chat route error:", error);

    return reply(
      {
        error: "Server error",
        reply: "ROUTE_CATCH_V2",
        details: error?.message || String(error),
      },
      500
    );
  }
}