export const runtime = "nodejs";

import crypto from "crypto";
import { corsEmpty, corsJson } from "./_cors";

const FIREBASE_FUNCTION_URL =
  "https://generatetalkioreply-ndury54xsq-uc.a.run.app";

function parseCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const parts = cookie.split(";").map((p) => p.trim());
  const found = parts.find((p) => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : "";
}

function newSessionId() {
  return crypto.randomBytes(16).toString("hex");
}

function buildSetCookie(sessionId: string) {
  const maxAge = 60 * 60 * 24 * 180;
  const isProd = process.env.NODE_ENV === "production";

  return `talkio_sid=${encodeURIComponent(
    sessionId
  )}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${
    isProd ? "; Secure" : ""
  }`;
}

export async function OPTIONS(req: Request) {
  return corsEmpty(204, req);
}

export async function POST(req: Request) {
  const cookieSid = parseCookie(req, "talkio_sid");
  let setCookieHeader: string | null = null;

  if (!cookieSid) {
    setCookieHeader = buildSetCookie(newSessionId());
  }

  const reply = (data: any, status = 200) => {
    const headers: Record<string, string> = {};

    if (setCookieHeader) headers["Set-Cookie"] = setCookieHeader;

    return corsJson(data, { status, headers, req });
  };

  try {
    const body = await req.json().catch(() => ({}));

    const message =
      typeof body?.message === "string" ? body.message.trim() : "";

    if (!message) {
      return reply({
        error: "Invalid message",
        reply: "Please type a message.",
      }, 400);
    }

    const payload = {
      message,
      history: Array.isArray(body?.history) ? body.history : [],
      anonymousId: body?.anonymousId || null,
      accountUserId: body?.accountUserId || null,
      memory: body?.memory || {},
      userTier: body?.userTier || "free",
    };

    const firebaseRes = await fetch(FIREBASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-talkio-app-key": process.env.INTERNAL_APP_KEY || "",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await firebaseRes.json();

    return reply(data, firebaseRes.status);
  } catch (error) {
    console.error("Chat route error:", error);

    return reply(
      {
        error: "Server error",
        reply: "Something went wrong on my end. Please try again.",
      },
      500
    );
  }
}