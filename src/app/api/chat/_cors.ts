import { NextResponse } from "next/server";

const DEFAULT_ORIGIN = "https://talkiochat.com";

const ALLOWED_ORIGINS = new Set<string>([
  "https://talkiochat.com",
  "https://www.talkiochat.com",

  // local dev
  "http://localhost:3000",
  "http://127.0.0.1:3000",

  // optional (if your mobile webview uses these)
  "capacitor://localhost",
  "ionic://localhost",
]);

function isAllowedOrigin(origin: string) {
  if (ALLOWED_ORIGINS.has(origin)) return true;

  // Optional: allow Vercel preview deployments
  // e.g. https://talkio-xyz.vercel.app
  try {
    const u = new URL(origin);
    if (u.hostname.endsWith(".vercel.app")) return true;
  } catch {}

  return false;
}

function pickOrigin(req?: Request) {
  const origin = req?.headers.get("origin") || "";
  if (origin && isAllowedOrigin(origin)) return origin;

  // If no Origin header, do NOT echo something random.
  // For no-origin requests, returning DEFAULT_ORIGIN is fine.
  return DEFAULT_ORIGIN;
}

export function corsHeadersFor(req?: Request) {
  const origin = pickOrigin(req);

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  } as const;
}

export function corsJson(
  data: any,
  init?: { status?: number; headers?: HeadersInit; req?: Request }
) {
  const base = corsHeadersFor(init?.req);
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: {
      ...base,
      ...(init?.headers ?? {}),
    },
  });
}

export function corsEmpty(status = 204, req?: Request, extraHeaders?: HeadersInit) {
  return new Response(null, {
    status,
    headers: {
      ...corsHeadersFor(req),
      ...(extraHeaders ?? {}),
    },
  });
}