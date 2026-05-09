export const runtime = "nodejs";

import { corsEmpty, corsJson } from "../chat/_cors";

const FIREBASE_PROFILE_URL =
  "https://us-central1-talkio-production.cloudfunctions.net/saveTalkioProfile";

export async function OPTIONS(req: Request) {
  return corsEmpty(204, req);
}

export async function POST(req: Request) {
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

    const body = await req.json().catch(() => ({}));

    const nickname =
      typeof body?.nickname === "string" ? body.nickname.trim().slice(0, 40) : "";

    const timezone =
      typeof body?.timezone === "string" ? body.timezone.trim().slice(0, 80) : "";

    const fcmToken =
      typeof body?.fcmToken === "string" ? body.fcmToken.trim().slice(0, 500) : "";

    console.log("PROFILE_INTERNAL_KEY_DEBUG", {
      hasKey: Boolean(process.env.INTERNAL_APP_KEY),
      keyLength: process.env.INTERNAL_APP_KEY?.length || 0,
      });

    const firebaseRes = await fetch(FIREBASE_PROFILE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        "x-talkio-app-key": process.env.INTERNAL_APP_KEY || "",
      },
      body: JSON.stringify({
        nickname,
        timezone,
        fcmToken,
      }),
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
          error: data?.error || "Profile upstream error",
          reply:
            data?.reply ||
            "Something went wrong while saving your profile.",
        },
        firebaseRes.status
      );
    }

    return reply(data, 200);
  } catch (error: any) {
    console.error("Profile route error:", error);

    return reply(
      {
        error: "Server error",
        reply: "Something went wrong while saving your profile.",
      },
      500
    );
  }
}