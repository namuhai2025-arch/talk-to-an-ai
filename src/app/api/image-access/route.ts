export const runtime = "nodejs";

import { corsEmpty, corsJson } from "../chat/_cors";

const IMAGE_ACCESS_URL =
  "https://us-central1-talkio-production.cloudfunctions.net/getTalkioImageAccess";

export async function OPTIONS(req: Request) {
  return corsEmpty(204, req);
}

export async function POST(req: Request) {
  const reply = (data: unknown, status = 200) => {
    const response = corsJson(data, { status, req });
    response.headers.set("Cache-Control", "no-store");
    return response;
  };

  const authorization =
    req.headers.get("authorization") || "";

  if (
    !authorization.startsWith("Bearer ") ||
    !authorization.slice(7).trim()
  ) {
    return reply(
      {
        code: "UNAUTHORIZED",
        error: "Please sign in again.",
      },
      401,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    25_000,
  );

  try {
    // Firebase verifies the user's token.
    // No client-supplied tier or UID is forwarded.
    const upstream = await fetch(IMAGE_ACCESS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: "{}",
      cache: "no-store",
      signal: controller.signal,
    });

    let data: unknown;

    try {
      data = await upstream.json();
    } catch {
      return reply(
        {
          code: "IMAGE_ACCESS_INVALID_RESPONSE",
          error: "Unable to check image access. Please try again.",
          retryable: true,
        },
        502,
      );
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      return reply(
        {
          code: "IMAGE_ACCESS_INVALID_RESPONSE",
          error: "Unable to check image access. Please try again.",
          retryable: true,
        },
        502,
      );
    }

    return reply(data, upstream.status);
  } catch (error: unknown) {
    const timedOut = controller.signal.aborted;

    console.error("Image access request failed", {
      timedOut,
      name:
        error instanceof Error
          ? error.name
          : "UnknownError",
    });

    return reply(
      {
        code: timedOut
          ? "IMAGE_ACCESS_TIMEOUT"
          : "IMAGE_ACCESS_UNAVAILABLE",
        error: "Unable to check image access. Please try again.",
        retryable: true,
      },
      timedOut ? 504 : 503,
    );
  } finally {
    clearTimeout(timeout);
  }
}
