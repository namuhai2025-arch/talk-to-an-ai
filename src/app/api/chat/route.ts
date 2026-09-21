import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const runtime = "nodejs";

const AUTHORIZED_EMAIL = "lacidamuriel@gmail.com";
const CLOUD_RUN_URL = "https://generatetalkioreply-cf6feywhrq-uc.a.run.app";
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "intel-personal";
const ENGINE_SECRET = process.env.ENGINE_SECRET || "intel-engine-super-secret-2026";

// Model tiers
const MODEL_PRO = "gemini-3.1-pro-preview";
const MODEL_FLASH = "gemini-2.5-flash";

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

/**
 * Sliding-window context pruning:
 * Preserves the initial task kickoff (index 0) + the trailing 8 interaction turns.
 */
function pruneMessageHistory(messages: any[] = []) {
  if (!Array.isArray(messages) || messages.length <= 8) {
    return messages;
  }

  const rootMessage = messages[0];
  const trailingMessages = messages.slice(-8);

  const hasRootDuplicate = trailingMessages.some(
    (m) => m.timestamp === rootMessage.timestamp
  );

  return hasRootDuplicate ? trailingMessages : [rootMessage, ...trailingMessages];
}

/**
 * Dynamic tier selection:
 * Elevates to Pro for attachments, complex prompts, or manual trigger keywords.
 */
function determineModelTier(prompt: string, attachments: any[] = []): string {
  const normalized = prompt.toLowerCase();

  // Manual override: include '!pro' or '/pro' anywhere in prompt
  if (normalized.includes("!pro") || normalized.includes("/pro")) {
    return MODEL_PRO;
  }

  // Vision or binary analysis always targets Pro
  if (Array.isArray(attachments) && attachments.length > 0) {
    return MODEL_PRO;
  }

  // Complexity heuristics: markdown blocks, long contexts, architectural patterns
  const isDeepDive =
    prompt.length > 600 ||
    prompt.includes("```") ||
    /\b(refactor|architecture|schema|interface|type-safe|benchmark|optimize|vulnerability)\b/i.test(prompt);

  return isDeepDive ? MODEL_PRO : MODEL_FLASH;
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
    if (
      typeof payload.email !== "string" ||
      payload.email.toLowerCase() !== AUTHORIZED_EMAIL.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "Forbidden: Unauthorized operator." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const rawPrompt = typeof body.message === "string" ? body.message : "";
    const cleanPrompt = rawPrompt.replace(/^[!/](pro)\s*/i, "").trim();

    // Optimize payload before network dispatch
    const prunedMessages = pruneMessageHistory(body.messages);
    const targetModel = determineModelTier(rawPrompt, body.attachments);

    const optimizedPayload = {
      ...body,
      message: cleanPrompt || rawPrompt,
      messages: prunedMessages,
      model: targetModel,
    };

    // 2. Dispatch to Cloud Run with pre-shared engine key
    const backendRes = await fetch(CLOUD_RUN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-engine-secret": ENGINE_SECRET,
      },
      body: JSON.stringify(optimizedPayload),
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