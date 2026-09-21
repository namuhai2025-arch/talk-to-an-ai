import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const runtime = "nodejs";

const AUTHORIZED_EMAIL = "lacidamuriel@gmail.com";
const CLOUD_RUN_URL = "https://generatetalkioreply-cf6feywhrq-uc.a.run.app";
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "intel-personal";
const ENGINE_SECRET = process.env.ENGINE_SECRET || "intel-engine-super-secret-2026";

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

async function verifyFirebaseToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });
  return payload;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const clientToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!clientToken) {
      return NextResponse.json(
        { error: "Access Denied: Missing authentication token." },
        { status: 401 }
      );
    }

    // 1. Strict operator verification
    const payload = await verifyFirebaseToken(clientToken);
    if (typeof payload.email !== "string" || payload.email.toLowerCase() !== AUTHORIZED_EMAIL.toLowerCase()) {
      return NextResponse.json(
        { error: "Forbidden: Unauthorized operator." },
        { status: 403 }
      );
    }

    const body = await req.json();

    // 2. Dispatch to Cloud Run with pre-shared engine key
    const backendRes = await fetch(CLOUD_RUN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-engine-secret": ENGINE_SECRET,
      },
      body: JSON.stringify(body),
    });

    if (!backendRes.ok) {
      const errorText = await backendRes.text();
      return NextResponse.json(
        { error: `Backend engine error: ${errorText}` },
        { status: backendRes.status }
      );
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unauthorized request rejected." },
      { status: 401 }
    );
  }
}