export const runtime = "nodejs";

import { corsEmpty, corsJson } from "../chat/_cors";

const FIREBASE_BOOTSTRAP_URL =
  "https://us-central1-talkio-production.cloudfunctions.net/bootstrapTalkioMemory";

export async function OPTIONS(req: Request) {
  return corsEmpty(204, req);
}

export async function GET(req: Request) {
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

    const firebaseRes = await fetch(FIREBASE_BOOTSTRAP_URL, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "x-talkio-app-key": process.env.INTERNAL_APP_KEY || "",
      },
      cache: "no-store",
    });

    const rawText = await firebaseRes.text();

    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }

    if (!firebaseRes.ok) {
      return reply(
        {
          error: data?.error || "Bootstrap upstream error",
          reply:
            data?.reply ||
            "Something went wrong while loading your profile.",
        },
        firebaseRes.status
      );
    }

    return reply(data, 200);
  } catch (error: any) {
    console.error("Bootstrap route error:", error);

    return reply(
      {
        error: "Server error",
        reply: "Something went wrong while loading your profile.",
      },
      500
    );
  }
}